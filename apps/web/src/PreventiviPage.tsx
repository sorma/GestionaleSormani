import { type FormEvent, useCallback, useEffect, useState } from "react";
import { categorieMobile, type CategoriaMobile } from "./categorieMobile";

type Cliente = { id: number; nome: string; cognome: string };
type Fornitore = { id: number; nome: string };
type Stato = "BOZZA" | "INVIATO" | "APPROVATO" | "RIFIUTATO" | "CONVERTITO";
type Opzione = { id: number; fornitoreId: number; fornitore: Fornitore; prezzoVendita: string; totaleOpzione: string; scelta: boolean };
type Voce = { id: number; descrizione: string; categoria: CategoriaMobile | null; quantita: number; opzioni: Opzione[] };
type Preventivo = {
  id: number; clienteId: number; cliente: Cliente; data: string; stato: Stato; note: string | null;
  voci: Voce[]; totaleScelto: string | null; ordine: { id: number } | null;
};
type OpzioneForm = { fornitoreId: string; prezzoVendita: string };
type VoceForm = { categoria: string; quantita: string; opzioni: OpzioneForm[] };
type PreventivoForm = { clienteId: string; data: string; note: string; voci: VoceForm[] };

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const statoLabel: Record<Stato, string> = {
  BOZZA: "Bozza", INVIATO: "Inviato", APPROVATO: "Approvato", RIFIUTATO: "Rifiutato", CONVERTITO: "Convertito in ordine"
};
function today() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function dateValue(value: string) { return value.slice(0, 10); }
function dateLabel(value: string) { return dateValue(value).split("-").reverse().join("/"); }
function emptyVoce(): VoceForm { return { categoria: "", quantita: "1", opzioni: [{ fornitoreId: "", prezzoVendita: "" }] }; }
function emptyForm(): PreventivoForm { return { clienteId: "", data: today(), note: "", voci: [emptyVoce()] }; }

