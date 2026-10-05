import { type FormEvent, useCallback, useEffect, useState } from "react";

type Montatore = { id: number; nome: string; cognome: string; telefono: string; costoGiornaliero: string };
type MontatoreForm = { nome: string; cognome: string; telefono: string; costoGiornaliero: string };
const emptyForm: MontatoreForm = { nome: "", cognome: "", telefono: "", costoGiornaliero: "" };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function MontatoriPage() {
  const [montatori, setMontatori] = useState<Montatore[]>([]);
  const [form, setForm] = useState<MontatoreForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMontatori = useCallback(async () => {
    try {
      const response = await fetch("/api/montatori");
      if (!response.ok) throw new Error("Impossibile caricare i montatori.");
      setMontatori(await response.json());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadMontatori(); }, [loadMontatori]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(editingId === null ? "/api/montatori" : `/api/montatori/${editingId}`, {
        method: editingId === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Impossibile salvare il montatore.");
      setEditingId(null); setForm(emptyForm);
      await loadMontatori(); setSuccess("Montatore salvato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  function edit(item: Montatore) {
    setEditingId(item.id);
    setForm({ nome: item.nome, cognome: item.cognome, telefono: item.telefono, costoGiornaliero: item.costoGiornaliero });
    setError(null); setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(item: Montatore) {
    if (!window.confirm(`Eliminare ${item.nome} ${item.cognome}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/montatori/${item.id}`, { method: "DELETE" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message ?? "Impossibile eliminare il montatore."); }
      if (editingId === item.id) { setEditingId(null); setForm(emptyForm); }
      await loadMontatori(); setSuccess("Montatore eliminato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
    finally { setBusy(false); }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <div><p className="eyebrow">Gestionale Sormani</p><h1>Montatori</h1><p className="subtitle">Contatti e tariffe dei montatori esterni.</p></div>
        <span className="counter">{montatori.length} {montatori.length === 1 ? "montatore" : "montatori"}</span>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="notice" role="status">{success}</div>}
      <div className="workspace">
        <section className="panel">
          <h2>{editingId === null ? "Nuovo montatore" : `Modifica montatore n. ${editingId}`}</h2>
          <form onSubmit={(event) => void save(event)}>
            <label>Nome <span>*</span><input required autoComplete="given-name" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /></label>
            <label>Cognome <span>*</span><input required autoComplete="family-name" value={form.cognome} onChange={(event) => setForm({ ...form, cognome: event.target.value })} /></label>
            <label>Telefono <span>*</span><input required type="tel" autoComplete="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} /></label>
            <label>Costo al giorno (€) <span>*</span><input required type="number" min="0" step="0.01" value={form.costoGiornaliero} onChange={(event) => setForm({ ...form, costoGiornaliero: event.target.value })} /></label>
            <div className="form-actions"><button disabled={busy} type="submit">{busy ? "Salvataggio…" : editingId === null ? "Salva montatore" : "Salva modifiche"}</button>{editingId !== null && <button className="secondary" onClick={() => { setEditingId(null); setForm(emptyForm); setError(null); }} type="button">Annulla</button>}</div>
          </form>
        </section>
        <section className="panel list-panel">
          <h2>Montatori esterni</h2>
          {loading ? <p className="empty">Caricamento…</p> : montatori.length === 0 ? <p className="empty">Nessun montatore presente. Puoi comunque assegnare le consegne al titolare.</p> : (
            <div className="client-list">{montatori.map((item) => <article className="supplier-card" key={item.id}>
              <h3>{item.nome} {item.cognome}</h3>
              <p>Telefono: {item.telefono}</p>
              <p>Costo al giorno: {euro.format(Number(item.costoGiornaliero))}</p>
              <div className="client-actions"><button className="secondary" disabled={busy} onClick={() => edit(item)} type="button">Modifica</button><button className="danger" disabled={busy} onClick={() => void remove(item)} type="button">Elimina</button></div>
            </article>)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
