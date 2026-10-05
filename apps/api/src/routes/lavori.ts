import { Prisma, StatoLavoro, StatoOrdine, TipoIncaricato } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export const lavoriRouter = Router();

const lavoroInclude = {
  montatore: { select: { id: true, nome: true, cognome: true, telefono: true } },
  ordine: {
    include: {
      cliente: { select: { id: true, nome: true, cognome: true, indirizzo: true, citta: true, telefono: true } },
      righe: { select: { id: true, descrizione: true, arrivoPrevisto: true, arrivoEffettivo: true }, orderBy: { posizione: "asc" } }
    }
  }
} as const;
type LavoroCompleto = Prisma.LavoroConsegnaGetPayload<{ include: typeof lavoroInclude }>;
type OrdinePerPiano = Pick<LavoroCompleto["ordine"], "id" | "stato" | "dataOrdine" | "righe">;

class ValidationError extends Error {}
class ConflictError extends Error {}
class NotFoundError extends Error {}

lavoriRouter.get("/", async (_request, response, next) => {
  try {
    const lavori = await prisma.lavoroConsegna.findMany({ include: lavoroInclude, orderBy: [{ dataInizio: "asc" }, { id: "asc" }] });
    response.json(lavori.map(serializeLavoro));
  } catch (error) { next(error); }
});

lavoriRouter.post("/", async (request, response, next) => {
  try {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Dati lavoro non validi.");
    const ordineId = parseId(body.ordineId);
    const input = parsePlan(body);
    const lavoro = await prisma.$transaction(async (tx) => {
      const ordine = await tx.ordine.findUnique({ where: { id: ordineId }, include: { righe: true, lavoroConsegna: true } });
      if (!ordine) throw new NotFoundError("Ordine non trovato.");
      if (ordine.lavoroConsegna) throw new ConflictError("Questo ordine ha già una consegna pianificata.");
      validatePlanDate(ordine, input.dataInizio);
      const assignment = await resolveAssignment(input.tipoIncaricato, input.montatoreId, tx);
      const created = await tx.lavoroConsegna.create({ data: {
        ordineId, ...assignment, dataInizio: input.dataInizio, giorni: input.giorni, note: input.note
      } });
      await tx.ordine.update({ where: { id: ordineId }, data: { dataConsegnaPrevista: input.dataInizio } });
      return tx.lavoroConsegna.findUniqueOrThrow({ where: { id: created.id }, include: lavoroInclude });
    });
    response.status(201).json(serializeLavoro(lavoro));
  } catch (error) { handleError(error, response, next); }
});

lavoriRouter.put("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const input = parsePlan(request.body);
    const lavoro = await prisma.$transaction(async (tx) => {
      const existing = await tx.lavoroConsegna.findUnique({ where: { id }, include: { ordine: { include: { righe: true } } } });
      if (!existing) throw new NotFoundError("Lavoro non trovato.");
      if (existing.stato !== StatoLavoro.PIANIFICATO) throw new ConflictError("Un lavoro completato non può essere ripianificato.");
      validatePlanDate(existing.ordine, input.dataInizio);
      const assignment = await resolveAssignment(input.tipoIncaricato, input.montatoreId, tx);
      await tx.lavoroConsegna.update({ where: { id }, data: {
        ...assignment, dataInizio: input.dataInizio, giorni: input.giorni, note: input.note
      } });
      await tx.ordine.update({ where: { id: existing.ordineId }, data: { dataConsegnaPrevista: input.dataInizio } });
      return tx.lavoroConsegna.findUniqueOrThrow({ where: { id }, include: lavoroInclude });
    });
    response.json(serializeLavoro(lavoro));
  } catch (error) { handleError(error, response, next); }
});

lavoriRouter.patch("/:id/completa", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Data di completamento obbligatoria.");
    const dataCompletamento = parseDate(body.dataCompletamento, "Data completamento");
    const lavoro = await prisma.$transaction(async (tx) => {
      const existing = await tx.lavoroConsegna.findUnique({ where: { id }, include: { ordine: { include: { righe: true } } } });
      if (!existing) throw new NotFoundError("Lavoro non trovato.");
      if (existing.stato !== StatoLavoro.PIANIFICATO || existing.ordine.stato === StatoOrdine.CONSEGNATO) {
        throw new ConflictError("Il lavoro risulta già completato.");
      }
      const righe = existing.ordine.righe;
      if (!righe.length || righe.some((riga) => !riga.arrivoEffettivo)) {
        throw new ConflictError("La consegna non può essere completata: non sono arrivati tutti i mobili.");
      }
      const ultimoArrivo = latestDate(righe.map((riga) => riga.arrivoEffettivo!));
      if (existing.dataInizio <= ultimoArrivo) {
        throw new ConflictError("La merce è arrivata dopo la data pianificata: ripianifica il lavoro prima di completarlo.");
      }
      if (dataCompletamento < existing.dataInizio || dataCompletamento <= ultimoArrivo) {
        throw new ValidationError("La data di completamento deve essere successiva all'arrivo della merce e non precedente all'inizio pianificato.");
      }
      await tx.lavoroConsegna.update({ where: { id }, data: { stato: StatoLavoro.COMPLETATO, dataCompletamento } });
      await tx.ordine.update({ where: { id: existing.ordineId }, data: {
        stato: StatoOrdine.CONSEGNATO, dataConsegnaEffettiva: dataCompletamento
      } });
      return tx.lavoroConsegna.findUniqueOrThrow({ where: { id }, include: lavoroInclude });
    });
    response.json(serializeLavoro(lavoro));
  } catch (error) { handleError(error, response, next); }
});