export function PreventiviPage({ onGoClienti, onGoFornitori, onOpenOrdine }: {
  onGoClienti: () => void; onGoFornitori: () => void; onOpenOrdine: (id: number) => void;
}) {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [form, setForm] = useState<PreventivoForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [scelte, setScelte] = useState<Record<number, string>>({});
  const [costi, setCosti] = useState<Record<number, string>>({});
  const [dataConsegna, setDataConsegna] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch("/api/clienti"), fetch("/api/fornitori"), fetch("/api/preventivi")]);
      if (responses.some((response) => !response.ok)) throw new Error("Impossibile caricare i preventivi.");
      const [clients, suppliers, quotes] = await Promise.all(responses.map((response) => response.json()));
      setClienti(clients); setFornitori(suppliers); setPreventivi(quotes); setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadData(); }, [loadData]);

  function changeVoce(index: number, patch: Partial<VoceForm>) {
    setForm((current) => ({ ...current, voci: current.voci.map((voce, i) => i === index ? { ...voce, ...patch } : voce) }));
  }
  function changeOpzione(voceIndex: number, optionIndex: number, patch: Partial<OpzioneForm>) {
    setForm((current) => ({ ...current, voci: current.voci.map((voce, i) => i === voceIndex ? {
      ...voce, opzioni: voce.opzioni.map((option, j) => j === optionIndex ? { ...option, ...patch } : option)
    } : voce) }));
  }
  function cancelEdit() { setEditingId(null); setForm(emptyForm()); setError(null); }
  function editPreventivo(item: Preventivo) {
    setEditingId(item.id);
    setForm({
      clienteId: String(item.clienteId), data: dateValue(item.data), note: item.note ?? "",
      voci: item.voci.map((voce) => ({ categoria: voce.categoria ?? "", quantita: String(voce.quantita),
        opzioni: voce.opzioni.map((option) => ({ fornitoreId: String(option.fornitoreId), prezzoVendita: option.prezzoVendita })) }))
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePreventivo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      const payload = {
        clienteId: Number(form.clienteId), data: form.data, note: form.note,
        voci: form.voci.map((voce) => ({ categoria: voce.categoria, quantita: Number(voce.quantita),
          opzioni: voce.opzioni.map((option) => ({ fornitoreId: Number(option.fornitoreId), prezzoVendita: option.prezzoVendita })) }))
      };
      const response = await fetch(editingId === null ? "/api/preventivi" : `/api/preventivi/${editingId}`, {
        method: editingId === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile salvare il preventivo.");
      setExpandedId(result.id); setEditingId(null); setForm(emptyForm());
      await loadData(); setSuccess("Preventivo salvato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  async function changeStatus(item: Preventivo, stato: "INVIATO" | "APPROVATO" | "RIFIUTATO") {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const body = stato === "APPROVATO" ? {
        stato, scelte: item.voci.map((voce) => ({ voceId: voce.id, opzioneId: Number(scelte[voce.id] ?? (voce.opzioni.length === 1 ? voce.opzioni[0].id : 0)) }))
      } : { stato };
      const response = await fetch(`/api/preventivi/${item.id}/stato`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile aggiornare il preventivo.");
      await loadData(); setSuccess(`Preventivo ${statoLabel[stato].toLowerCase()}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  async function converti(event: FormEvent<HTMLFormElement>, item: Preventivo) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      const selected = item.voci.map((voce) => voce.opzioni.find((option) => option.scelta)!);
      const response = await fetch(`/api/preventivi/${item.id}/converti`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataOrdine: today(), dataConsegnaPrevista: dataConsegna,
          costi: selected.map((option) => ({ opzioneId: option.id, costoAcquistoUnitario: costi[option.id] })) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile creare l'ordine.");
      onOpenOrdine(result.ordineId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  async function deletePreventivo(item: Preventivo) {
    if (!window.confirm(`Eliminare il preventivo n. ${item.id}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/preventivi/${item.id}`, { method: "DELETE" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message ?? "Impossibile eliminare il preventivo."); }
      if (editingId === item.id) cancelEdit();
      if (expandedId === item.id) setExpandedId(null);
      await loadData(); setSuccess("Preventivo eliminato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  return (
    <main className="shell quotes-page">
      <header className="page-header">
        <div><p className="eyebrow">Gestionale Sormani</p><h1>Preventivi</h1><p className="subtitle">Proponi alternative, scarica il PDF e crea l'ordine dopo l'approvazione.</p></div>
        <span className="counter">{preventivi.length} {preventivi.length === 1 ? "preventivo" : "preventivi"}</span>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="notice" role="status">{success}</div>}
      <div className="orders-layout">
        <section className="panel quote-form-panel">
          <h2>{editingId === null ? "Nuovo preventivo" : `Modifica preventivo n. ${editingId}`}</h2>
          {!loading && clienti.length === 0 && <p className="hint">Prima <button className="text-button" onClick={onGoClienti} type="button">inserisci un cliente</button>.</p>}
          {!loading && fornitori.length === 0 && <p className="hint">Prima <button className="text-button" onClick={onGoFornitori} type="button">inserisci un fornitore</button>.</p>}
          <form onSubmit={(event) => void savePreventivo(event)}>
            <label className="full-field">Cliente <span>*</span><select required value={form.clienteId} onChange={(event) => setForm({ ...form, clienteId: event.target.value })}><option value="">Seleziona un cliente</option>{clienti.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.cognome} {cliente.nome}</option>)}</select></label>
            <label>Data preventivo <span>*</span><input required type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} /></label>
            <div className="full-field">
              <div className="form-section-heading"><h3 className="section-title">Mobili da proporre</h3><button className="secondary" onClick={() => setForm({ ...form, voci: [...form.voci, emptyVoce()] })} type="button">+ Aggiungi mobile</button></div>
              <div className="order-lines detailed-lines">{form.voci.map((voce, index) => (
                <div className="detailed-line" key={index}>
                  <div className="line-title"><strong>Mobile {index + 1}</strong><button className="danger" disabled={form.voci.length === 1} onClick={() => setForm({ ...form, voci: form.voci.filter((_, i) => i !== index) })} type="button">Rimuovi</button></div>
                  <div className="line-fields">
                    <label className="line-wide">Categoria mobile <span>*</span><select required value={voce.categoria} onChange={(event) => changeVoce(index, { categoria: event.target.value })}><option value="">Seleziona una categoria</option>{Object.entries(categorieMobile).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editingId !== null && !voce.categoria && <small>La voce storica va classificata prima di salvare le modifiche.</small>}</label>
                    <label>Quantità <span>*</span><input required type="number" min="1" step="1" value={voce.quantita} onChange={(event) => changeVoce(index, { quantita: event.target.value })} /></label>
                  </div>
                  <h4 className="quote-subtitle">Alternative di fornitore</h4>
                  {voce.opzioni.map((option, optionIndex) => (
                    <div className="quote-option-fields" key={optionIndex}>
                      <label>Fornitore <span>*</span><select required value={option.fornitoreId} onChange={(event) => changeOpzione(index, optionIndex, { fornitoreId: event.target.value })}><option value="">Seleziona</option>{fornitori.map((fornitore) => <option key={fornitore.id} value={fornitore.id}>{fornitore.nome}</option>)}</select></label>
                      <label>Prezzo al cliente (€) <span>*</span><input required type="number" min="0" step="0.01" value={option.prezzoVendita} onChange={(event) => changeOpzione(index, optionIndex, { prezzoVendita: event.target.value })} /></label>
                      <button className="danger compact-button" disabled={voce.opzioni.length === 1} onClick={() => changeVoce(index, { opzioni: voce.opzioni.filter((_, i) => i !== optionIndex) })} type="button" aria-label={`Rimuovi alternativa ${optionIndex + 1}`}>×</button>
                    </div>
                  ))}
                  <button className="secondary compact-button" onClick={() => changeVoce(index, { opzioni: [...voce.opzioni, { fornitoreId: "", prezzoVendita: "" }] })} type="button">+ Aggiungi alternativa</button>
                </div>
              ))}</div>
            </div>
            <label className="full-field">Note per il cliente<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="form-actions"><button disabled={busy || clienti.length === 0 || fornitori.length === 0} type="submit">{busy ? "Salvataggio…" : editingId === null ? "Salva preventivo" : "Salva modifiche"}</button>{editingId !== null && <button className="secondary" onClick={cancelEdit} type="button">Annulla</button>}</div>
          </form>
        </section>

        <section className="panel list-panel quote-results">
          <h2>Preventivi</h2>
          {loading ? <p className="empty">Caricamento…</p> : preventivi.length === 0 ? <p className="empty">Nessun preventivo. Crea il primo usando il modulo.</p> : (
            <div className="client-list">{preventivi.map((item) => {
              const expanded = expandedId === item.id;
              return <article className="order-card detailed-order-card" key={item.id}>
                <div className="order-heading"><div><h3>Preventivo n. {item.id}</h3><p>{item.cliente.nome} {item.cliente.cognome} · {dateLabel(item.data)}</p></div><span className={`status-badge quote-status ${item.stato.toLowerCase()}`}>{statoLabel[item.stato]}</span></div>
                <p className="quote-summary">{item.voci.length} {item.voci.length === 1 ? "mobile" : "mobili"} · {item.totaleScelto ? `Totale concordato: ${euro.format(Number(item.totaleScelto))}` : "Totale da definire dopo la scelta delle alternative"}</p>
                <div className="order-card-actions">
                  <button className="secondary" onClick={() => { setExpandedId(expanded ? null : item.id); setScelte(Object.fromEntries(item.voci.map((voce) => [voce.id, String(voce.opzioni.find((option) => option.scelta)?.id ?? (voce.opzioni.length === 1 ? voce.opzioni[0].id : ""))]))); }} type="button">{expanded ? "Chiudi" : "Apri scheda"}</button>
                  <a className="button-link secondary" href={`/api/preventivi/${item.id}/pdf`} download={`preventivo-${item.id}.pdf`}>Scarica PDF</a>
                  {item.stato === "BOZZA" && <button className="secondary" disabled={busy} onClick={() => editPreventivo(item)} type="button">Modifica</button>}
                  {(item.stato === "BOZZA" || item.stato === "INVIATO" || item.stato === "RIFIUTATO") && <button className="danger" disabled={busy} onClick={() => void deletePreventivo(item)} type="button">Elimina</button>}
                  {item.ordine && <button className="secondary" onClick={() => onOpenOrdine(item.ordine!.id)} type="button">Apri ordine n. {item.ordine.id}</button>}
                </div>
                {expanded && <div className="order-details">
                  <h4>Proposta al cliente</h4>
                  {item.voci.map((voce) => <div className="quote-voice" key={voce.id}>
                    <strong>{voce.descrizione} · quantità {voce.quantita}</strong>
                    {voce.opzioni.map((option) => <div className={`quote-option ${option.scelta ? "chosen" : ""}`} key={option.id}>
                      <span>{option.fornitore.nome}{option.scelta ? " · scelta dal cliente" : ""}</span>
                      <span>{euro.format(Number(option.prezzoVendita))} cad. · {euro.format(Number(option.totaleOpzione))}</span>
                    </div>)}
                    {item.stato === "INVIATO" && <label>Alternativa approvata dal cliente<select value={scelte[voce.id] ?? (voce.opzioni.length === 1 ? String(voce.opzioni[0].id) : "")} onChange={(event) => setScelte({ ...scelte, [voce.id]: event.target.value })}><option value="">Seleziona</option>{voce.opzioni.map((option) => <option key={option.id} value={option.id}>{option.fornitore.nome} · {euro.format(Number(option.totaleOpzione))}</option>)}</select></label>}
                  </div>)}
                  {item.note && <p className="order-note">Note: {item.note}</p>}
                  <div className="order-card-actions">
                    {item.stato === "BOZZA" && <button disabled={busy} onClick={() => void changeStatus(item, "INVIATO")} type="button">Segna inviato</button>}
                    {item.stato === "INVIATO" && <><button disabled={busy || item.voci.some((voce) => !(scelte[voce.id] || voce.opzioni.length === 1))} onClick={() => void changeStatus(item, "APPROVATO")} type="button">Approva scelte</button><button className="secondary" disabled={busy} onClick={() => void changeStatus(item, "RIFIUTATO")} type="button">Segna rifiutato</button></>}
                  </div>
                  {item.stato === "APPROVATO" && <form className="quote-conversion" onSubmit={(event) => void converti(event, item)}>
                    <h4 className="full-field">Trasforma in ordine</h4>
                    <p className="full-field hint">Inserisci i costi d'acquisto interni: non compaiono nel PDF del cliente.</p>
                    <label className="full-field">Consegna prevista al cliente <span>*</span><input required type="date" min={today()} value={dataConsegna} onChange={(event) => setDataConsegna(event.target.value)} /></label>
                    {item.voci.map((voce) => { const option = voce.opzioni.find((candidate) => candidate.scelta)!; return <label className="full-field" key={voce.id}>Costo d'acquisto unitario: {voce.descrizione} ({option.fornitore.nome}) <span>*</span><input required type="number" min="0" step="0.01" value={costi[option.id] ?? ""} onChange={(event) => setCosti({ ...costi, [option.id]: event.target.value })} /></label>; })}
                    <div className="form-actions"><button disabled={busy} type="submit">Crea ordine dal preventivo</button></div>
                  </form>}
                </div>}
              </article>;
            })}</div>
          )}
        </section>
      </div>
    </main>
  );
}
