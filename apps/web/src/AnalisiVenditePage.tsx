import { useEffect, useState } from "react";

type Categoria = { categoria: string; label: string; ricavi: string; costiMerceNoti: string; margineMobili: string | null; righe: number; righeSenzaCosto: number };
type Cliente = { id: number; nome: string; cognome: string; ricavi: string; ordini: number };
type Analisi = {
  mese: string | null; numeroOrdini: number; ricavi: string; costiMerceNoti: string;
  righeSenzaCosto: number; margineMobili: string | null; costiMontaggio: string;
  margineDopoMontaggio: string | null; categorie: Categoria[]; clienti: Cliente[];
};

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const money = (value: string) => euro.format(Number(value));
const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export function AnalisiVenditePage() {
  const [mese, setMese] = useState(currentMonth);
  const [data, setData] = useState<Analisi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const query = mese ? `?mese=${encodeURIComponent(mese)}` : "";
        const response = await fetch(`/api/analisi-vendite${query}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "Impossibile caricare l'analisi.");
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted) { setData(null); setError(cause instanceof Error ? cause.message : "Errore inatteso."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [mese, reload]);

  return <main className="shell analytics-page">
    <header className="page-header"><div><p className="eyebrow">Gestionale Sormani</p><h1>Andamento vendite</h1><p className="subtitle">Ricavi concordati, margini dei mobili e clienti, in base alla data dell'ordine.</p></div></header>
    <section className="panel analytics-filters">
      <label>Mese dell'ordine<input type="month" value={mese} onChange={(event) => setMese(event.target.value)} /></label>
      <button className="secondary" onClick={() => setMese("")} type="button">Tutto il periodo</button>
      <button className="secondary" onClick={() => setMese(currentMonth())} type="button">Mese corrente</button>
      <button className="secondary" onClick={() => setReload((value) => value + 1)} type="button">Aggiorna</button>
    </section>
    {error && <div className="alert" role="alert">{error}</div>}
    {loading && <p className="hint" role="status">Caricamento dell'analisi…</p>}
    {!loading && data && <>
      <p className="hint analytics-note">{data.mese ? `Periodo: ${data.mese.slice(5)}/${data.mese.slice(0, 4)}` : "Periodo: tutti gli ordini"}. Sono esclusi gli ordini in bozza. I ricavi sono prezzi di vendita concordati, non incassi o fatturato fiscale. I margini non includono tasse e altre spese aziendali.</p>
      <div className="stats-grid analytics-stats">
        <div className="stat-card"><span>Ordini</span><strong>{data.numeroOrdini}</strong><small>non in bozza</small></div>
        <div className="stat-card"><span>Ricavi concordati</span><strong>{money(data.ricavi)}</strong><small>totale vendite</small></div>
        <div className="stat-card"><span>Costi merce noti</span><strong>{money(data.costiMerceNoti)}</strong><small>acquisti dei mobili</small></div>
        <div className="stat-card stat-card-accent"><span>Margine mobili</span><strong>{data.margineMobili === null ? "Da completare" : money(data.margineMobili)}</strong><small>ricavi meno costo merce</small></div>
      </div>
      <div className="analytics-secondary panel"><span>Costi montaggio pianificati: <strong>{money(data.costiMontaggio)}</strong></span><span>Margine dopo montaggio: <strong>{data.margineDopoMontaggio === null ? "Da completare" : money(data.margineDopoMontaggio)}</strong></span></div>
      {data.righeSenzaCosto > 0 && <div className="alert" role="status">{data.righeSenzaCosto} {data.righeSenzaCosto === 1 ? "riga ordine non ha" : "righe ordine non hanno"} un costo d'acquisto: il margine complessivo non è calcolabile finché non le completi.</div>}
      <div className="analytics-grid">
        <section className="panel"><h2>Guadagni per categoria</h2><p className="hint">Margine lordo dei mobili = ricavi meno costi d'acquisto. Il montaggio non è attribuito a una categoria.</p>
          {data.categorie.length === 0 ? <p className="hint">Nessuna vendita nel periodo selezionato.</p> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Categoria</th><th>Ricavi</th><th>Costi merce</th><th>Margine</th></tr></thead><tbody>{data.categorie.map((item) => <tr key={item.categoria}><th scope="row">{item.label}</th><td>{money(item.ricavi)}</td><td>{money(item.costiMerceNoti)}</td><td>{item.margineMobili === null ? `Da completare (${item.righeSenzaCosto})` : money(item.margineMobili)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel"><h2>Clienti migliori</h2><p className="hint">Classifica per valore degli ordini, non per importi già incassati.</p>
          {data.clienti.length === 0 ? <p className="hint">Nessun cliente con ordini nel periodo selezionato.</p> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Cliente</th><th>Ordini</th><th>Vendite</th></tr></thead><tbody>{data.clienti.map((item, index) => <tr key={item.id}><th scope="row">{index + 1}. {item.nome} {item.cognome}</th><td>{item.ordini}</td><td>{money(item.ricavi)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </>}
  </main>;
}