function parseId(value: unknown) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1) throw new ValidationError("ID non valido.");
  return id;
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${label}: data non valida.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError(`${label}: data non valida.`);
  return date;
}

function parsePlan(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Dati lavoro non validi.");
  const body = value as Record<string, unknown>;
  const dataInizio = parseDate(body.dataInizio, "Data consegna");
  const giorni = Number(body.giorni);
  if (!Number.isSafeInteger(giorni) || giorni < 1 || giorni > 365) throw new ValidationError("I giorni necessari devono essere tra 1 e 365.");
  if (body.tipoIncaricato !== TipoIncaricato.TITOLARE && body.tipoIncaricato !== TipoIncaricato.MONTATORE) {
    throw new ValidationError("Scegli Titolare o un montatore esterno.");
  }
  const tipoIncaricato = body.tipoIncaricato;
  const montatoreId = body.montatoreId === null || body.montatoreId === undefined || body.montatoreId === ""
    ? null : parseId(body.montatoreId);
  if (tipoIncaricato === TipoIncaricato.MONTATORE && montatoreId === null) throw new ValidationError("Seleziona un montatore esterno.");
  if (tipoIncaricato === TipoIncaricato.TITOLARE && montatoreId !== null) throw new ValidationError("Il titolare non richiede un montatore esterno.");
  if (body.note !== null && body.note !== undefined && typeof body.note !== "string") throw new ValidationError("Note non valide.");
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  return { dataInizio, giorni, tipoIncaricato, montatoreId, note };
}

function validatePlanDate(ordine: OrdinePerPiano, dataInizio: Date) {
  if (ordine.stato === StatoOrdine.BOZZA || ordine.stato === StatoOrdine.CONSEGNATO) {
    throw new ConflictError("Puoi pianificare solo un ordine confermato e non ancora consegnato.");
  }
  if (!ordine.righe.length) throw new ValidationError("L'ordine non contiene mobili.");
  const arrivals = ordine.righe.map((riga) => riga.arrivoEffettivo ?? riga.arrivoPrevisto);
  if (arrivals.some((value) => value === null)) {
    throw new ValidationError("Indica l'arrivo previsto di tutti i mobili ancora attesi prima di pianificare.");
  }
  const ultimoArrivo = latestDate(arrivals as Date[]);
  if (dataInizio <= ordine.dataOrdine || dataInizio <= ultimoArrivo) {
    throw new ValidationError("La consegna deve essere successiva all'ultimo arrivo previsto o effettivo della merce.");
  }
}

async function resolveAssignment(tipoIncaricato: TipoIncaricato, montatoreId: number | null, tx: Prisma.TransactionClient) {
  if (tipoIncaricato === TipoIncaricato.TITOLARE) {
    return { tipoIncaricato, montatoreId: null, costoGiornalieroApplicato: new Prisma.Decimal(0) };
  }
  const montatore = await tx.montatore.findUnique({ where: { id: montatoreId! } });
  if (!montatore) throw new NotFoundError("Montatore non trovato.");
  return { tipoIncaricato, montatoreId: montatore.id, costoGiornalieroApplicato: montatore.costoGiornaliero };
}

function latestDate(dates: Date[]) {
  return dates.reduce((latest, date) => date > latest ? date : latest);
}

function serializeLavoro(lavoro: LavoroCompleto) {
  const arrivi = lavoro.ordine.righe.map((riga) => riga.arrivoEffettivo ?? riga.arrivoPrevisto);
  const ultimaData = arrivi.every((date) => date !== null) && arrivi.length ? latestDate(arrivi as Date[]) : null;
  const tuttiArrivati = lavoro.ordine.righe.length > 0 && lavoro.ordine.righe.every((riga) => riga.arrivoEffettivo !== null);
  return {
    ...lavoro,
    costoGiornalieroApplicato: lavoro.costoGiornalieroApplicato.toFixed(2),
    costoTotale: lavoro.costoGiornalieroApplicato.mul(lavoro.giorni).toFixed(2),
    tuttiArrivati,
    daRipianificare: lavoro.stato === StatoLavoro.PIANIFICATO && ultimaData !== null && lavoro.dataInizio <= ultimaData,
    arrivoDaDefinire: lavoro.stato === StatoLavoro.PIANIFICATO && ultimaData === null
  };
}

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ValidationError) { response.status(400).json({ message: error.message }); return; }
  if (error instanceof ConflictError) { response.status(409).json({ message: error.message }); return; }
  if (error instanceof NotFoundError) { response.status(404).json({ message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") { response.status(409).json({ message: "L'ordine ha già un lavoro pianificato." }); return; }
    if (error.code === "P2025") { response.status(404).json({ message: "Ordine o lavoro non trovato." }); return; }
  }
  next(error);
}
