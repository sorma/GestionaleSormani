import { Prisma, StatoOrdine, StatoPreventivo } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { simplePdf } from "../lib/simplePdf.js";
import { categorieMobile, parseCategoria } from "../lib/categorieMobile.js";

export const preventiviRouter = Router();

const includePreventivo = {
  cliente: { select: { id: true, nome: true, cognome: true, indirizzo: true, citta: true, cap: true, provincia: true } },
  voci: { orderBy: { posizione: "asc" }, include: { opzioni: { include: { fornitore: { select: { id: true, nome: true } } }, orderBy: { id: "asc" } } } },
  ordine: { select: { id: true } }
} as const;
type PreventivoCompleto = Prisma.PreventivoGetPayload<{ include: typeof includePreventivo }>;
type VoceInput = { posizione: number; descrizione: string; categoria: import("@prisma/client").CategoriaMobile; quantita: number; opzioni: { fornitoreId: number; prezzoVendita: Prisma.Decimal }[] };

class ValidationError extends Error {}
class ConflictError extends Error {}
class NotFoundError extends Error {}

preventiviRouter.get("/", async (_request, response, next) => {
  try {
    const items = await prisma.preventivo.findMany({ include: includePreventivo, orderBy: [{ data: "desc" }, { id: "desc" }] });
    response.json(items.map(serializePreventivo));
  } catch (error) { next(error); }
});

