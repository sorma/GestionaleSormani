import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../dist/app.js";
import { prisma } from "../dist/lib/prisma.js";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Porta di test non disponibile");
const baseUrl = `http://127.0.0.1:${address.port}`;
const created = { cliente: null, fornitori: [], ordine: null, pagamenti: [] };

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

try {
  const suffix = randomUUID().slice(0, 8);
  const cliente = await request("/api/clienti", "POST", { nome: "Test", cognome: `Ordini-${suffix}` });
  assert.equal(cliente.status, 201);
  created.cliente = cliente.data.id;

  for (const nome of [`Fornitore Tavoli ${suffix}`, `Fornitore Divani ${suffix}`]) {
    const result = await request("/api/fornitori", "POST", { nome });
    assert.equal(result.status, 201);
    created.fornitori.push(result.data.id);
  }

  const body = {
    clienteId: created.cliente,
    dataOrdine: "2026-09-30",
    dataConsegnaPrevista: "2026-10-30",
    stato: "IN_ATTESA_FORNITORI",
    note: "Vendita temporanea di verifica",
    righe: [
      { categoria: "TAVOLO", descrizione: "Tavolo", quantita: 1, prezzoUnitario: "500.00", costoAcquistoUnitario: "300.00", fornitoreId: created.fornitori[0], dataOrdineFornitore: "2026-09-30", dataConfermaFornitore: "2026-10-01", arrivoPrevisto: "2026-10-10" },
      { categoria: "DIVANO", descrizione: "Divano", quantita: 1, prezzoUnitario: "1200.00", costoAcquistoUnitario: "650.00", fornitoreId: created.fornitori[1], dataOrdineFornitore: "2026-09-30", arrivoPrevisto: "2026-10-25" }
    ]
  };
  const withoutPurchaseCost = await request("/api/ordini", "POST", {
    ...body, righe: body.righe.map(({ costoAcquistoUnitario: _cost, ...riga }) => riga)
  });
  assert.equal(withoutPurchaseCost.status, 400);
  const createdOrder = await request("/api/ordini", "POST", body);
  assert.equal(createdOrder.status, 201);
  assert.deepEqual(createdOrder.data.righe.map((riga) => riga.categoria), ["TAVOLO", "DIVANO"]);
  const invalidCategory = await request("/api/ordini", "POST", { ...body, righe: [{ ...body.righe[0], categoria: "LAMPADA" }] });
  assert.equal(invalidCategory.status, 400);
  const invalidMonth = await request("/api/analisi-vendite?mese=2026-13");
  assert.equal(invalidMonth.status, 400);
  const analysis = await request("/api/analisi-vendite?mese=2026-09");
  assert.equal(analysis.status, 200);
  assert.equal(analysis.data.clienti.find((item) => item.id === created.cliente).ricavi, "1700.00");
  assert.ok(analysis.data.categorie.some((item) => item.categoria === "TAVOLO"));
  assert.ok(analysis.data.categorie.some((item) => item.categoria === "DIVANO"));
  created.ordine = createdOrder.data.id;
  assert.equal(createdOrder.data.totale, "1700.00");
  assert.equal(createdOrder.data.residuo, "1700.00");
  assert.deepEqual(createdOrder.data.righe.map((riga) => riga.costoAcquistoUnitario), ["300.00", "650.00"]);
  const [tableId, sofaId] = createdOrder.data.righe.map((riga) => riga.id);

  const partial = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body,
    righe: [
      { ...body.righe[0], id: tableId, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId }
    ]
  });
  assert.equal(partial.status, 200);
  assert.deepEqual(partial.data.righe.map((riga) => riga.id), [tableId, sofaId]);
  assert.ok(partial.data.righe[0].arrivoEffettivo);
  assert.equal(partial.data.righe[1].arrivoEffettivo, null);

  const deposit = await request(`/api/ordini/${created.ordine}/pagamenti`, "POST", {
    tipo: "ACCONTO", importo: "150.00", dataPagamento: "2026-10-09"
  });
  assert.equal(deposit.status, 201);
  created.pagamenti.push(deposit.data.pagamenti.at(-1).id);
  assert.equal(deposit.data.totale, "1700.00");
  assert.equal(deposit.data.incassato, "150.00");
  assert.equal(deposit.data.residuo, "1550.00");
  assert.equal(deposit.data.righe[1].arrivoEffettivo, null);

  const fullAmountAsDeposit = await request(`/api/ordini/${created.ordine}/pagamenti`, "POST", {
    tipo: "ACCONTO", importo: "1550.00", dataPagamento: "2026-10-09"
  });
  assert.equal(fullAmountAsDeposit.status, 400);

  const unassignedSupplier = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body,
    righe: [
      { ...body.righe[0], id: tableId, fornitoreId: null, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId }
    ]
  });
  assert.equal(unassignedSupplier.status, 400);

  const overpayment = await request(`/api/ordini/${created.ordine}/pagamenti`, "POST", {
    tipo: "ACCONTO", importo: "1550.01", dataPagamento: "2026-10-09"
  });
  assert.equal(overpayment.status, 409);
  const belowPaid = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body,
    righe: [
      { ...body.righe[0], id: tableId, prezzoUnitario: "20.00", arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId, prezzoUnitario: "20.00" }
    ]
  });
  assert.equal(belowPaid.status, 409);
  const afterRejectedChange = await request(`/api/ordini/${created.ordine}`);
  assert.equal(afterRejectedChange.data.totale, "1700.00");
  const linkedSupplier = await request(`/api/fornitori/${created.fornitori[0]}`, "DELETE");
  assert.equal(linkedSupplier.status, 409);

  const premature = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body, stato: "PRONTO_CONSEGNA", righe: partial.data.righe.map((riga) => ({
      ...riga,
      dataOrdineFornitore: riga.dataOrdineFornitore?.slice(0, 10),
      dataConfermaFornitore: riga.dataConfermaFornitore?.slice(0, 10),
      arrivoPrevisto: riga.arrivoPrevisto?.slice(0, 10),
      arrivoEffettivo: riga.arrivoEffettivo?.slice(0, 10)
    }))
  });
  assert.equal(premature.status, 400);

  const ready = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body, stato: "PRONTO_CONSEGNA", righe: [
      { ...body.righe[0], id: tableId, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId, dataConfermaFornitore: "2026-10-02", arrivoEffettivo: "2026-10-24" }
    ]
  });
  assert.equal(ready.status, 200);
  assert.equal(ready.data.residuo, "1550.00");

  const deliveryBeforeArrival = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body, stato: "CONSEGNATO", dataConsegnaEffettiva: "2026-10-20", righe: [
      { ...body.righe[0], id: tableId, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId, dataConfermaFornitore: "2026-10-02", arrivoEffettivo: "2026-10-24" }
    ]
  });
  assert.equal(deliveryBeforeArrival.status, 400);

  const delivered = await request(`/api/ordini/${created.ordine}`, "PUT", {
    ...body, stato: "CONSEGNATO", dataConsegnaEffettiva: "2026-10-29", righe: [
      { ...body.righe[0], id: tableId, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: sofaId, dataConfermaFornitore: "2026-10-02", arrivoEffettivo: "2026-10-24" }
    ]
  });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.data.stato, "CONSEGNATO");

  const balance = await request(`/api/ordini/${created.ordine}/pagamenti`, "POST", {
    tipo: "SALDO", importo: "1550.00", dataPagamento: "2026-10-29"
  });
  assert.equal(balance.status, 201);
  created.pagamenti.push(balance.data.pagamenti.at(-1).id);
  assert.equal(balance.data.incassato, "1700.00");
  assert.equal(balance.data.residuo, "0.00");

  const cannotDeletePaidOrder = await request(`/api/ordini/${created.ordine}`, "DELETE");
  assert.equal(cannotDeletePaidOrder.status, 409);
  console.log("OK: due fornitori, arrivo parziale, acconto, consegna e saldo verificati");
} finally {
  for (const pagamentoId of created.pagamenti.reverse()) {
    await request(`/api/ordini/${created.ordine}/pagamenti/${pagamentoId}`, "DELETE");
  }
  if (created.ordine !== null) await request(`/api/ordini/${created.ordine}`, "DELETE");
  for (const fornitoreId of created.fornitori.reverse()) await request(`/api/fornitori/${fornitoreId}`, "DELETE");
  if (created.cliente !== null) await request(`/api/clienti/${created.cliente}`, "DELETE");
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
