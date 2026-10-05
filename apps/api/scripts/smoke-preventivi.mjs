import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../dist/app.js";
import { prisma } from "../dist/lib/prisma.js";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Porta di test non disponibile");
const baseUrl = `http://127.0.0.1:${address.port}`;
const created = { cliente: null, fornitori: [], preventivo: null, ordine: null };

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

try {
  const suffix = randomUUID().slice(0, 8);
  const cliente = await request("/api/clienti", "POST", { nome: "Test", cognome: `Preventivi-${suffix}` });
  assert.equal(cliente.status, 201);
  created.cliente = cliente.data.id;
  for (const nome of [`Divani A ${suffix}`, `Divani B ${suffix}`, `Tavoli ${suffix}`]) {
    const supplier = await request("/api/fornitori", "POST", { nome });
    assert.equal(supplier.status, 201);
    created.fornitori.push(supplier.data.id);
  }

  const quote = await request("/api/preventivi", "POST", {
    clienteId: created.cliente, data: "2026-10-01", note: "Proposta di prova",
    voci: [
      { categoria: "DIVANO", descrizione: "Divano", quantita: 1, opzioni: [
        { fornitoreId: created.fornitori[0], prezzoVendita: "1200.00" },
        { fornitoreId: created.fornitori[1], prezzoVendita: "1500.00" }
      ] },
      { categoria: "TAVOLO", descrizione: "Tavolo", quantita: 1, opzioni: [
        { fornitoreId: created.fornitori[2], prezzoVendita: "500.00" }
      ] }
    ]
  });
  assert.equal(quote.status, 201);
  assert.deepEqual(quote.data.voci.map((voce) => voce.categoria), ["DIVANO", "TAVOLO"]);
  const invalidCategory = await request("/api/preventivi", "POST", {
    clienteId: created.cliente, data: "2026-10-01",
    voci: [{ categoria: "LAMPADA", quantita: 1, opzioni: [{ fornitoreId: created.fornitori[0], prezzoVendita: "100.00" }] }]
  });
  assert.equal(invalidCategory.status, 400);
  created.preventivo = quote.data.id;
  assert.equal(quote.data.stato, "BOZZA");
  assert.equal(quote.data.totaleScelto, null);

  const pdfBefore = await fetch(`${baseUrl}/api/preventivi/${created.preventivo}/pdf`);
  assert.equal(pdfBefore.status, 200);
  assert.match(pdfBefore.headers.get("content-type"), /application\/pdf/);
  assert.match(pdfBefore.headers.get("content-disposition"), /attachment/);
  assert.match(Buffer.from(await pdfBefore.arrayBuffer()).toString("latin1"), /^%PDF-1\.4/);

  const premature = await request(`/api/preventivi/${created.preventivo}/converti`, "POST", {
    dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-11-01", costi: []
  });
  assert.equal(premature.status, 409);

  const sent = await request(`/api/preventivi/${created.preventivo}/stato`, "PATCH", { stato: "INVIATO" });
  assert.equal(sent.status, 200);
  const cannotEditSent = await request(`/api/preventivi/${created.preventivo}`, "PUT", {
    clienteId: created.cliente, data: "2026-10-01", voci: [
      { categoria: "DIVANO", descrizione: "Divano", quantita: 1, opzioni: [
        { fornitoreId: created.fornitori[0], prezzoVendita: "1200.00" },
        { fornitoreId: created.fornitori[1], prezzoVendita: "1500.00" }
      ] },
      { categoria: "TAVOLO", descrizione: "Tavolo", quantita: 1, opzioni: [
        { fornitoreId: created.fornitori[2], prezzoVendita: "500.00" }
      ] }
    ]
  });
  assert.equal(cannotEditSent.status, 409);

  const [sofa, table] = sent.data.voci;
  const selectedSofa = sofa.opzioni[1];
  const selectedTable = table.opzioni[0];
  const approved = await request(`/api/preventivi/${created.preventivo}/stato`, "PATCH", {
    stato: "APPROVATO", scelte: [
      { voceId: sofa.id, opzioneId: selectedSofa.id },
      { voceId: table.id, opzioneId: selectedTable.id }
    ]
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.totaleScelto, "2000.00");

  const noCosts = await request(`/api/preventivi/${created.preventivo}/converti`, "POST", {
    dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-11-01", costi: []
  });
  assert.equal(noCosts.status, 400);

  const converted = await request(`/api/preventivi/${created.preventivo}/converti`, "POST", {
    dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-11-01",
    costi: [
      { opzioneId: selectedSofa.id, costoAcquistoUnitario: "321.99" },
      { opzioneId: selectedTable.id, costoAcquistoUnitario: "217.43" }
    ]
  });
  assert.equal(converted.status, 201);
  created.ordine = converted.data.ordineId;
  const order = await request(`/api/ordini/${created.ordine}`);
  assert.equal(order.status, 200);
  assert.equal(order.data.preventivoId, created.preventivo);
  assert.equal(order.data.stato, "CONFERMATO");
  assert.equal(order.data.totale, "2000.00");
  assert.deepEqual(order.data.righe.map((riga) => riga.fornitoreId), [created.fornitori[1], created.fornitori[2]]);
  assert.deepEqual(order.data.righe.map((riga) => riga.costoAcquistoUnitario), ["321.99", "217.43"]);

  const changedAgreedPrice = await request(`/api/ordini/${created.ordine}`, "PUT", {
    clienteId: order.data.clienteId, dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-11-01",
    stato: "CONFERMATO", righe: order.data.righe.map((riga, index) => ({
      id: riga.id, descrizione: riga.descrizione, categoria: riga.categoria, quantita: riga.quantita,
      prezzoUnitario: index === 0 ? "1400.00" : riga.prezzoUnitario,
      costoAcquistoUnitario: riga.costoAcquistoUnitario, fornitoreId: riga.fornitoreId
    }))
  });
  assert.equal(changedAgreedPrice.status, 409);

  const pdfAfter = await fetch(`${baseUrl}/api/preventivi/${created.preventivo}/pdf`);
  const pdfText = Buffer.from(await pdfAfter.arrayBuffer()).toString("latin1");
  assert.ok(pdfText.includes("1500.00"));
  assert.ok(!pdfText.includes("321.99"));
  assert.ok(!pdfText.includes("217.43"));

  const duplicate = await request(`/api/preventivi/${created.preventivo}/converti`, "POST", {
    dataOrdine: "2026-10-01", dataConsegnaPrevista: "2026-11-01",
    costi: [{ opzioneId: selectedSofa.id, costoAcquistoUnitario: "321.99" }, { opzioneId: selectedTable.id, costoAcquistoUnitario: "217.43" }]
  });
  assert.equal(duplicate.status, 409);
  const deleteConverted = await request(`/api/ordini/${created.ordine}`, "DELETE");
  assert.equal(deleteConverted.status, 409);
  console.log("OK: preventivo, alternative, PDF senza costi interni e conversione verificati");
} finally {
  if (created.ordine !== null) await prisma.ordine.delete({ where: { id: created.ordine } });
  if (created.preventivo !== null) await prisma.preventivo.delete({ where: { id: created.preventivo } });
  for (const id of created.fornitori.reverse()) await prisma.fornitore.delete({ where: { id } });
  if (created.cliente !== null) await prisma.cliente.delete({ where: { id: created.cliente } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}
