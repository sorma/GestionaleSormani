import { type FormEvent, useCallback, useEffect, useState } from "react";

type StatoOrdine = "BOZZA" | "CONFERMATO" | "IN_ATTESA_FORNITORI" | "PRONTO_CONSEGNA" | "CONSEGNATO";
type Riga = { id: number; descrizione: string; arrivoPrevisto: string | null; arrivoEffettivo: string | null };
type Ordine = {
  id: number; stato: StatoOrdine; dataConsegnaPrevista: string | null;
  cliente: { nome: string; cognome: string; indirizzo?: string | null; citta?: string | null; telefono?: string | null };
  righe: Riga[];
};
type Montatore = { id: number; nome: string; cognome: string; telefono: string; costoGiornaliero: string };
type Lavoro = {
  id: number; ordineId: number; ordine: Ordine; tipoIncaricato: "TITOLARE" | "MONTATORE";
  montatoreId: number | null; montatore: Montatore | null;
  dataInizio: string; giorni: number; stato: "PIANIFICATO" | "COMPLETATO";
  dataCompletamento: string | null; note: string | null;
  costoGiornalieroApplicato: string; costoTotale: string;
  tuttiArrivati: boolean; daRipianificare: boolean; arrivoDaDefinire: boolean;
};
type PianoForm = { ordineId: string; dataInizio: string; giorni: string; incaricato: string; note: string };

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateValue(value: string | null) { return value?.slice(0, 10) ?? ""; }
function dateLabel(value: string | null) { return value ? dateValue(value).split("-").reverse().join("/") : "—"; }
function nextDate(value: string) {
  const date = new Date(`${dateValue(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function endDate(start: string, days: number) {
  const date = new Date(`${dateValue(start)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return dateLabel(date.toISOString());
}
function lastArrival(order: Ordine) {
  const dates = order.righe.map((riga) => dateValue(riga.arrivoEffettivo ?? riga.arrivoPrevisto));
  return dates.every(Boolean) && dates.length ? dates.sort().at(-1)! : null;
}
function emptyForm(): PianoForm { return { ordineId: "", dataInizio: "", giorni: "1", incaricato: "TITOLARE", note: "" }; }

export function LavoriPage({ onOpenOrdine, onGoMontatori }: { onOpenOrdine: (id: number) => void; onGoMontatori: () => void }) {
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [montatori, setMontatori] = useState<Montatore[]>([]);
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [form, setForm] = useState<PianoForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [completionDates, setCompletionDates] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch("/api/ordini"), fetch("/api/montatori"), fetch("/api/lavori")]);
      if (responses.some((response) => !response.ok)) throw new Error("Impossibile caricare i lavori.");
      const [orders, workers, jobs] = await Promise.all(responses.map((response) => response.json()));
      setOrdini(orders); setMontatori(workers); setLavori(jobs); setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  const assignedIds = new Set(lavori.map((lavoro) => lavoro.ordineId));
  const daPianificare = ordini.filter((ordine) => ordine.stato !== "BOZZA" && ordine.stato !== "CONSEGNATO" && !assignedIds.has(ordine.id));
  const pianificati = lavori.filter((lavoro) => lavoro.stato === "PIANIFICATO");
  const completati = lavori.filter((lavoro) => lavoro.stato === "COMPLETATO");
  const selectedOrder = ordini.find((ordine) => String(ordine.id) === form.ordineId);
  const requiredAfter = selectedOrder ? lastArrival(selectedOrder) : null;

  function planOrder(ordine: Ordine) {
    const arrival = lastArrival(ordine);
    setEditingId(null);
    setForm({ ordineId: String(ordine.id), dataInizio: arrival ? nextDate(arrival) : "", giorni: "1", incaricato: "TITOLARE", note: "" });
    setError(null); setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editWork(lavoro: Lavoro) {
    setEditingId(lavoro.id);
    setForm({ ordineId: String(lavoro.ordineId), dataInizio: dateValue(lavoro.dataInizio), giorni: String(lavoro.giorni),
      incaricato: lavoro.tipoIncaricato === "TITOLARE" ? "TITOLARE" : String(lavoro.montatoreId), note: lavoro.note ?? "" });
    setError(null); setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      const owner = form.incaricato === "TITOLARE";
      const payload = { ordineId: Number(form.ordineId), dataInizio: form.dataInizio, giorni: Number(form.giorni),
        tipoIncaricato: owner ? "TITOLARE" : "MONTATORE", montatoreId: owner ? null : Number(form.incaricato), note: form.note };
      const response = await fetch(editingId === null ? "/api/lavori" : `/api/lavori/${editingId}`, {
        method: editingId === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile salvare il lavoro.");
      setEditingId(null); setForm(emptyForm());
      await loadData(); setSuccess("Consegna pianificata.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  async function complete(lavoro: Lavoro) {
    const date = completionDates[lavoro.id] ?? today();
    if (!window.confirm(`Segnare completata la consegna dell'ordine n. ${lavoro.ordineId} in data ${dateLabel(date)}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/lavori/${lavoro.id}/completa`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataCompletamento: date })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile completare il lavoro.");
      await loadData(); setSuccess("Consegna completata e ordine aggiornato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  return (
    <main className="shell works-page">
      <header className="page-header">
        <div><p className="eyebrow">Gestionale Sormani</p><h1>Lavori</h1><p className="subtitle">Pianifica una consegna per ordine, dopo l'arrivo della merce.</p></div>
        <span className="counter">{pianificati.length} {pianificati.length === 1 ? "lavoro pianificato" : "lavori pianificati"}</span>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="notice" role="status">{success}</div>}

      <div className="orders-layout">
        <section className="panel work-form-panel">
          <h2>{editingId === null ? "Pianifica consegna" : `Ripianifica lavoro n. ${editingId}`}</h2>
          <p className="hint">I giorni sono consecutivi. La tariffa del montatore viene salvata nel lavoro; per il titolare il costo è zero.</p>
          <form onSubmit={(event) => void save(event)}>
            <label className="full-field">Ordine <span>*</span><select required disabled={editingId !== null} value={form.ordineId} onChange={(event) => setForm({ ...form, ordineId: event.target.value, dataInizio: "" })}><option value="">Seleziona un ordine</option>{editingId !== null && selectedOrder && <option value={selectedOrder.id}>Ordine n. {selectedOrder.id} · {selectedOrder.cliente.nome} {selectedOrder.cliente.cognome}</option>}{daPianificare.map((ordine) => <option key={ordine.id} value={ordine.id}>Ordine n. {ordine.id} · {ordine.cliente.nome} {ordine.cliente.cognome}</option>)}</select></label>
            {selectedOrder && <p className="full-field work-arrival-hint">Ultimo arrivo previsto/effettivo: <strong>{dateLabel(requiredAfter)}</strong>. La consegna deve essere successiva.</p>}
            <label>Data inizio consegna <span>*</span><input required type="date" min={requiredAfter ? nextDate(requiredAfter) : undefined} value={form.dataInizio} onChange={(event) => setForm({ ...form, dataInizio: event.target.value })} /></label>
            <label>Giorni necessari <span>*</span><input required type="number" min="1" max="365" step="1" value={form.giorni} onChange={(event) => setForm({ ...form, giorni: event.target.value })} /></label>
            <label className="full-field">Incaricato <span>*</span><select required value={form.incaricato} onChange={(event) => setForm({ ...form, incaricato: event.target.value })}><option value="TITOLARE">Titolare · nessun costo aggiuntivo</option>{montatori.map((item) => <option key={item.id} value={item.id}>{item.nome} {item.cognome} · {euro.format(Number(item.costoGiornaliero))}/giorno</option>)}</select></label>
            {montatori.length === 0 && <p className="full-field work-arrival-hint">Per assegnare un esterno, <button className="text-button" onClick={onGoMontatori} type="button">aggiungi un montatore</button>.</p>}
            <label className="full-field">Note interne<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="form-actions"><button disabled={busy || !form.ordineId || !requiredAfter} type="submit">{busy ? "Salvataggio…" : editingId === null ? "Pianifica lavoro" : "Salva ripianificazione"}</button>{editingId !== null && <button className="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); setError(null); }} type="button">Annulla</button>}</div>
          </form>
        </section>

        <section className="panel list-panel work-results">
          <h2>Da pianificare</h2>
          {loading ? <p className="empty">Caricamento…</p> : daPianificare.length === 0 ? <p className="empty">Nessun ordine in attesa di pianificazione.</p> : (
            <div className="client-list">{daPianificare.map((ordine) => <article className="work-card" key={ordine.id}>
              <div className="work-card-top"><div><h3>Ordine n. {ordine.id}</h3><p>{ordine.cliente.nome} {ordine.cliente.cognome}</p></div><span className="status-badge bozza">Da pianificare</span></div>
              <p>Ultimo arrivo previsto/effettivo: <strong>{dateLabel(lastArrival(ordine))}</strong></p>
              {!lastArrival(ordine) && <p className="work-warning">Manca la data di arrivo di almeno un mobile. Aggiornala nell'ordine.</p>}
              <div className="order-card-actions"><button disabled={!lastArrival(ordine)} onClick={() => planOrder(ordine)} type="button">Pianifica</button><button className="secondary" onClick={() => onOpenOrdine(ordine.id)} type="button">Apri ordine</button></div>
            </article>)}</div>
          )}
        </section>
      </div>

      <section className="panel work-section">
        <h2>Lavori pianificati</h2>
        {loading ? <p className="empty">Caricamento…</p> : pianificati.length === 0 ? <p className="empty">Nessun lavoro pianificato.</p> : <div className="work-grid">{pianificati.map((lavoro) => <article className="work-card" key={lavoro.id}>
          <div className="work-card-top"><div><h3>Ordine n. {lavoro.ordineId}</h3><p>{lavoro.ordine.cliente.nome} {lavoro.ordine.cliente.cognome}</p></div><span className={`status-badge ${lavoro.daRipianificare ? "rifiutato" : "confermato"}`}>{lavoro.daRipianificare ? "Da ripianificare" : "Pianificato"}</span></div>
          <p>Consegna: <strong>{dateLabel(lavoro.dataInizio)}</strong> · {lavoro.giorni} {lavoro.giorni === 1 ? "giorno" : "giorni"} (fino al {endDate(lavoro.dataInizio, lavoro.giorni)})</p>
          <p>Incaricato: <strong>{lavoro.tipoIncaricato === "TITOLARE" ? "Titolare" : `${lavoro.montatore?.nome} ${lavoro.montatore?.cognome}`}</strong></p>
          <p>Costo interno: <strong>{euro.format(Number(lavoro.costoTotale))}</strong></p>
          {lavoro.ordine.cliente.indirizzo && <p>Indirizzo: {lavoro.ordine.cliente.indirizzo}{lavoro.ordine.cliente.citta ? `, ${lavoro.ordine.cliente.citta}` : ""}</p>}
          {lavoro.daRipianificare && <p className="work-warning">L'arrivo della merce è successivo alla data pianificata. Scegli una nuova data.</p>}
          {lavoro.arrivoDaDefinire && <p className="work-warning">Manca una data di arrivo aggiornata: verifica l'ordine.</p>}
          {!lavoro.tuttiArrivati && <p className="work-warning">Merce ancora attesa: il lavoro non può essere completato.</p>}
          {lavoro.note && <p>Note: {lavoro.note}</p>}
          <div className="order-card-actions"><button className="secondary" disabled={busy} onClick={() => editWork(lavoro)} type="button">Ripianifica</button><button className="secondary" onClick={() => onOpenOrdine(lavoro.ordineId)} type="button">Apri ordine</button></div>
          <div className="work-completion"><label>Data completamento<input type="date" min={dateValue(lavoro.dataInizio)} value={completionDates[lavoro.id] ?? today()} onChange={(event) => setCompletionDates({ ...completionDates, [lavoro.id]: event.target.value })} /></label><button disabled={busy || !lavoro.tuttiArrivati || lavoro.daRipianificare || lavoro.arrivoDaDefinire} onClick={() => void complete(lavoro)} type="button">Segna completato</button></div>
        </article>)}</div>}
      </section>

      {completati.length > 0 && <section className="panel work-section"><h2>Lavori completati</h2><div className="work-grid">{completati.map((lavoro) => <article className="work-card" key={lavoro.id}><div className="work-card-top"><div><h3>Ordine n. {lavoro.ordineId}</h3><p>{lavoro.ordine.cliente.nome} {lavoro.ordine.cliente.cognome}</p></div><span className="status-badge consegnato">Completato</span></div><p>Completato il {dateLabel(lavoro.dataCompletamento)} · {lavoro.giorni} {lavoro.giorni === 1 ? "giorno" : "giorni"}</p><p>Incaricato: {lavoro.tipoIncaricato === "TITOLARE" ? "Titolare" : `${lavoro.montatore?.nome} ${lavoro.montatore?.cognome}`} · costo interno {euro.format(Number(lavoro.costoTotale))}</p><button className="secondary compact-button" onClick={() => onOpenOrdine(lavoro.ordineId)} type="button">Apri ordine</button></article>)}</div></section>}
    </main>
  );
}
