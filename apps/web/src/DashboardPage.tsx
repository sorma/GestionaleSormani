import { useEffect, useState } from "react";

type Cliente = { id: number };
type Ordine = {
  id: number;
  cliente: { nome: string; cognome: string };
  dataOrdine: string;
  stato: "BOZZA" | "CONFERMATO" | "IN_ATTESA_FORNITORI" | "PRONTO_CONSEGNA" | "CONSEGNATO";
  totale: string;
  residuo: string;
  righe: Array<{ arrivoEffettivo: string | null }>;
};

type DashboardData = { clienti: Cliente[]; fornitori: Array<{ id: number }>; ordini: Ordine[] };

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const oggi = new Intl.DateTimeFormat("it-IT", { dateStyle: "full" }).format(new Date());

function formatDate(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

export function DashboardPage({ onNavigate }: { onNavigate: (section: "clienti" | "fornitori" | "montatori" | "preventivi" | "ordini" | "lavori" | "consegne" | "analisi") => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setError(null);
        const [clientiResponse, fornitoriResponse, ordiniResponse] = await Promise.all([
          fetch("/api/clienti", { signal: controller.signal }),
          fetch("/api/fornitori", { signal: controller.signal }),
          fetch("/api/ordini", { signal: controller.signal })
        ]);
        if (!clientiResponse.ok || !fornitoriResponse.ok || !ordiniResponse.ok) {
          throw new Error("Impossibile caricare la dashboard.");
        }
        const [clienti, fornitori, ordini] = await Promise.all([
          clientiResponse.json(),
          fornitoriResponse.json(),
          ordiniResponse.json()
        ]);
        if (!controller.signal.aborted) setData({ clienti, fornitori, ordini });
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Errore inatteso.");
        }
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [reloadKey]);

  const clientiCount = data?.clienti.length ?? 0;
  const fornitoriCount = data?.fornitori.length ?? 0;
  const ordiniCount = data?.ordini.length ?? 0;
  const mobiliAttesi = data?.ordini.filter((ordine) => ordine.stato !== "BOZZA" && ordine.stato !== "CONSEGNATO").flatMap((ordine) => ordine.righe).filter((riga) => !riga.arrivoEffettivo).length ?? 0;
  const residuo = data?.ordini.filter((ordine) => ordine.stato !== "BOZZA").reduce((somma, ordine) => somma + Number(ordine.residuo), 0) ?? 0;
  const statoLabel: Record<Ordine["stato"], string> = {
    BOZZA: "Bozza", CONFERMATO: "Confermato", IN_ATTESA_FORNITORI: "In attesa fornitori", PRONTO_CONSEGNA: "Pronto", CONSEGNATO: "Consegnato"
  };

  return (
    <main className="shell dashboard-shell">
      <section className="dashboard-hero">
        <div className="hero-content">
          <p className="hero-date">{oggi}</p>
          <p className="hero-kicker">Gestionale Sormani</p>
          <h1>Il tuo spazio<br />di lavoro.</h1>
          <p className="hero-description">Clienti, fornitori, preventivi, ordini e lavori in un unico posto.</p>
          <div className="hero-actions">
            <button onClick={() => onNavigate("preventivi")} type="button">Nuovo preventivo <span aria-hidden="true">↗</span></button>
            <button onClick={() => onNavigate("ordini")} type="button">Nuovo ordine <span aria-hidden="true">↗</span></button>
            <button className="hero-secondary" onClick={() => onNavigate("clienti")} type="button">Nuovo cliente</button>
          </div>
        </div>
        <div className="hero-ornament" aria-hidden="true"><span /><span /><span /></div>
      </section>

      {error && (
        <div className="alert dashboard-error" role="alert">
          {error} <button className="text-button" onClick={() => setReloadKey((value) => value + 1)} type="button">Riprova</button>
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="overview-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">In sintesi</p>
            <h2 id="overview-heading">Panoramica</h2>
          </div>
          <span className="section-caption">Dati aggiornati all'apertura della pagina</span>
        </div>
        <div className="stats-grid" aria-busy={data === null && !error}>
          <div className="stat-card"><span>Clienti</span><strong>{data ? clientiCount : "—"}</strong><small>in anagrafica</small></div>
          <div className="stat-card"><span>Fornitori</span><strong>{data ? fornitoriCount : "—"}</strong><small>in anagrafica</small></div>
          <div className="stat-card"><span>Ordini</span><strong>{data ? ordiniCount : "—"}</strong><small>totali</small></div>
          <div className="stat-card"><span>Mobili attesi</span><strong>{data ? mobiliAttesi : "—"}</strong><small>non ancora arrivati</small></div>
          <div className="stat-card stat-card-accent"><span>Residuo</span><strong>{data ? euro.format(residuo) : "—"}</strong><small>ordini non in bozza</small></div>
        </div>
      </section>

      <div className="dashboard-bottom">
        <section className="dashboard-section" aria-labelledby="actions-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Operazioni</p>
              <h2 id="actions-heading">Da dove vuoi iniziare?</h2>
            </div>
          </div>
          <div className="quick-actions">
            <button className="quick-action" onClick={() => onNavigate("preventivi")} type="button">
              <span className="quick-icon" aria-hidden="true">01</span>
              <span><strong>Prepara un preventivo</strong><small>Proponi alternative e crea l'ordine dopo l'approvazione.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("clienti")} type="button">
              <span className="quick-icon" aria-hidden="true">02</span>
              <span><strong>Gestisci i clienti</strong><small>Aggiungi, consulta o modifica l'anagrafica.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("fornitori")} type="button">
              <span className="quick-icon" aria-hidden="true">03</span>
              <span><strong>Gestisci i fornitori</strong><small>Aggiungi i contatti e assegnali ai mobili.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("ordini")} type="button">
              <span className="quick-icon" aria-hidden="true">04</span>
              <span><strong>Gestisci gli ordini</strong><small>Segui mobili, incassi e saldo residuo.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("consegne")} type="button">
              <span className="quick-icon" aria-hidden="true">05</span>
              <span><strong>Consegne in arrivo</strong><small>Controlla arrivi dai fornitori e date dei clienti.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("montatori")} type="button">
              <span className="quick-icon" aria-hidden="true">06</span>
              <span><strong>Gestisci i montatori</strong><small>Contatti e costi giornalieri degli esterni.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("lavori")} type="button">
              <span className="quick-icon" aria-hidden="true">07</span>
              <span><strong>Pianifica i lavori</strong><small>Assegna le consegne al titolare o a un montatore.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="quick-action" onClick={() => onNavigate("analisi")} type="button">
              <span className="quick-icon" aria-hidden="true">08</span>
              <span><strong>Andamento vendite</strong><small>Scopri margini per categoria e clienti migliori.</small></span>
              <span className="quick-arrow" aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

        <section className="dashboard-section recent-section" aria-labelledby="recent-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Attività</p>
              <h2 id="recent-heading">Ordini recenti</h2>
            </div>
            <button className="section-link" onClick={() => onNavigate("ordini")} type="button">Vedi tutti <span aria-hidden="true">↗</span></button>
          </div>
          <div className="recent-list">
            {!data && !error && <p className="dashboard-empty">Caricamento…</p>}
            {data && data.ordini.length === 0 && <p className="dashboard-empty">Ancora nessun ordine. Puoi creare il primo dalla sezione Ordini.</p>}
            {data?.ordini.slice(0, 5).map((ordine) => (
              <button className="recent-order" key={ordine.id} onClick={() => onNavigate("ordini")} type="button">
                <span className="recent-order-info"><strong>Ordine n. {ordine.id}</strong><small>{ordine.cliente.nome} {ordine.cliente.cognome} · {formatDate(ordine.dataOrdine)}</small></span>
                <span className="recent-order-end"><strong>{euro.format(Number(ordine.totale))}</strong><small>{statoLabel[ordine.stato]}</small></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
