import { useState } from "react";
import { ClientiPage } from "./ClientiPage";
import { ConsegnePage } from "./ConsegnePage";
import { DashboardPage } from "./DashboardPage";
import { FornitoriPage } from "./FornitoriPage";
import { OrdiniPage } from "./OrdiniPage";
import { PreventiviPage } from "./PreventiviPage";
import { MontatoriPage } from "./MontatoriPage";
import { LavoriPage } from "./LavoriPage";
import { AnalisiVenditePage } from "./AnalisiVenditePage";

type Section = "home" | "clienti" | "fornitori" | "montatori" | "preventivi" | "ordini" | "lavori" | "consegne" | "analisi";

export function App() {
  const [section, setSection] = useState<Section>("home");
  const [ordineDaAprire, setOrdineDaAprire] = useState<number | null>(null);

  function navigate(target: Section) {
    setOrdineDaAprire(null);
    setSection(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openOrdine(id: number) {
    setOrdineDaAprire(id);
    setSection("ordini");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <nav className="top-nav" aria-label="Sezioni del gestionale">
        <button className="nav-brand" onClick={() => navigate("home")} type="button">Sormani<span>.</span></button>
        <div className="nav-links">
          <button aria-current={section === "home" ? "page" : undefined} className={section === "home" ? "nav-active" : ""} onClick={() => navigate("home")} type="button">Home</button>
          <button aria-current={section === "clienti" ? "page" : undefined} className={section === "clienti" ? "nav-active" : ""} onClick={() => navigate("clienti")} type="button">Clienti</button>
          <button aria-current={section === "fornitori" ? "page" : undefined} className={section === "fornitori" ? "nav-active" : ""} onClick={() => navigate("fornitori")} type="button">Fornitori</button>
          <button aria-current={section === "montatori" ? "page" : undefined} className={section === "montatori" ? "nav-active" : ""} onClick={() => navigate("montatori")} type="button">Montatori</button>
          <button aria-current={section === "preventivi" ? "page" : undefined} className={section === "preventivi" ? "nav-active" : ""} onClick={() => navigate("preventivi")} type="button">Preventivi</button>
          <button aria-current={section === "ordini" ? "page" : undefined} className={section === "ordini" ? "nav-active" : ""} onClick={() => navigate("ordini")} type="button">Ordini</button>
          <button aria-current={section === "lavori" ? "page" : undefined} className={section === "lavori" ? "nav-active" : ""} onClick={() => navigate("lavori")} type="button">Lavori</button>
          <button aria-current={section === "consegne" ? "page" : undefined} className={section === "consegne" ? "nav-active" : ""} onClick={() => navigate("consegne")} type="button">Consegne</button>
          <button aria-current={section === "analisi" ? "page" : undefined} className={section === "analisi" ? "nav-active" : ""} onClick={() => navigate("analisi")} type="button">Vendite</button>
        </div>
      </nav>
      {section === "home" && <DashboardPage onNavigate={navigate} />}
      {section === "clienti" && <ClientiPage />}
      {section === "fornitori" && <FornitoriPage />}
      {section === "montatori" && <MontatoriPage />}
      {section === "preventivi" && <PreventiviPage onGoClienti={() => navigate("clienti")} onGoFornitori={() => navigate("fornitori")} onOpenOrdine={openOrdine} />}
      {section === "ordini" && <OrdiniPage key={ordineDaAprire ?? "ordini"} focusOrderId={ordineDaAprire} onGoClienti={() => navigate("clienti")} onGoFornitori={() => navigate("fornitori")} />}
      {section === "lavori" && <LavoriPage onOpenOrdine={openOrdine} onGoMontatori={() => navigate("montatori")} />}
      {section === "consegne" && <ConsegnePage onOpenOrdine={openOrdine} />}
      {section === "analisi" && <AnalisiVenditePage />}
    </>
  );
}
