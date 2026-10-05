import { Prisma, StatoOrdine } from "@prisma/client";
import { Router } from "express";
import { categorieMobile } from "../lib/categorieMobile.js";
import { prisma } from "../lib/prisma.js";

export const analisiVenditeRouter = Router();
const zero = () => new Prisma.Decimal(0);
const money = (value: Prisma.Decimal) => value.toFixed(2);

type Totali = { ricavi: Prisma.Decimal; costiMerce: Prisma.Decimal; righeSenzaCosto: number; righe: number };
const empty = (): Totali => ({ ricavi: zero(), costiMerce: zero(), righeSenzaCosto: 0, righe: 0 });

analisiVenditeRouter.get("/", async (request, response, next) => {
  try {
    const rawMonth = request.query.mese;
    if (rawMonth !== undefined && (typeof rawMonth !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth))) {
      response.status(400).json({ message: "Mese non valido. Usa il formato AAAA-MM." });
      return;
    }
    const mese = rawMonth as string | undefined;
    const start = mese ? new Date(`${mese}-01T00:00:00.000Z`) : undefined;
    const end = start ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) : undefined;
    const ordini = await prisma.ordine.findMany({
      where: {
        stato: { not: StatoOrdine.BOZZA },
        ...(start && end ? { dataOrdine: { gte: start, lt: end } } : {})
      },
      select: {
        clienteId: true,
        cliente: { select: { nome: true, cognome: true } },
        righe: { select: { categoria: true, quantita: true, prezzoUnitario: true, costoAcquistoUnitario: true } },
        lavoroConsegna: { select: { giorni: true, costoGiornalieroApplicato: true } }
      }
    });

    const totali = empty();
    const categorie = new Map<string, Totali>();
    const clienti = new Map<number, { id: number; nome: string; cognome: string; ricavi: Prisma.Decimal; ordini: number }>();
    let costiMontaggio = zero();
    for (const ordine of ordini) {
      let cliente = clienti.get(ordine.clienteId);
      if (!cliente) {
        cliente = { id: ordine.clienteId, ...ordine.cliente, ricavi: zero(), ordini: 0 };
        clienti.set(ordine.clienteId, cliente);
      }
      cliente.ordini += 1;
      if (ordine.lavoroConsegna) costiMontaggio = costiMontaggio.plus(
        ordine.lavoroConsegna.costoGiornalieroApplicato.mul(ordine.lavoroConsegna.giorni)
      );
      for (const riga of ordine.righe) {
        const key = riga.categoria ?? "NON_CLASSIFICATA";
        let gruppo = categorie.get(key);
        if (!gruppo) { gruppo = empty(); categorie.set(key, gruppo); }
        const ricavo = riga.prezzoUnitario.mul(riga.quantita);
        cliente.ricavi = cliente.ricavi.plus(ricavo);
        for (const target of [totali, gruppo]) {
          target.ricavi = target.ricavi.plus(ricavo);
          target.righe += 1;
          if (riga.costoAcquistoUnitario === null) target.righeSenzaCosto += 1;
          else target.costiMerce = target.costiMerce.plus(riga.costoAcquistoUnitario.mul(riga.quantita));
        }
      }
    }

    const margin = (value: Totali) => value.righeSenzaCosto ? null : money(value.ricavi.minus(value.costiMerce));
    response.json({
      mese: mese ?? null,
      numeroOrdini: ordini.length,
      ricavi: money(totali.ricavi),
      costiMerceNoti: money(totali.costiMerce),
      righeSenzaCosto: totali.righeSenzaCosto,
      margineMobili: margin(totali),
      costiMontaggio: money(costiMontaggio),
      margineDopoMontaggio: totali.righeSenzaCosto ? null : money(totali.ricavi.minus(totali.costiMerce).minus(costiMontaggio)),
      categorie: [...categorie].map(([categoria, value]) => ({
        categoria, label: categoria === "NON_CLASSIFICATA" ? "Non classificate" : categorieMobile[categoria as keyof typeof categorieMobile],
        ricavi: money(value.ricavi), costiMerceNoti: money(value.costiMerce),
        margineMobili: margin(value), righe: value.righe, righeSenzaCosto: value.righeSenzaCosto
      })).sort((a, b) => Number(b.ricavi) - Number(a.ricavi)),
      clienti: [...clienti.values()].map((cliente) => ({ ...cliente, ricavi: money(cliente.ricavi) }))
        .sort((a, b) => Number(b.ricavi) - Number(a.ricavi) || a.id - b.id)
    });
  } catch (error) { next(error); }
});