preventiviRouter.get("/:id", async (request, response, next) => {
  try {
    const item = await prisma.preventivo.findUnique({ where: { id: parseId(request.params.id) }, include: includePreventivo });
    if (!item) throw new NotFoundError("Preventivo non trovato.");
    response.json(serializePreventivo(item));
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.post("/", async (request, response, next) => {
  try {
    const input = parsePreventivo(request.body);
    await ensureFornitori(input.voci);
    const item = await prisma.preventivo.create({
      data: {
        cliente: { connect: { id: input.clienteId } }, data: input.data, note: input.note,
        voci: { create: input.voci.map((voce) => ({
          posizione: voce.posizione, descrizione: voce.descrizione, categoria: voce.categoria, quantita: voce.quantita,
          opzioni: { create: voce.opzioni }
        })) }
      }, include: includePreventivo
    });
    response.status(201).json(serializePreventivo(item));
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.put("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const input = parsePreventivo(request.body);
    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.preventivo.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Preventivo non trovato.");
      if (existing.stato !== StatoPreventivo.BOZZA) throw new ConflictError("Si può modificare solo un preventivo in bozza.");
      await ensureFornitori(input.voci, tx);
      await tx.vocePreventivo.deleteMany({ where: { preventivoId: id } });
      return tx.preventivo.update({
        where: { id }, data: {
          cliente: { connect: { id: input.clienteId } }, data: input.data, note: input.note,
          voci: { create: input.voci.map((voce) => ({
            posizione: voce.posizione, descrizione: voce.descrizione, categoria: voce.categoria, quantita: voce.quantita,
            opzioni: { create: voce.opzioni }
          })) }
        }, include: includePreventivo
      });
    });
    response.json(serializePreventivo(item));
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.patch("/:id/stato", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Dati stato non validi.");
    const item = await prisma.$transaction(async (tx) => {
      const existing = await tx.preventivo.findUnique({ where: { id }, include: includePreventivo });
      if (!existing) throw new NotFoundError("Preventivo non trovato.");
      if (body.stato === StatoPreventivo.INVIATO && existing.stato === StatoPreventivo.BOZZA) {
        return tx.preventivo.update({ where: { id }, data: { stato: StatoPreventivo.INVIATO }, include: includePreventivo });
      }
      if (body.stato === StatoPreventivo.RIFIUTATO && existing.stato === StatoPreventivo.INVIATO) {
        return tx.preventivo.update({ where: { id }, data: { stato: StatoPreventivo.RIFIUTATO }, include: includePreventivo });
      }
      if (body.stato === StatoPreventivo.APPROVATO && existing.stato === StatoPreventivo.INVIATO) {
        const scelte = body.scelte;
        if (!Array.isArray(scelte) || scelte.length !== existing.voci.length) {
          throw new ValidationError("Scegli un'alternativa per ogni mobile.");
        }
        const selected = new Map<number, number>();
        for (const item of scelte) {
          if (!item || typeof item !== "object" || !Number.isSafeInteger(item.voceId) || !Number.isSafeInteger(item.opzioneId) || selected.has(item.voceId)) {
            throw new ValidationError("Scelte del preventivo non valide.");
          }
          selected.set(item.voceId, item.opzioneId);
        }
        for (const voce of existing.voci) {
          const optionId = selected.get(voce.id);
          if (!voce.opzioni.some((opzione) => opzione.id === optionId)) throw new ValidationError("Alternativa non appartenente al preventivo.");
          await tx.opzionePreventivo.updateMany({ where: { voceId: voce.id }, data: { scelta: false } });
          await tx.opzionePreventivo.update({ where: { id: optionId }, data: { scelta: true } });
        }
        return tx.preventivo.update({ where: { id }, data: { stato: StatoPreventivo.APPROVATO }, include: includePreventivo });
      }
      throw new ConflictError("Passaggio di stato non consentito.");
    });
    response.json(serializePreventivo(item));
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.post("/:id/converti", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Dati di conversione non validi.");
    const dataOrdine = parseDate(body.dataOrdine, "Data ordine");
    const dataConsegnaPrevista = parseDate(body.dataConsegnaPrevista, "Consegna prevista");
    if (dataConsegnaPrevista < dataOrdine) throw new ValidationError("La consegna prevista precede l'ordine.");
    if (!Array.isArray(body.costi)) throw new ValidationError("Indica il costo d'acquisto per ogni mobile.");
    const costi = new Map<number, Prisma.Decimal>();
    for (const raw of body.costi) {
      if (!raw || typeof raw !== "object" || !Number.isSafeInteger(raw.opzioneId) || costi.has(raw.opzioneId)) {
        throw new ValidationError("Costi d'acquisto non validi.");
      }
      costi.set(raw.opzioneId, parseMoney(raw.costoAcquistoUnitario, "Costo d'acquisto"));
    }
    const ordine = await prisma.$transaction(async (tx) => {
      const quote = await tx.preventivo.findUnique({ where: { id }, include: includePreventivo });
      if (!quote) throw new NotFoundError("Preventivo non trovato.");
      if (quote.stato !== StatoPreventivo.APPROVATO || quote.ordine) throw new ConflictError("Il preventivo non è approvato oppure è già stato convertito.");
      const chosen = quote.voci.map((voce) => {
        const options = voce.opzioni.filter((opzione) => opzione.scelta);
        if (options.length !== 1) throw new ValidationError("Scegli un'alternativa per ogni mobile.");
        return { voce, opzione: options[0] };
      });
      if (costi.size !== chosen.length || chosen.some(({ opzione }) => !costi.has(opzione.id))) {
        throw new ValidationError("Indica il costo d'acquisto di ciascuna alternativa scelta.");
      }
      const created = await tx.ordine.create({
        data: {
          clienteId: quote.clienteId, preventivoId: quote.id, dataOrdine, dataConsegnaPrevista,
          stato: StatoOrdine.CONFERMATO, note: quote.note,
          righe: { create: chosen.map(({ voce, opzione }, index) => ({
            posizione: index + 1, descrizione: voce.descrizione, categoria: voce.categoria, quantita: voce.quantita,
            fornitoreId: opzione.fornitoreId, prezzoUnitario: opzione.prezzoVendita,
            costoAcquistoUnitario: costi.get(opzione.id)!
          })) }
        }
      });
      await tx.preventivo.update({ where: { id }, data: { stato: StatoPreventivo.CONVERTITO } });
      return created;
    });
    response.status(201).json({ ordineId: ordine.id });
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.get("/:id/pdf", async (request, response, next) => {
  try {
    const item = await prisma.preventivo.findUnique({ where: { id: parseId(request.params.id) }, include: includePreventivo });
    if (!item) throw new NotFoundError("Preventivo non trovato.");
    const pdf = simplePdf(pdfLines(item));
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="preventivo-${item.id}.pdf"`);
    response.setHeader("Content-Length", pdf.length);
    response.send(pdf);
  } catch (error) { handleError(error, response, next); }
});

preventiviRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const existing = await prisma.preventivo.findUnique({ where: { id }, include: { ordine: { select: { id: true } } } });
    if (!existing) throw new NotFoundError("Preventivo non trovato.");
    if (existing.ordine || existing.stato === StatoPreventivo.APPROVATO || existing.stato === StatoPreventivo.CONVERTITO) {
      throw new ConflictError("Un preventivo approvato o convertito non può essere eliminato.");
    }
    await prisma.preventivo.delete({ where: { id } });
    response.status(204).send();
  } catch (error) { handleError(error, response, next); }
});

function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) throw new ValidationError("ID non valido.");
  return id;
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${label}: data non valida.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError(`${label}: data non valida.`);
  return date;
}

function parseMoney(value: unknown, label: string) {
  const text = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new ValidationError(`${label}: importo non valido (massimo due decimali).`);
  return new Prisma.Decimal(text);
}

function parsePreventivo(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Dati preventivo non validi.");
  const body = value as Record<string, unknown>;
  const clienteId = Number(body.clienteId);
  if (!Number.isSafeInteger(clienteId) || clienteId < 1) throw new ValidationError("Seleziona un cliente.");
  const data = parseDate(body.data, "Data preventivo");
  if (!Array.isArray(body.voci) || body.voci.length === 0) throw new ValidationError("Inserisci almeno un mobile.");
  const voci: VoceInput[] = body.voci.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError(`Mobile ${index + 1}: dati non validi.`);
    const voce = raw as Record<string, unknown>;
    const categoria = parseCategoria(voce.categoria);
    if (!categoria) throw new ValidationError(`Mobile ${index + 1}: seleziona una categoria valida.`);
    const descrizione = categorieMobile[categoria];
    const quantita = Number(voce.quantita);
    if (!descrizione || !Number.isSafeInteger(quantita) || quantita < 1) throw new ValidationError(`Mobile ${index + 1}: descrizione o quantità non valida.`);
    if (!Array.isArray(voce.opzioni) || voce.opzioni.length === 0) throw new ValidationError(`Mobile ${index + 1}: aggiungi almeno un'alternativa.`);
    const seen = new Set<number>();
    const opzioni = voce.opzioni.map((rawOption: unknown, optionIndex: number) => {
      if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) throw new ValidationError(`Alternativa ${optionIndex + 1}: dati non validi.`);
      const option = rawOption as Record<string, unknown>;
      const fornitoreId = Number(option.fornitoreId);
      if (!Number.isSafeInteger(fornitoreId) || fornitoreId < 1 || seen.has(fornitoreId)) {
        throw new ValidationError(`Mobile ${index + 1}: fornitore mancante o duplicato.`);
      }
      seen.add(fornitoreId);
      return { fornitoreId, prezzoVendita: parseMoney(option.prezzoVendita, `Mobile ${index + 1}, prezzo proposto`) };
    });
    return { posizione: index + 1, descrizione, categoria, quantita, opzioni };
  });
  const note = body.note === undefined || body.note === null || body.note === "" ? null : typeof body.note === "string" ? body.note.trim() || null : null;
  return { clienteId, data, note, voci };
}

async function ensureFornitori(voci: VoceInput[], tx: Prisma.TransactionClient = prisma) {
  const ids = [...new Set(voci.flatMap((voce) => voce.opzioni.map((opzione) => opzione.fornitoreId)))];
  if (await tx.fornitore.count({ where: { id: { in: ids } } }) !== ids.length) throw new NotFoundError("Uno o più fornitori non esistono.");
}

function serializePreventivo(item: PreventivoCompleto) {
  const effectiveOption = (voce: PreventivoCompleto["voci"][number]) => {
    const chosen = voce.opzioni.filter((opzione) => opzione.scelta);
    return chosen.length === 1 ? chosen[0] : chosen.length === 0 && voce.opzioni.length === 1 ? voce.opzioni[0] : null;
  };
  const complete = item.voci.every((voce) => effectiveOption(voce) !== null);
  const total = complete ? item.voci.reduce((sum, voce) => {
    const selected = effectiveOption(voce)!;
    return sum.plus(selected.prezzoVendita.mul(voce.quantita));
  }, new Prisma.Decimal(0)) : null;
  return {
    ...item,
    voci: item.voci.map((voce) => ({ ...voce, opzioni: voce.opzioni.map((opzione) => ({
      ...opzione, prezzoVendita: opzione.prezzoVendita.toFixed(2), totaleOpzione: opzione.prezzoVendita.mul(voce.quantita).toFixed(2)
    })) })),
    totaleScelto: total?.toFixed(2) ?? null
  };
}

function pdfLines(item: PreventivoCompleto) {
  const lines = [
    `GESTIONALE SORMANI - PREVENTIVO N. ${item.id}`,
    `Data: ${item.data.toISOString().slice(0, 10).split("-").reverse().join("/")}`,
    `Cliente: ${item.cliente.nome} ${item.cliente.cognome}`,
    [item.cliente.indirizzo, item.cliente.cap, item.cliente.citta, item.cliente.provincia].filter(Boolean).join(" "),
    "",
    "PROPOSTA COMMERCIALE",
    ""
  ];
  for (const voce of item.voci) {
    lines.push(`${voce.posizione}. ${voce.descrizione} - Quantita: ${voce.quantita}`);
    for (const option of voce.opzioni) {
      lines.push(`   ${option.scelta ? "[SCELTA] " : ""}${option.fornitore.nome}: EUR ${option.prezzoVendita.toFixed(2)} cad. - EUR ${option.prezzoVendita.mul(voce.quantita).toFixed(2)}`);
    }
    lines.push("");
  }
  const serialized = serializePreventivo(item);
  lines.push(serialized.totaleScelto ? `TOTALE DELLE OPZIONI SCELTE: EUR ${serialized.totaleScelto}` : "Totale da definire dopo la scelta delle alternative.");
  if (item.note) lines.push("", "Note:", ...item.note.split(/\r?\n/));
  return lines;
}

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ValidationError) { response.status(400).json({ message: error.message }); return; }
  if (error instanceof ConflictError) { response.status(409).json({ message: error.message }); return; }
  if (error instanceof NotFoundError) { response.status(404).json({ message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") { response.status(404).json({ message: "Cliente o preventivo non trovato." }); return; }
    if (error.code === "P2002") { response.status(409).json({ message: "Il preventivo è già stato convertito in ordine." }); return; }
  }
  next(error);
}
