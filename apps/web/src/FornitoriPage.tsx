import { type FormEvent, useCallback, useEffect, useState } from "react";

type Fornitore = {
  id: number;
  nome: string;
  email: string | null;
  telefono: string | null;
  note: string | null;
};
type FornitoreForm = { nome: string; email: string; telefono: string; note: string };
const emptyForm: FornitoreForm = { nome: "", email: "", telefono: "", note: "" };

export function FornitoriPage() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [form, setForm] = useState<FornitoreForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFornitori = useCallback(async () => {
    try {
      const response = await fetch("/api/fornitori");
      if (!response.ok) throw new Error("Impossibile caricare i fornitori.");
      setFornitori(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFornitori(); }, [loadFornitori]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(editingId === null ? "/api/fornitori" : `/api/fornitori/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Impossibile salvare il fornitore.");
      setForm({ ...emptyForm });
      setEditingId(null);
      await loadFornitori();
      setSuccess(editingId === null ? "Fornitore creato." : "Fornitore aggiornato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    } finally {
      setSaving(false);
    }
  }

  function edit(fornitore: Fornitore) {
    setEditingId(fornitore.id);
    setForm({ nome: fornitore.nome, email: fornitore.email ?? "", telefono: fornitore.telefono ?? "", note: fornitore.note ?? "" });
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(fornitore: Fornitore) {
    if (!window.confirm(`Eliminare il fornitore ${fornitore.nome}?`)) return;
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/fornitori/${fornitore.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? "Impossibile eliminare il fornitore.");
      }
      if (editingId === fornitore.id) { setEditingId(null); setForm({ ...emptyForm }); }
      await loadFornitori();
      setSuccess("Fornitore eliminato.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore inatteso.");
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <div><p className="eyebrow">Gestionale Sormani</p><h1>Fornitori</h1><p className="subtitle">Tieni a portata di mano i contatti di chi ti fornisce i mobili.</p></div>
        <span className="counter">{fornitori.length} {fornitori.length === 1 ? "fornitore" : "fornitori"}</span>
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <div className="notice" role="status">{success}</div>}
      <div className="workspace">
        <section className="panel">
          <h2>{editingId === null ? "Nuovo fornitore" : "Modifica fornitore"}</h2>
          <form onSubmit={submit}>
            <label className="full-field">Nome <span>*</span><input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Telefono<input type="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} /></label>
            <label className="full-field">Note<textarea rows={4} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="form-actions">
              <button disabled={saving} type="submit">{saving ? "Salvataggio…" : editingId === null ? "Salva fornitore" : "Salva modifiche"}</button>
              {editingId !== null && <button className="secondary" disabled={saving} onClick={() => { setEditingId(null); setForm({ ...emptyForm }); }} type="button">Annulla</button>}
            </div>
          </form>
        </section>
        <section className="panel list-panel">
          <h2>Elenco fornitori</h2>
          {loading ? <p className="empty">Caricamento…</p> : fornitori.length === 0 ? <p className="empty">Nessun fornitore presente. Inserisci il primo usando il modulo.</p> : (
            <div className="client-list">
              {fornitori.map((fornitore) => (
                <article className="supplier-card" key={fornitore.id}>
                  <h3>{fornitore.nome}</h3>
                  {fornitore.email && <p><a href={`mailto:${fornitore.email}`}>{fornitore.email}</a></p>}
                  {fornitore.telefono && <p>{fornitore.telefono}</p>}
                  {fornitore.note && <p className="supplier-note">{fornitore.note}</p>}
                  <div className="client-actions">
                    <button className="secondary" onClick={() => edit(fornitore)} type="button">Modifica</button>
                    <button className="danger" onClick={() => void remove(fornitore)} type="button">Elimina</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
