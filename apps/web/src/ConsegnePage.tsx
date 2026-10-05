import { useEffect, useState } from "react";

type OrdineConsegna = {
  id: number;
  stato: "BOZZA" | "CONFERMATO" | "IN_ATTESA_FORNITORI" | "PRONTO_CONSEGNA" | "CONSEGNATO";
  cliente: { nome: string; cognome: string };
  dataConsegnaPrevista: string | null;
  righe: {
    id: number;
    descrizione: string;
    fornitore: { nome: string } | null;
    arrivoPrevisto: string | null;
    arrivoEffettivo: string | null;
  }[];
};
type LavoroSintesi = {
  ordineId: number;
  tipoIncaricato: "TITOLARE" | "MONTATORE";
  montatore: { nome: string; cognome: string } | null;
  daRipianificare: boolean;
};

const statoLabel: Record<OrdineConsegna["stato"], string> = {
  BOZZA: "Bozza",
  CONFERMATO: "Confermato",
  IN_ATTESA_FORNITORI: "In attesa fornitori",
  PRONTO_CONSEGNA: "Pronto per la consegna",
  CONSEGNATO: "Consegnato"
};

function dateLabel(value: string | null) {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
}

export function ConsegnePage({ onOpenOrdine }: { onOpenOrdine: (id: number) => void }) {
  const [ordini, setOrdini] = useState<OrdineConsegna[]>([]);
  const [lavori, setLavori] = useState<LavoroSintesi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadConsegne() {
      try {
        const [ordiniResponse, lavoriResponse] = await Promise.all([fetch("/api/ordini"), fetch("/api/lavori")]);
        if (!ordiniResponse.ok || !lavoriResponse.ok) throw new Error("Impossibile caricare le consegne.");
        const [data, jobs]: [OrdineConsegna[], LavoroSintesi[]] = await Promise.all([ordiniResponse.json(), lavoriResponse.json()]);
        if (active) { setOrdini(data); setLavori(jobs); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Errore inatteso.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadConsegne();
    return () => { active = false; };
  }, []);

  const aperti = ordini.filter((ordine) => ordine.stato !== "BOZZA" && ordine.stato !== "CONSEGNATO");
  const arrivi = aperti.flatMap((ordine) => ordine.righe
    .filter((riga) => !riga.arrivoEffettivo && riga.arrivoPrevisto)
    .map((riga) => ({ ordine, riga })))
    .sort((a, b) => a.riga.arrivoPrevisto!.localeCompare(b.riga.arrivoPrevisto!));
  const consegne = aperti.filter((ordine) => ordine.dataConsegnaPrevista)
    .sort((a, b) => a.dataConsegnaPrevista!.localeCompare(b.dataConsegnaPrevista!));

  return (
    <main className="shell deliveries-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gestionale Sormani</p>
          <h1>Consegne</h1>
          <p className="subtitle">Monitora i mobili in arrivo dai fornitori e le date di consegna ai clienti.</p>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {loading ? <p className="empty">Caricamento consegne…</p> : !error && (
        <div className="deliveries-grid">
          <section className="panel arrival-view" aria-labelledby="arrivi-heading">
            <h2 id="arrivi-heading">Arrivi dai fornitori</h2>
            <p className="hint">Mobili ordinati e non ancora arrivati, in ordine di data prevista.</p>
            {arrivi.length === 0 ? <p className="empty">Nessun arrivo previsto in attesa.</p> : arrivi.map(({ ordine, riga }) => (
              <button className="arrival-item" key={riga.id} onClick={() => onOpenOrdine(ordine.id)} type="button" aria-label={`Apri ordine n. ${ordine.id}: ${riga.descrizione}`}>
                <span>
                  <strong>{riga.descrizione}</strong>
                  <small>{riga.fornitore?.nome ?? "Fornitore non assegnato"} · Ordine n. {ordine.id} · {ordine.cliente.nome} {ordine.cliente.cognome}</small>
                </span>
                <span className="arrival-date">{dateLabel(riga.arrivoPrevisto)}</span>
              </button>
            ))}
          </section>

          <section className="panel arrival-view" aria-labelledby="consegne-heading">
            <h2 id="consegne-heading">Consegne ai clienti</h2>
            <p className="hint">Gli incarichi e le ripianificazioni si gestiscono nella sezione Lavori.</p>
            {consegne.length === 0 ? <p className="empty">Nessuna consegna prevista.</p> : consegne.map((ordine) => {
              const lavoro = lavori.find((item) => item.ordineId === ordine.id);
              const incaricato = lavoro?.tipoIncaricato === "TITOLARE" ? "Titolare" : lavoro?.montatore ? `${lavoro.montatore.nome} ${lavoro.montatore.cognome}` : "Lavoro da pianificare";
              return (
              <button className="arrival-item" key={ordine.id} onClick={() => onOpenOrdine(ordine.id)} type="button" aria-label={`Apri ordine n. ${ordine.id} di ${ordine.cliente.nome} ${ordine.cliente.cognome}`}>
                <span>
                  <strong>Ordine n. {ordine.id}</strong>
                  <small>{ordine.cliente.nome} {ordine.cliente.cognome} · {statoLabel[ordine.stato]} · {incaricato}{lavoro?.daRipianificare ? " · Da ripianificare" : ""}</small>
                </span>
                <span className="arrival-date">{dateLabel(ordine.dataConsegnaPrevista)}</span>
              </button>
              );
            })}
          </section>
        </div>
      )}
    </main>
  );
}
