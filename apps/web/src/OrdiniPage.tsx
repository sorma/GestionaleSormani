import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { categorieMobile, type CategoriaMobile } from "./categorieMobile";

type Cliente = { id: number; nome: string; cognome: string };
type Fornitore = { id: number; nome: string };
type StatoOrdine = "BOZZA" | "CONFERMATO" | "IN_ATTESA_FORNITORI" | "PRONTO_CONSEGNA" | "CONSEGNATO";
type RigaOrdine = {
  id: number;
  descrizione: string;
  categoria: CategoriaMobile | null;
  quantita: number;
  prezzoUnitario: string;
  costoAcquistoUnitario: string | null;
  totaleRiga: string;
  fornitoreId: number | null;
  fornitore: Fornitore | null;
  dataOrdineFornitore: string | null;
  dataConfermaFornitore: string | null;
  arrivoPrevisto: string | null;
  arrivoEffettivo: string | null;
};
type Pagamento = {
  id: number;
  tipo: "ACCONTO" | "SALDO";
  importo: string;
  dataPagamento: string;
  note: string | null;
};
type Ordine = {
  id: number;
  clienteId: number;
  preventivoId: number | null;
  cliente: Cliente;
  dataOrdine: string;
  dataConsegnaPrevista: string | null;
  dataConsegnaEffettiva: string | null;
  stato: StatoOrdine;
  note: string | null;
  righe: RigaOrdine[];
  pagamenti: Pagamento[];
  totale: string;
  incassato: string;
  residuo: string;
};
type RigaForm = {
  id?: number;
  descrizione: string;
  categoria: string;
  quantita: string;
  prezzoUnitario: string;
  costoAcquistoUnitario: string;
  fornitoreId: string;
  dataOrdineFornitore: string;
  dataConfermaFornitore: string;
  arrivoPrevisto: string;
  arrivoEffettivo: string;
};
type OrdineForm = {
  clienteId: string;
  dataOrdine: string;
  dataConsegnaPrevista: string;
  dataConsegnaEffettiva: string;
  stato: StatoOrdine;
  note: string;
  righe: RigaForm[];
};
type PagamentoForm = { tipo: Pagamento["tipo"]; importo: string; dataPagamento: string; note: string };

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const statoLabel: Record<StatoOrdine, string> = {
  BOZZA: "Bozza",
  CONFERMATO: "Confermato",
  IN_ATTESA_FORNITORI: "In attesa fornitori",
  PRONTO_CONSEGNA: "Pronto per la consegna",
  CONSEGNATO: "Consegnato"
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateValue(value: string | null) { return value?.slice(0, 10) ?? ""; }
function dateLabel(value: string | null) { return value ? dateValue(value).split("-").reverse().join("/") : "—"; }
function money(value: string | number) { return euro.format(Number(value)); }

function emptyRiga(): RigaForm {
  return { descrizione: "", categoria: "", quantita: "1", prezzoUnitario: "", costoAcquistoUnitario: "", fornitoreId: "", dataOrdineFornitore: "", dataConfermaFornitore: "", arrivoPrevisto: "", arrivoEffettivo: "" };
}
function emptyForm(): OrdineForm {
  return { clienteId: "", dataOrdine: today(), dataConsegnaPrevista: "", dataConsegnaEffettiva: "", stato: "BOZZA", note: "", righe: [emptyRiga()] };
}
function emptyPagamento(): PagamentoForm { return { tipo: "ACCONTO", importo: "", dataPagamento: today(), note: "" }; }

function ordinePayload(ordine: Ordine) {
  return {
    clienteId: ordine.clienteId,
    dataOrdine: dateValue(ordine.dataOrdine),
    dataConsegnaPrevista: dateValue(ordine.dataConsegnaPrevista),
    dataConsegnaEffettiva: dateValue(ordine.dataConsegnaEffettiva),
    stato: ordine.stato,
    note: ordine.note ?? "",
    righe: ordine.righe.map((riga) => ({
      id: riga.id,
      descrizione: riga.descrizione,
      categoria: riga.categoria ?? "",
      quantita: riga.quantita,
      prezzoUnitario: riga.prezzoUnitario,
      costoAcquistoUnitario: riga.costoAcquistoUnitario ?? "",
      fornitoreId: riga.fornitoreId,
      dataOrdineFornitore: dateValue(riga.dataOrdineFornitore),
      dataConfermaFornitore: dateValue(riga.dataConfermaFornitore),
      arrivoPrevisto: dateValue(riga.arrivoPrevisto),
      arrivoEffettivo: dateValue(riga.arrivoEffettivo)
    }))
  };
}

export function OrdiniPage({ onGoClienti, onGoFornitori, focusOrderId = null }: { onGoClienti: () => void; onGoFornitori: () => void; focusOrderId?: number | null }) {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [form, setForm] = useState<OrdineForm>(emptyForm);
  const [paymentForm, setPaymentForm] = useState<PagamentoForm>(emptyPagamento);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(focusOrderId);
  const [paymentOrderId, setPaymentOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState(focusOrderId === null ? "" : String(focusOrderId));
  const [statusFilter, setStatusFilter] = useState("TUTTI");
  const focusScrolled = useRef(false);

  useEffect(() => {
    if (focusOrderId !== null) {
      setSearch(String(focusOrderId));
      setStatusFilter("TUTTI");
      setExpandedId(focusOrderId);
    }
  }, [focusOrderId]);

  const loadData = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch("/api/clienti"), fetch("/api/fornitori"), fetch("/api/ordini")]);
      if (responses.some((response) => !response.ok)) throw new Error("Impossibile caricare i dati degli ordini.");
      const [clientiData, fornitoriData, ordiniData] = await Promise.all(responses.map((response) => response.json()));
      setClienti(clientiData);
      setFornitori(fornitoriData);
      setOrdini(ordiniData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (focusOrderId === null || loading || focusScrolled.current) return;
    const element = document.getElementById(`ordine-${focusOrderId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      focusScrolled.current = true;
    }
  }, [focusOrderId, loading, ordini]);

  function clearFeedback() { setError(null); setSuccess(null); }

  function changeRiga(index: number, field: keyof RigaForm, value: string) {
    setForm((current) => ({ ...current, righe: current.righe.map((riga, i) => i === index ? { ...riga, [field]: value } : riga) }));
  }

  async function submitOrdine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();
    try {
      const payload = {
        ...form,
        clienteId: Number(form.clienteId),
        righe: form.righe.map((riga) => ({ ...riga, quantita: Number(riga.quantita), fornitoreId: riga.fornitoreId ? Number(riga.fornitoreId) : null }))
      };
      const response = await fetch(editingId === null ? "/api/ordini" : `/api/ordini/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile salvare l'ordine.");
      setForm(emptyForm());
      setEditingId(null);
      setExpandedId(result.id);
      await loadData();
      setSuccess(editingId === null ? "Ordine creato." : "Ordine aggiornato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setBusy(false);
    }
  }

  function editOrdine(ordine: Ordine) {
    const payload = ordinePayload(ordine);
    setEditingId(ordine.id);
    setForm({
      ...payload,
      clienteId: String(payload.clienteId),
      righe: payload.righe.map((riga) => ({
        ...riga, quantita: String(riga.quantita), fornitoreId: riga.fornitoreId === null ? "" : String(riga.fornitoreId)
      }))
    });
    clearFeedback();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingId(null); setForm(emptyForm()); setError(null); }

  async function deleteOrdine(ordine: Ordine) {
    if (!window.confirm(`Eliminare l'ordine n. ${ordine.id} e le sue righe?`)) return;
    setBusy(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/ordini/${ordine.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "Impossibile eliminare l'ordine.");
      }
      if (editingId === ordine.id) cancelEdit();
      if (expandedId === ordine.id) setExpandedId(null);
      await loadData();
      setSuccess("Ordine eliminato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setBusy(false);
    }
  }

  async function markArrived(ordine: Ordine, riga: RigaOrdine) {
    if (!riga.dataOrdineFornitore) {
      setError("Registra prima la data dell'ordine al fornitore nella scheda di modifica.");
      return;
    }
    setBusy(true);
    clearFeedback();
    try {
      const payload = ordinePayload(ordine);
      payload.righe = payload.righe.map((item) => item.id === riga.id ? { ...item, arrivoEffettivo: today() } : item);
      const response = await fetch(`/api/ordini/${ordine.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile registrare l'arrivo.");
      await loadData();
      setSuccess(`${riga.descrizione}: arrivo registrato.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setBusy(false);
    }
  }

  function openPayment(ordine: Ordine) {
    setExpandedId(ordine.id);
    setPaymentOrderId(ordine.id);
    setPaymentForm(emptyPagamento());
    clearFeedback();
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>, ordine: Ordine) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/ordini/${ordine.id}/pagamenti`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(paymentForm)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile registrare il pagamento.");
      setPaymentOrderId(null);
      setPaymentForm(emptyPagamento());
      await loadData();
      setSuccess(paymentForm.tipo === "SALDO" ? "Saldo registrato." : "Acconto registrato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePayment(ordine: Ordine, pagamento: Pagamento) {
    if (!window.confirm(`Eliminare il pagamento di ${money(pagamento.importo)} del ${dateLabel(pagamento.dataPagamento)}?`)) return;
    setBusy(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/ordini/${ordine.id}/pagamenti/${pagamento.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "Impossibile eliminare il pagamento.");
      }
      await loadData();
      setSuccess("Pagamento eliminato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setBusy(false);
    }
  }

  const filteredOrders = ordini.filter((ordine) => {
    const term = search.trim().toLocaleLowerCase("it-IT").replace(/^#/, "");
    const matchSearch = !term || String(ordine.id).includes(term) || `${ordine.cliente.nome} ${ordine.cliente.cognome}`.toLocaleLowerCase("it-IT").includes(term) || `${ordine.cliente.cognome} ${ordine.cliente.nome}`.toLocaleLowerCase("it-IT").includes(term);
    return matchSearch && (statusFilter === "TUTTI" || ordine.stato === statusFilter);
  });
  const anteprimaTotale = form.righe.reduce((sum, riga) => sum + (Number(riga.quantita) * Number(riga.prezzoUnitario) || 0), 0);
  const editingFromPreventivo = editingId !== null && ordini.some((ordine) => ordine.id === editingId && ordine.preventivoId !== null);

  return (
    <main className="shell orders-page">
      <header className="page-header">
        <div><p className="eyebrow">Gestionale Sormani</p><h1>Ordini</h1><p className="subtitle">Dalla vendita alla consegna, con fornitori e incassi sempre sotto controllo.</p></div>
        <span className="counter">{ordini.length} {ordini.length === 1 ? "ordine" : "ordini"}</span>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="notice" role="status">{success}</div>}

      <div className="orders-layout">
        <section className="panel order-form-panel">
          <h2>{editingId === null ? "Nuovo ordine" : `Modifica ordine n. ${editingId}`}</h2>
          {editingFromPreventivo && <p className="hint">Ordine da preventivo: mobili, fornitore e prezzo concordato restano invariati. Puoi aggiornare costi interni, date e stato.</p>}
          {!loading && clienti.length === 0 && <p className="hint">Per iniziare, <button className="text-button" onClick={onGoClienti} type="button">inserisci un cliente</button>.</p>}
          {!loading && fornitori.length === 0 && <p className="hint">Per aggiungere i mobili, <button className="text-button" onClick={onGoFornitori} type="button">inserisci un fornitore</button>.</p>}
          <form onSubmit={submitOrdine}>
            <label className="full-field">Cliente <span>*</span><select required disabled={editingFromPreventivo} value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })}><option value="">Seleziona un cliente</option>{clienti.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.cognome} {cliente.nome}</option>)}</select></label>
            <label>Data ordine <span>*</span><input required type="date" value={form.dataOrdine} onChange={(event) => setForm({ ...form, dataOrdine: event.target.value })} /></label>
            <label>Consegna prevista {form.stato !== "BOZZA" && <span>*</span>}<input required={form.stato !== "BOZZA"} type="date" value={form.dataConsegnaPrevista} onChange={(event) => setForm({ ...form, dataConsegnaPrevista: event.target.value })} /></label>
            <label>Stato<select value={form.stato} onChange={(event) => setForm({ ...form, stato: event.target.value as StatoOrdine, dataConsegnaEffettiva: event.target.value === "CONSEGNATO" ? form.dataConsegnaEffettiva : "" })}>{Object.entries(statoLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {form.stato === "CONSEGNATO" && <label>Consegna effettiva <span>*</span><input required type="date" value={form.dataConsegnaEffettiva} onChange={(event) => setForm({ ...form, dataConsegnaEffettiva: event.target.value })} /></label>}
            <div className="full-field">
              <div className="form-section-heading"><h3 className="section-title">Mobili dell'ordine</h3><button className="secondary" disabled={editingFromPreventivo} onClick={() => setForm({ ...form, righe: [...form.righe, emptyRiga()] })} type="button">+ Aggiungi mobile</button></div>
              <div className="order-lines detailed-lines">
                {form.righe.map((riga, index) => (
                  <div className="detailed-line" key={riga.id ?? `new-${index}`}>
                    <div className="line-title"><strong>Mobile {index + 1}</strong><button className="danger" disabled={form.righe.length === 1 || busy || editingFromPreventivo} onClick={() => setForm({ ...form, righe: form.righe.filter((_, i) => i !== index) })} type="button">Rimuovi</button></div>
                    <div className="line-fields">
                      <label className="line-wide">Categoria mobile {!riga.id && <span>*</span>}<select required={!riga.id} disabled={editingFromPreventivo && Boolean(riga.categoria)} value={riga.categoria} onChange={(event) => changeRiga(index, "categoria", event.target.value)}><option value="">{riga.id ? "Non classificata (riga storica)" : "Seleziona una categoria"}</option>{Object.entries(categorieMobile).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{riga.id && riga.descrizione && <small>Descrizione originale: {riga.descrizione}</small>}</label>
                      <label>Quantità <span>*</span><input required readOnly={editingFromPreventivo} type="number" min="1" step="1" value={riga.quantita} onChange={(event) => changeRiga(index, "quantita", event.target.value)} /></label>
                      <label>Prezzo al cliente (€) <span>*</span><input required readOnly={editingFromPreventivo} type="number" min="0" step="0.01" value={riga.prezzoUnitario} onChange={(event) => changeRiga(index, "prezzoUnitario", event.target.value)} /></label>
                      <label>Costo d'acquisto unitario (€) {!riga.id && <span>*</span>}<input required={!riga.id} type="number" min="0" step="0.01" value={riga.costoAcquistoUnitario} onChange={(event) => changeRiga(index, "costoAcquistoUnitario", event.target.value)} placeholder="Dato interno" /></label>
                      <label className="line-wide">Fornitore {!riga.id && <span>*</span>}<select required={!riga.id} disabled={editingFromPreventivo} value={riga.fornitoreId} onChange={(event) => changeRiga(index, "fornitoreId", event.target.value)}><option value="">{riga.id ? "Non assegnato (riga precedente)" : "Seleziona un fornitore"}</option>{fornitori.map((fornitore) => <option key={fornitore.id} value={fornitore.id}>{fornitore.nome}</option>)}</select></label>
                      <label>Ordinato al fornitore<input type="date" value={riga.dataOrdineFornitore} onChange={(event) => changeRiga(index, "dataOrdineFornitore", event.target.value)} /></label>
                      <label>Confermato dal fornitore<input type="date" value={riga.dataConfermaFornitore} onChange={(event) => changeRiga(index, "dataConfermaFornitore", event.target.value)} /></label>
                      <label>Arrivo previsto<input type="date" value={riga.arrivoPrevisto} onChange={(event) => changeRiga(index, "arrivoPrevisto", event.target.value)} /></label>
                      <label>Arrivo effettivo<input type="date" value={riga.arrivoEffettivo} onChange={(event) => changeRiga(index, "arrivoEffettivo", event.target.value)} /></label>
                    </div>
                  </div>
                ))}
              </div>
              <p className="order-preview">Totale indicativo: <strong>{money(anteprimaTotale)}</strong></p>
            </div>
            <label className="full-field">Note ordine<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="form-actions"><button disabled={busy || clienti.length === 0 || (fornitori.length === 0 && editingId === null)} type="submit">{busy ? "Salvataggio…" : editingId === null ? "Salva ordine" : "Salva modifiche"}</button>{editingId !== null && <button className="secondary" disabled={busy} onClick={cancelEdit} type="button">Annulla</button>}</div>
          </form>
        </section>

        <section className="panel list-panel order-results">
          <div className="results-heading"><h2>Gestione ordini</h2></div>
              <div className="order-filters"><label>Cerca cliente o numero<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Es. Rossi o 12" /></label><label>Stato<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="TUTTI">Tutti gli stati</option>{Object.entries(statoLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
              {loading ? <p className="empty">Caricamento…</p> : filteredOrders.length === 0 ? <p className="empty">Nessun ordine corrisponde alla ricerca.</p> : (
                <div className="client-list">
                  {filteredOrders.map((ordine) => {
                    const arrived = ordine.righe.filter((riga) => riga.arrivoEffettivo).length;
                    const expanded = expandedId === ordine.id;
                    return (
                      <article className="order-card detailed-order-card" id={`ordine-${ordine.id}`} key={ordine.id}>
                        <div className="order-heading"><div><h3>Ordine n. {ordine.id}</h3><p>{ordine.cliente.nome} {ordine.cliente.cognome} · {dateLabel(ordine.dataOrdine)}{ordine.preventivoId !== null ? ` · Da preventivo n. ${ordine.preventivoId}` : " · Diretto"}</p></div><span className={`status-badge ${ordine.stato.toLowerCase()}`}>{statoLabel[ordine.stato]}</span></div>
                        <div className="order-summary"><span><small>Mobili arrivati</small><strong>{arrived} / {ordine.righe.length}</strong></span><span><small>Consegna prevista</small><strong>{dateLabel(ordine.dataConsegnaPrevista)}</strong></span><span><small>Residuo</small><strong>{money(ordine.residuo)}</strong></span></div>
                        <div className="order-card-actions"><button className="secondary" onClick={() => setExpandedId(expanded ? null : ordine.id)} type="button">{expanded ? "Chiudi dettagli" : "Apri scheda"}</button><button className="secondary" disabled={busy} onClick={() => editOrdine(ordine)} type="button">Modifica</button>{ordine.preventivoId === null && <button className="danger" disabled={busy} onClick={() => void deleteOrdine(ordine)} type="button">Elimina</button>}</div>
                        {expanded && <div className="order-details">
                          <h4>Mobili e fornitori</h4>
                          <div className="supply-list">{ordine.righe.map((riga) => <div className="supply-item" key={riga.id}><div className="supply-item-top"><div><strong>{riga.descrizione}</strong><small>{riga.fornitore?.nome ?? "Fornitore da assegnare"} · {riga.quantita} × {money(riga.prezzoUnitario)} al cliente</small><small>Costo d'acquisto unitario (interno): {riga.costoAcquistoUnitario === null ? "non indicato" : money(riga.costoAcquistoUnitario)}</small></div><span className={`supply-state ${riga.arrivoEffettivo ? "arrived" : "pending"}`}>{riga.arrivoEffettivo ? "Arrivato" : "Ancora atteso"}</span></div><div className="supply-dates"><span>Ordinato: {dateLabel(riga.dataOrdineFornitore)}</span><span>Confermato: {dateLabel(riga.dataConfermaFornitore)}</span><span>Previsto: {dateLabel(riga.arrivoPrevisto)}</span><span>Arrivato: {dateLabel(riga.arrivoEffettivo)}</span></div>{!riga.arrivoEffettivo && <button className="secondary compact-button" disabled={busy} onClick={() => void markArrived(ordine, riga)} type="button">Segna arrivato oggi</button>}</div>)}</div>
                          <h4>Pagamenti</h4>
                          <div className="payment-summary"><span>Totale <strong>{money(ordine.totale)}</strong></span><span>Incassato <strong>{money(ordine.incassato)}</strong></span><span>Residuo <strong>{money(ordine.residuo)}</strong></span></div>
                          {ordine.pagamenti.length > 0 && <div className="payment-list">{ordine.pagamenti.map((pagamento) => <div className="payment-item" key={pagamento.id}><span><strong>{pagamento.tipo === "ACCONTO" ? "Acconto" : "Saldo"} · {money(pagamento.importo)}</strong><small>{dateLabel(pagamento.dataPagamento)}{pagamento.note ? ` · ${pagamento.note}` : ""}</small></span><button className="danger compact-button" disabled={busy} onClick={() => void deletePayment(ordine, pagamento)} type="button">Elimina</button></div>)}</div>}
                          {Number(ordine.residuo) > 0 && <button className="secondary compact-button" disabled={busy} onClick={() => openPayment(ordine)} type="button">+ Registra acconto o saldo</button>}
                          {paymentOrderId === ordine.id && <form className="payment-form" onSubmit={(event) => void submitPayment(event, ordine)}><label>Tipo<select value={paymentForm.tipo} onChange={(event) => setPaymentForm({ ...paymentForm, tipo: event.target.value as Pagamento["tipo"], importo: event.target.value === "SALDO" ? ordine.residuo : "" })}><option value="ACCONTO">Acconto</option><option value="SALDO">Saldo</option></select></label><label>Importo (€) <span>*</span><input required type="number" min="0.01" step="0.01" value={paymentForm.importo} onChange={(event) => setPaymentForm({ ...paymentForm, importo: event.target.value })} /></label><label>Data <span>*</span><input required type="date" value={paymentForm.dataPagamento} onChange={(event) => setPaymentForm({ ...paymentForm, dataPagamento: event.target.value })} /></label><label className="full-field">Note<input value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></label><div className="form-actions"><button disabled={busy} type="submit">Registra pagamento</button><button className="secondary" onClick={() => setPaymentOrderId(null)} type="button">Annulla</button></div></form>}
                          {ordine.note && <p className="order-note">Note: {ordine.note}</p>}
                        </div>}
                      </article>
                    );
                  })}
                </div>
              )}
        </section>
      </div>
    </main>
  );
}
