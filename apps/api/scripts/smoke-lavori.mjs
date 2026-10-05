import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../dist/app.js";
import { prisma } from "../dist/lib/prisma.js";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Porta di test non disponibile");
const baseUrl = `http://127.0.0.1:${address.port}`;
const created = { cliente: null, fornitori: [], montatore: null, ordini: [], lavori: [] };

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

try {
  const suffix = randomUUID().slice(0, 8);
  const cliente = await request("/api/clienti", "POST", { nome: "Test", cognome: `Lavori-${suffix}` });
  assert.equal(cliente.status, 201);
  created.cliente = cliente.data.id;
  for (const nome of [`Tavoli ${suffix}`, `Divani ${suffix}`]) {
    const supplier = await request("/api/fornitori", "POST", { nome });
    assert.equal(supplier.status, 201);
    created.fornitori.push(supplier.data.id);
  }
  const worker = await request("/api/montatori", "POST", {
    nome: "Mario", cognome: `Montatore-${suffix}`, telefono: "3331234567", costoGiornaliero: "125.00"
  });
  assert.equal(worker.status, 201);
  created.montatore = worker.data.id;

  const body = {
    clienteId: created.cliente, dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-10-20",
    stato: "IN_ATTESA_FORNITORI", righe: [
      { categoria: "TAVOLO", descrizione: "Tavolo", quantita: 1, prezzoUnitario: "500.00", costoAcquistoUnitario: "300.00",
        fornitoreId: created.fornitori[0], dataOrdineFornitore: "2026-10-01", arrivoPrevisto: "2026-10-10" },
      { categoria: "DIVANO", descrizione: "Divano", quantita: 1, prezzoUnitario: "1200.00", costoAcquistoUnitario: "650.00",
        fornitoreId: created.fornitori[1], dataOrdineFornitore: "2026-10-01", arrivoPrevisto: "2026-10-12" }
    ]
  };
  const order = await request("/api/ordini", "POST", body);
  assert.equal(order.status, 201);
  created.ordini.push(order.data.id);

  const tooEarly = await request("/api/lavori", "POST", {
    ordineId: order.data.id, dataInizio: "2026-10-12", giorni: 2, tipoIncaricato: "MONTATORE", montatoreId: created.montatore
  });
  assert.equal(tooEarly.status, 400);
  const plan = await request("/api/lavori", "POST", {
    ordineId: order.data.id, dataInizio: "2026-10-13", giorni: 2, tipoIncaricato: "MONTATORE", montatoreId: created.montatore
  });
  assert.equal(plan.status, 201);
  created.lavori.push(plan.data.id);
  assert.equal(plan.data.costoGiornalieroApplicato, "125.00");
  assert.equal(plan.data.costoTotale, "250.00");
  const synced = await request(`/api/ordini/${order.data.id}`);
  assert.equal(synced.data.dataConsegnaPrevista.slice(0, 10), "2026-10-13");
  const duplicatePlan = await request("/api/lavori", "POST", {
    ordineId: order.data.id, dataInizio: "2026-10-13", giorni: 1, tipoIncaricato: "TITOLARE"
  });
  assert.equal(duplicatePlan.status, 409);
  const conflictingOrderDate = await request(`/api/ordini/${order.data.id}`, "PUT", {
    ...body, righe: body.righe.map((riga, index) => ({ ...riga, id: order.data.righe[index].id }))
  });
  assert.equal(conflictingOrderDate.status, 409);

  const linkedWorker = await request(`/api/montatori/${created.montatore}`, "DELETE");
  assert.equal(linkedWorker.status, 409);
  const updatedWorker = await request(`/api/montatori/${created.montatore}`, "PUT", {
    nome: "Mario", cognome: `Montatore-${suffix}`, telefono: "3331234567", costoGiornaliero: "150.00"
  });
  assert.equal(updatedWorker.status, 200);
  const afterRateChange = await request("/api/lavori");
  assert.equal(afterRateChange.data.find((item) => item.id === plan.data.id).costoTotale, "250.00");

  const completeTooSoon = await request(`/api/lavori/${plan.data.id}/completa`, "PATCH", { dataCompletamento: "2026-10-14" });
  assert.equal(completeTooSoon.status, 409);

  const arrivalUpdate = await request(`/api/ordini/${order.data.id}`, "PUT", {
    ...body, dataConsegnaPrevista: "2026-10-13", righe: [
      { ...body.righe[0], id: order.data.righe[0].id, arrivoEffettivo: "2026-10-09" },
      { ...body.righe[1], id: order.data.righe[1].id, arrivoEffettivo: "2026-10-14" }
    ]
  });
  assert.equal(arrivalUpdate.status, 200);
  const bypassCompletion = await request(`/api/ordini/${order.data.id}`, "PUT", {
    ...body, dataConsegnaPrevista: "2026-10-13", dataConsegnaEffettiva: "2026-10-16", stato: "CONSEGNATO",
    righe: arrivalUpdate.data.righe.map((riga) => ({
      id: riga.id, descrizione: riga.descrizione, categoria: riga.categoria, quantita: riga.quantita,
      prezzoUnitario: riga.prezzoUnitario, costoAcquistoUnitario: riga.costoAcquistoUnitario,
      fornitoreId: riga.fornitoreId, dataOrdineFornitore: riga.dataOrdineFornitore?.slice(0, 10),
      arrivoPrevisto: riga.arrivoPrevisto?.slice(0, 10), arrivoEffettivo: riga.arrivoEffettivo?.slice(0, 10)
    }))
  });
  assert.equal(bypassCompletion.status, 409);
  const lateJob = await request("/api/lavori");
  assert.equal(lateJob.data.find((item) => item.id === plan.data.id).daRipianificare, true);
  const cannotCompleteLate = await request(`/api/lavori/${plan.data.id}/completa`, "PATCH", { dataCompletamento: "2026-10-15" });
  assert.equal(cannotCompleteLate.status, 409);

  const replanned = await request(`/api/lavori/${plan.data.id}`, "PUT", {
    dataInizio: "2026-10-15", giorni: 2, tipoIncaricato: "MONTATORE", montatoreId: created.montatore
  });
  assert.equal(replanned.status, 200);
  assert.equal(replanned.data.daRipianificare, false);
  assert.equal(replanned.data.costoTotale, "300.00");
  const completed = await request(`/api/lavori/${plan.data.id}/completa`, "PATCH", { dataCompletamento: "2026-10-16" });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.stato, "COMPLETATO");
  const deliveredOrder = await request(`/api/ordini/${order.data.id}`);
  assert.equal(deliveredOrder.data.stato, "CONSEGNATO");
  assert.equal(deliveredOrder.data.dataConsegnaEffettiva.slice(0, 10), "2026-10-16");

  const ownerOrder = await request("/api/ordini", "POST", {
    ...body, righe: [{ ...body.righe[0], arrivoEffettivo: "2026-10-09" }]
  });
  assert.equal(ownerOrder.status, 201);
  created.ordini.push(ownerOrder.data.id);
  const ownerPlan = await request("/api/lavori", "POST", {
    ordineId: ownerOrder.data.id, dataInizio: "2026-10-10", giorni: 3, tipoIncaricato: "TITOLARE", montatoreId: null
  });
  assert.equal(ownerPlan.status, 201);
  created.lavori.push(ownerPlan.data.id);
  assert.equal(ownerPlan.data.costoTotale, "0.00");
  console.log("OK: montatore esterno, titolare, ritardo merce, ripianificazione e completamento verificati");
} finally {
  for (const id of created.lavori.reverse()) await prisma.lavoroConsegna.delete({ where: { id } });
  for (const id of created.ordini.reverse()) await prisma.ordine.delete({ where: { id } });
  if (created.montatore !== null) await prisma.montatore.delete({ where: { id: created.montatore } });
  for (const id of created.fornitori.reverse()) await prisma.fornitore.delete({ where: { id } });
  if (created.cliente !== null) await prisma.cliente.delete({ where: { id: created.cliente } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
