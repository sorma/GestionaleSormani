import { Prisma, StatoOrdine, TipoPagamento } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { categorieMobile, parseCategoria } from "../lib/categorieMobile.js";

export const ordiniRouter = Router();

const ordineInclude = {
  cliente: { select: { id: true, nome: true, cognome: true } },
  righe: {
    include: { fornitore: { select: { id: true, nome: true } } },
    orderBy: { posizione: "asc" }
  },
  pagamenti: { orderBy: { id: "asc" } }
} as const;

type OrdineCompleto = Prisma.OrdineGetPayload<{ include: typeof ordineInclude }>;
type RigaInput = {
  id: number | null;
  posizione: number;
  descrizione: string;
  categoria: import("@prisma/client").CategoriaMobile | null;
  quantita: number;
  prezzoUnitario: Prisma.Decimal;
  costoAcquistoUnitario: Prisma.Decimal | null;
  fornitoreId: number | null;
  dataOrdineFornitore: Date | null;
  dataConfermaFornitore: Date | null;
  arrivoPrevisto: Date | null;
  arrivoEffettivo: Date | null;
};

class ValidationError extends Error {}
class ConflictError extends Error {}
class NotFoundError extends Error {}

ordiniRouter.get("/", async (_request, response, next) => {
  try {
    const ordini = await prisma.ordine.findMany({
      include: ordineInclude,
      orderBy: [{ dataOrdine: "desc" }, { id: "desc" }]
    });
    response.json(ordini.map(serializeOrdine));
  } catch (error) {
    next(error);
  }
});

ordiniRouter.get("/:id", async (request, response, next) => {
  try {
    const ordine = await prisma.ordine.findUnique({
      where: { id: parseId(request.params.id) },
      include: ordineInclude
    });
    if (!ordine) throw new NotFoundError("Ordine non trovato.");
    response.json(serializeOrdine(ordine));
  } catch (error) {
    handleError(error, response, next);
  }
});

ordiniRouter.post("/", async (request, response, next) => {
  try {
    const input = parseOrdine(request.body);
    await ensureFornitori(input.righe);
    const ordine = await prisma.ordine.create({
      data: {
        cliente: { connect: { id: input.clienteId } },
        dataOrdine: input.dataOrdine,
        dataConsegnaPrevista: input.dataConsegnaPrevista,
        dataConsegnaEffettiva: input.dataConsegnaEffettiva,
        stato: input.stato,
        note: input.note,
        righe: { create: input.righe.map(({ id: _id, ...riga }) => riga) }
      },
      include: ordineInclude
    });
    response.status(201).json(serializeOrdine(ordine));
  } catch (error) {
    handleError(error, response, next);
  }
});

ordiniRouter.put("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const input = parseOrdine(request.body);
    const ordine = await prisma.$transaction(async (tx) => {
      const existing = await tx.ordine.findUnique({
        where: { id },
        include: { righe: true, pagamenti: true, lavoroConsegna: true }
      });
      if (!existing) throw new NotFoundError("Ordine non trovato.");

      if (existing.lavoroConsegna && (
        !input.dataConsegnaPrevista ||
        input.dataConsegnaPrevista.getTime() !== existing.lavoroConsegna.dataInizio.getTime() ||
        (existing.lavoroConsegna.stato === "PIANIFICATO" && (input.stato === StatoOrdine.BOZZA || input.stato === StatoOrdine.CONSEGNATO)) ||
        (existing.lavoroConsegna.stato === "COMPLETATO" && (
          input.stato !== StatoOrdine.CONSEGNATO ||
          input.dataConsegnaEffettiva?.getTime() !== existing.lavoroConsegna.dataCompletamento?.getTime()
        ))
      )) {
        throw new ConflictError("La data pianificata e il completamento si gestiscono nella sezione Lavori.");
      }

      if (existing.preventivoId !== null && (
        input.clienteId !== existing.clienteId || input.righe.length !== existing.righe.length ||
        input.righe.some((riga) => {
          const previous = existing.righe.find((item) => item.id === riga.id);
          return !previous || previous.descrizione !== riga.descrizione ||
            (previous.categoria !== null && previous.categoria !== riga.categoria) || previous.quantita !== riga.quantita ||
            previous.fornitoreId !== riga.fornitoreId || !previous.prezzoUnitario.equals(riga.prezzoUnitario);
        })
      )) {
        throw new ConflictError("Cliente, mobili, fornitori e prezzi di un ordine da preventivo approvato non possono essere modificati.");
      }

      const existingIds = new Set(existing.righe.map((riga) => riga.id));
      for (const riga of input.righe) {
        if (riga.id !== null && !existingIds.has(riga.id)) {
          throw new ValidationError("Una riga non appartiene a questo ordine.");
        }
        const previous = existing.righe.find((item) => item.id === riga.id);
        if (previous?.categoria && !riga.categoria) {
          throw new ValidationError("Una riga classificata non può tornare senza categoria.");
        }
        if (previous?.fornitoreId && riga.fornitoreId === null) {
          throw new ValidationError("Una riga con fornitore assegnato non può tornare senza fornitore.");
        }
      }
      await ensureFornitori(input.righe, tx);

      const totale = totalRighe(input.righe);
      const incassato = existing.pagamenti.reduce(
        (somma, pagamento) => somma.plus(pagamento.importo), new Prisma.Decimal(0)
      );
      if (totale.lessThan(incassato)) {
        throw new ConflictError("Il nuovo totale non può essere inferiore all'importo già incassato.");
      }

      await tx.ordine.update({
        where: { id },
        data: {
          cliente: { connect: { id: input.clienteId } },
          dataOrdine: input.dataOrdine,
          dataConsegnaPrevista: input.dataConsegnaPrevista,
          dataConsegnaEffettiva: input.dataConsegnaEffettiva,
          stato: input.stato,
          note: input.note
        }
      });

      const retainedIds = input.righe.flatMap((riga) => riga.id === null ? [] : [riga.id]);
      await tx.rigaOrdine.deleteMany({
        where: { ordineId: id, ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}) }
      });
      for (const riga of input.righe) {
        const { id: rigaId, ...data } = riga;
        if (rigaId === null) {
          await tx.rigaOrdine.create({ data: { ...data, ordineId: id } });
        } else {
          await tx.rigaOrdine.update({ where: { id: rigaId }, data });
        }
      }
      return tx.ordine.findUniqueOrThrow({ where: { id }, include: ordineInclude });
    });
    response.json(serializeOrdine(ordine));
  } catch (error) {
    handleError(error, response, next);
  }
});

ordiniRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const existing = await prisma.ordine.findUnique({ where: { id }, select: { preventivoId: true, lavoroConsegna: { select: { id: true } } } });
    if (!existing) throw new NotFoundError("Ordine non trovato.");
    if (existing.preventivoId !== null) throw new ConflictError("Un ordine creato da preventivo non può essere eliminato.");
    if (existing.lavoroConsegna) throw new ConflictError("L'ordine ha un lavoro di consegna collegato e non può essere eliminato.");
    if (await prisma.pagamentoOrdine.count({ where: { ordineId: id } })) {
      throw new ConflictError("L'ordine ha pagamenti registrati e non può essere eliminato.");
    }
    await prisma.ordine.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    handleError(error, response, next);
  }
});

ordiniRouter.post("/:id/pagamenti", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const input = parsePagamento(request.body);
    const ordine = await prisma.$transaction(async (tx) => {
      const existing = await tx.ordine.findUnique({
        where: { id }, include: { righe: true, pagamenti: true }
      });
      if (!existing) throw new NotFoundError("Ordine non trovato.");
      const residuo = totalRighe(existing.righe).minus(
        existing.pagamenti.reduce((somma, pagamento) => somma.plus(pagamento.importo), new Prisma.Decimal(0))
      );
      if (input.importo.greaterThan(residuo)) {
        throw new ConflictError("L'importo supera il residuo dell'ordine.");
      }
      if (input.tipo === TipoPagamento.SALDO && !input.importo.equals(residuo)) {
        throw new ValidationError("Il saldo deve coprire esattamente il residuo.");
      }
      if (input.tipo === TipoPagamento.ACCONTO && input.importo.equals(residuo)) {
        throw new ValidationError("Per coprire l'intero residuo scegli il tipo Saldo.");
      }
      await tx.pagamentoOrdine.create({ data: { ...input, ordineId: id } });
      return tx.ordine.findUniqueOrThrow({ where: { id }, include: ordineInclude });
    });
    response.status(201).json(serializeOrdine(ordine));
  } catch (error) {
    handleError(error, response, next);
  }
});

ordiniRouter.delete("/:id/pagamenti/:pagamentoId", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const pagamentoId = parseId(request.params.pagamentoId);
    const pagamento = await prisma.pagamentoOrdine.findFirst({ where: { id: pagamentoId, ordineId: id } });
    if (!pagamento) throw new NotFoundError("Pagamento non trovato.");
    await prisma.pagamentoOrdine.delete({ where: { id: pagamentoId } });
    const ordine = await prisma.ordine.findUniqueOrThrow({ where: { id }, include: ordineInclude });
    response.json(serializeOrdine(ordine));
  } catch (error) {
    handleError(error, response, next);
  }
});

function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
    throw new ValidationError("ID non valido.");
  }
  return id;
}

