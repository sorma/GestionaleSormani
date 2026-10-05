import { type FormEvent, useCallback, useEffect, useState } from "react";

type Cliente = {
  id: number;
  nome: string;
  cognome: string;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  codiceFiscale: string | null;
  note: string | null;
};

type ClienteForm = {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  indirizzo: string;
  citta: string;
  cap: string;
  provincia: string;
  codiceFiscale: string;
  note: string;
};

const emptyForm: ClienteForm = {
  nome: "",
  cognome: "",
  email: "",
  telefono: "",
  indirizzo: "",
  citta: "",
  cap: "",
  provincia: "",
  codiceFiscale: "",
  note: ""
};

export function ClientiPage() {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [form, setForm] = useState<ClienteForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadClienti = useCallback(async () => {
    try {
      const response = await fetch("/api/clienti");
      if (!response.ok) throw new Error("Impossibile caricare i clienti.");
      setClienti(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore inatteso.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClienti();
  }, [loadClienti]);

  async function submitCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setSuccess(null);

    try {
      const response = await fetch(editingId === null ? "/api/clienti" : `/api/clienti/${editingId}`, {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Impossibile salvare il cliente.");

      setSuccess(editingId === null ? "Cliente creato." : "Cliente aggiornato.");
      setForm({ ...emptyForm });
      setEditingId(null);
      await loadClienti();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore inatteso.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof ClienteForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function editCliente(cliente: Cliente) {
    setEditingId(cliente.id);
    setForm({
      nome: cliente.nome,
      cognome: cliente.cognome,
      email: cliente.email ?? "",
      telefono: cliente.telefono ?? "",
      indirizzo: cliente.indirizzo ?? "",
      citta: cliente.citta ?? "",
      cap: cliente.cap ?? "",
      provincia: cliente.provincia ?? "",
      codiceFiscale: cliente.codiceFiscale ?? "",
      note: cliente.note ?? ""
    });
    setMessage(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setMessage(null);
  }

  async function deleteCliente(cliente: Cliente) {
    if (!window.confirm(`Eliminare ${cliente.nome} ${cliente.cognome}? L'operazione non può essere annullata.`)) return;
    setDeletingId(cliente.id);
    setMessage(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/clienti/${cliente.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? "Impossibile eliminare il cliente.");
      }
      if (editingId === cliente.id) cancelEdit();
      await loadClienti();
      setSuccess("Cliente eliminato.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore inatteso.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gestionale Sormani</p>
          <h1>Anagrafica clienti</h1>
          <p className="subtitle">Inserisci, consulta e aggiorna i dati dei tuoi clienti.</p>
        </div>
        <span className="counter">{clienti.length} {clienti.length === 1 ? "cliente" : "clienti"}</span>
      </header>

      {message && <div className="alert" role="alert">{message}</div>}
      {success && <div className="notice" role="status">{success}</div>}

      <div className="workspace">
        <section className="panel">
          <h2>{editingId === null ? "Nuovo cliente" : "Modifica cliente"}</h2>
          <form onSubmit={submitCliente}>
            <label>
              Nome <span>*</span>
              <input required autoComplete="given-name" value={form.nome} onChange={(event) => updateField("nome", event.target.value)} />
            </label>
            <label>
              Cognome <span>*</span>
              <input required autoComplete="family-name" value={form.cognome} onChange={(event) => updateField("cognome", event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
            </label>
            <label>
              Telefono
              <input type="tel" autoComplete="tel" value={form.telefono} onChange={(event) => updateField("telefono", event.target.value)} />
            </label>
            <label className="full-field">
              Indirizzo
              <input autoComplete="street-address" value={form.indirizzo} onChange={(event) => updateField("indirizzo", event.target.value)} />
            </label>
            <label>
              Città
              <input value={form.citta} onChange={(event) => updateField("citta", event.target.value)} />
            </label>
            <label>
              Provincia
              <input maxLength={2} value={form.provincia} onChange={(event) => updateField("provincia", event.target.value)} />
            </label>
            <label>
              CAP
              <input inputMode="numeric" autoComplete="postal-code" maxLength={5} value={form.cap} onChange={(event) => updateField("cap", event.target.value)} />
            </label>
            <label className="full-field">
              Codice fiscale
              <input maxLength={16} value={form.codiceFiscale} onChange={(event) => updateField("codiceFiscale", event.target.value)} />
            </label>
            <label className="full-field">
              Note
              <textarea rows={3} value={form.note} onChange={(event) => updateField("note", event.target.value)} />
            </label>
            <div className="form-actions">
              <button disabled={saving} type="submit">{saving ? "Salvataggio…" : editingId === null ? "Salva cliente" : "Salva modifiche"}</button>
              {editingId !== null && <button className="secondary" disabled={saving} onClick={cancelEdit} type="button">Annulla</button>}
            </div>
          </form>
        </section>

        <section className="panel list-panel">
          <h2>Clienti</h2>
          {loading ? (
            <p className="empty">Caricamento…</p>
          ) : clienti.length === 0 ? (
            <p className="empty">Nessun cliente presente. Inserisci il primo usando il modulo.</p>
          ) : (
            <div className="client-list">
              {clienti.map((cliente) => (
                <article className="client-card" key={cliente.id}>
                  <div>
                    <h3>{cliente.nome} {cliente.cognome}</h3>
                    <p>{[cliente.citta, cliente.provincia].filter(Boolean).join(" · ") || "Località non indicata"}</p>
                  </div>
                  <dl>
                    {cliente.email && <><dt>Email</dt><dd><a href={`mailto:${cliente.email}`}>{cliente.email}</a></dd></>}
                    {cliente.telefono && <><dt>Telefono</dt><dd>{cliente.telefono}</dd></>}
                    {cliente.indirizzo && <><dt>Indirizzo</dt><dd>{cliente.indirizzo}</dd></>}
                    {cliente.cap && <><dt>CAP</dt><dd>{cliente.cap}</dd></>}
                    {cliente.codiceFiscale && <><dt>Codice fiscale</dt><dd>{cliente.codiceFiscale}</dd></>}
                    {cliente.note && <><dt>Note</dt><dd>{cliente.note}</dd></>}
                  </dl>
                  <div className="client-actions">
                    <button className="secondary" disabled={saving || deletingId !== null} onClick={() => editCliente(cliente)} type="button">Modifica</button>
                    <button className="danger" disabled={saving || deletingId !== null} onClick={() => void deleteCliente(cliente)} type="button">{deletingId === cliente.id ? "Eliminazione…" : "Elimina"}</button>
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