function parseDate(value: unknown, label: string, required = false): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${label}: data obbligatoria.`);
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${label}: data non valida.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${label}: data non valida.`);
  }
  return date;
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("Uno o più campi testuali non sono validi.");
  return value.trim() || null;
}

function parseMoney(value: unknown, label: string, allowZero = true) {
  const text = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    throw new ValidationError(`${label}: importo non valido (massimo due decimali).`);
  }
  const amount = new Prisma.Decimal(text);
  if (!allowZero && amount.isZero()) throw new ValidationError(`${label}: l'importo deve essere positivo.`);
  return amount;
}

function parseOrdine(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Dati ordine non validi.");
  }
  const body = value as Record<string, unknown>;
  const clienteId = Number(body.clienteId);
  if (!Number.isSafeInteger(clienteId) || clienteId < 1) {
    throw new ValidationError("Seleziona un cliente valido.");
  }
  const dataOrdine = parseDate(body.dataOrdine, "Data ordine", true)!;
  const dataConsegnaPrevista = parseDate(body.dataConsegnaPrevista, "Consegna prevista");
  const dataConsegnaEffettiva = parseDate(body.dataConsegnaEffettiva, "Consegna effettiva");
  if (dataConsegnaPrevista && dataConsegnaPrevista < dataOrdine) {
    throw new ValidationError("La consegna prevista precede la data dell'ordine.");
  }
  if (!Object.values(StatoOrdine).includes(body.stato as StatoOrdine)) {
    throw new ValidationError("Stato ordine non valido.");
  }
  const stato = body.stato as StatoOrdine;
  if (stato !== StatoOrdine.BOZZA && !dataConsegnaPrevista) {
    throw new ValidationError("Indica la data di consegna prevista prima di confermare l'ordine.");
  }
  if (dataConsegnaEffettiva && stato !== StatoOrdine.CONSEGNATO) {
    throw new ValidationError("La consegna effettiva è prevista solo per un ordine consegnato.");
  }
  if (stato === StatoOrdine.CONSEGNATO && !dataConsegnaEffettiva) {
    throw new ValidationError("Indica la data di consegna effettiva.");
  }
  if (dataConsegnaEffettiva && dataConsegnaEffettiva < dataOrdine) {
    throw new ValidationError("La consegna effettiva precede la data dell'ordine.");
  }
  if (!Array.isArray(body.righe) || body.righe.length === 0) {
    throw new ValidationError("Inserisci almeno una riga ordine.");
  }

  const seenIds = new Set<number>();
  const righe: RigaInput[] = body.righe.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError(`Riga ${index + 1}: dati non validi.`);
    }
    const riga = item as Record<string, unknown>;
    const id = riga.id === undefined || riga.id === null ? null : Number(riga.id);
    if (id !== null && (!Number.isSafeInteger(id) || id < 1 || seenIds.has(id))) {
      throw new ValidationError(`Riga ${index + 1}: ID non valido o duplicato.`);
    }
    if (id !== null) seenIds.add(id);
    const categoria = parseCategoria(riga.categoria);
    if (!categoria && (id === null || (riga.categoria !== null && riga.categoria !== undefined && riga.categoria !== ""))) {
      throw new ValidationError(`Riga ${index + 1}: seleziona una categoria valida.`);
    }
    const descrizione = id === null ? categorieMobile[categoria!] : optionalText(riga.descrizione);
    if (!descrizione) throw new ValidationError(`Riga ${index + 1}: descrizione obbligatoria.`);
    const quantita = Number(riga.quantita);
    if (!Number.isSafeInteger(quantita) || quantita < 1) {
      throw new ValidationError(`Riga ${index + 1}: quantità non valida.`);
    }
    const fornitoreId = riga.fornitoreId === null || riga.fornitoreId === undefined || riga.fornitoreId === ""
      ? null : Number(riga.fornitoreId);
    if (fornitoreId === null && id === null) {
      throw new ValidationError(`Riga ${index + 1}: seleziona un fornitore.`);
    }
    if (fornitoreId !== null && (!Number.isSafeInteger(fornitoreId) || fornitoreId < 1)) {
      throw new ValidationError(`Riga ${index + 1}: fornitore non valido.`);
    }
    const dataOrdineFornitore = parseDate(riga.dataOrdineFornitore, `Riga ${index + 1}, ordine al fornitore`);
    const dataConfermaFornitore = parseDate(riga.dataConfermaFornitore, `Riga ${index + 1}, conferma fornitore`);
    const arrivoPrevisto = parseDate(riga.arrivoPrevisto, `Riga ${index + 1}, arrivo previsto`);
    const arrivoEffettivo = parseDate(riga.arrivoEffettivo, `Riga ${index + 1}, arrivo effettivo`);
    if (dataConfermaFornitore && (!dataOrdineFornitore || dataConfermaFornitore < dataOrdineFornitore)) {
      throw new ValidationError(`Riga ${index + 1}: conferma fornitore non coerente con la data d'ordine.`);
    }
    if (arrivoPrevisto && dataOrdineFornitore && arrivoPrevisto < dataOrdineFornitore) {
      throw new ValidationError(`Riga ${index + 1}: arrivo previsto precedente all'ordine al fornitore.`);
    }
    if (arrivoEffettivo && (!dataOrdineFornitore || arrivoEffettivo < dataOrdineFornitore)) {
      throw new ValidationError(`Riga ${index + 1}: arrivo effettivo non coerente con la data d'ordine.`);
    }
    const costoAcquistoUnitario = riga.costoAcquistoUnitario === null || riga.costoAcquistoUnitario === undefined || riga.costoAcquistoUnitario === ""
      ? null : parseMoney(riga.costoAcquistoUnitario, `Riga ${index + 1}, costo d'acquisto`);
    if (id === null && costoAcquistoUnitario === null) {
      throw new ValidationError(`Riga ${index + 1}: indica il costo d'acquisto unitario.`);
    }
    return {
      id, posizione: index + 1, descrizione, categoria, quantita,
      prezzoUnitario: parseMoney(riga.prezzoUnitario, `Riga ${index + 1}, prezzo`),
      costoAcquistoUnitario,
      fornitoreId, dataOrdineFornitore, dataConfermaFornitore, arrivoPrevisto, arrivoEffettivo
    };
  });
  if ((stato === StatoOrdine.PRONTO_CONSEGNA || stato === StatoOrdine.CONSEGNATO) && righe.some((riga) => !riga.arrivoEffettivo)) {
    throw new ValidationError("Per segnare l'ordine pronto o consegnato devono essere arrivati tutti i mobili.");
  }
  if (dataConsegnaEffettiva && righe.some((riga) => riga.arrivoEffettivo && riga.arrivoEffettivo > dataConsegnaEffettiva)) {
    throw new ValidationError("La consegna effettiva precede l'arrivo di uno o più mobili.");
  }

  return {
    clienteId, dataOrdine, dataConsegnaPrevista, dataConsegnaEffettiva, stato,
    note: optionalText(body.note), righe
  };
}

function parsePagamento(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Dati pagamento non validi.");
  }
  const body = value as Record<string, unknown>;
  if (body.tipo !== TipoPagamento.ACCONTO && body.tipo !== TipoPagamento.SALDO) {
    throw new ValidationError("Tipo pagamento non valido.");
  }
  return {
    tipo: body.tipo,
    importo: parseMoney(body.importo, "Pagamento", false),
    dataPagamento: parseDate(body.dataPagamento, "Data pagamento", true)!,
    note: optionalText(body.note)
  };
}

async function ensureFornitori(righe: RigaInput[], tx: Prisma.TransactionClient = prisma) {
  const ids = [...new Set(righe.flatMap((riga) => riga.fornitoreId === null ? [] : [riga.fornitoreId]))];
  if (ids.length && await tx.fornitore.count({ where: { id: { in: ids } } }) !== ids.length) {
    throw new NotFoundError("Uno o più fornitori non esistono.");
  }
}

function totalRighe(righe: Array<{ prezzoUnitario: Prisma.Decimal; quantita: number }>) {
  return righe.reduce(
    (somma, riga) => somma.plus(riga.prezzoUnitario.mul(riga.quantita)), new Prisma.Decimal(0)
  );
}

function serializeOrdine(ordine: OrdineCompleto) {
  const totale = totalRighe(ordine.righe);
  const incassato = ordine.pagamenti.reduce(
    (somma, pagamento) => somma.plus(pagamento.importo), new Prisma.Decimal(0)
  );
  return {
    ...ordine,
    righe: ordine.righe.map((riga) => ({
      ...riga,
      prezzoUnitario: riga.prezzoUnitario.toFixed(2),
      costoAcquistoUnitario: riga.costoAcquistoUnitario?.toFixed(2) ?? null,
      totaleRiga: riga.prezzoUnitario.mul(riga.quantita).toFixed(2)
    })),
    pagamenti: ordine.pagamenti.map((pagamento) => ({
      ...pagamento, importo: pagamento.importo.toFixed(2)
    })),
    totale: totale.toFixed(2),
    incassato: incassato.toFixed(2),
    residuo: totale.minus(incassato).toFixed(2)
  };
}

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ValidationError) {
    response.status(400).json({ message: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    response.status(409).json({ message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    response.status(404).json({ message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    response.status(404).json({ message: "Ordine, cliente o fornitore non trovato." });
    return;
  }
  next(error);
}
