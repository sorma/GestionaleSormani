# Gestionale Sormani

Gestionale monoutente per clienti, fornitori, montatori, preventivi, ordini, consegne e incassi, composto da React + TypeScript, Express + TypeScript e PostgreSQL + Prisma.

Per il percorso operativo dalla richiesta del cliente alla consegna, consulta la [guida all'utilizzo](docs/GUIDA_UTILIZZO.md). Per la struttura del codice, consulta [Architettura](docs/ARCHITETTURA.md).

## Avvio in sviluppo

```powershell
npm.cmd install
npm.cmd run dev
```

Frontend: http://localhost:5173  
API di controllo: http://localhost:3000/api/health

## Database

Il progetto usa PostgreSQL 18 sulla porta locale `5432` e il database `gestionale_sormani`.

1. Copiare `apps/api/.env.example` in `apps/api/.env`.
2. Adattare `DATABASE_URL` con utente e password locali.
3. Applicare eventuali nuove migrazioni con `npm.cmd run prisma:migrate -w @gestionale/api`.

Le migrazioni di clienti, ordini, fornitori, pagamenti, preventivi, montatori e lavori sono presenti in `apps/api/prisma/migrations`.

## Funzionalità disponibili

- Inserimento, consultazione, modifica ed eliminazione dei clienti.
- Conferma prima dell'eliminazione.
- Gestione di indirizzo, CAP e note oltre ai recapiti principali.
- Elenco dei clienti privati ordinato per cognome e nome.
- Controllo dei duplicati per email e codice fiscale.
- Interfaccia responsive collegata alle API Express.
- Ordini collegati ai clienti, con data, stato, note e più righe articolo.
- Creazione, consultazione, modifica ed eliminazione degli ordini.
- Totali calcolati dal backend con prezzi decimali; i clienti con ordini collegati non possono essere eliminati.
- Home con dashboard, riepilogo aggiornato, ordini recenti e accessi rapidi a clienti e ordini.
- Anagrafica fornitori e fornitore distinto per ogni mobile dell'ordine.
- Date di ordine, conferma, arrivo previsto e arrivo effettivo per ciascuna riga.
- Stati dell'ordine fino alla consegna, con controllo che tutti i mobili siano arrivati.
- Acconti e saldo con totale, incassato e residuo calcolati dal backend.
- Ricerca ordini per cliente o numero e filtro per stato; pagina Consegne separata, di sola consultazione, per gli arrivi dai fornitori e le consegne previste ai clienti.
- Preventivi con più alternative di fornitore per lo stesso mobile, PDF scaricabile e stati bozza → inviato → approvato/rifiutato.
- Conversione di un preventivo approvato in un ordine con una sola alternativa scelta per ogni mobile; resta possibile creare ordini senza preventivo.
- Prezzo al cliente conservato nell'ordine e costo d'acquisto unitario separato, visibile solo nell'interfaccia interna. Il costo è richiesto per ogni nuovo mobile, sia nella conversione sia negli ordini diretti; le vecchie righe possono ancora avere il costo vuoto.
- Anagrafica dei montatori esterni con nome, cognome, telefono e costo giornaliero.
- Categoria mobile a scelta obbligatoria per nuovi ordini e preventivi: divano, tavolo, sedie, cucina, letto, armadiature, comodino, scrivania, mensole, comò. Le descrizioni storiche restano conservate; quelle non riconoscibili sono "Non classificate".
- Pagina Vendite con filtro per mese, margine lordo dei mobili per categoria e migliori clienti per valore degli ordini. Esclude le bozze e usa la data dell'ordine.
- Sezione Lavori: una consegna per ordine, con data d'inizio successiva all'ultimo arrivo previsto/effettivo, giorni consecutivi e incaricato esterno o titolare. Il costo del titolare è zero; la tariffa dell'esterno viene salvata nel lavoro.
- Segnalazione dei lavori da ripianificare se la merce arriva in ritardo; completamento possibile solo dopo l'arrivo effettivo di tutti i mobili. La data prevista e lo stato dell'ordine sono sincronizzati con il lavoro.

Il totale ordine è la somma di quantità × prezzo concordato nelle righe: il prezzo salvato con la vendita non cambia se in futuro si aggiunge o aggiorna un listino. Il PDF del preventivo contiene i prezzi proposti al cliente, mai i costi d'acquisto o il margine. Non è ancora previsto un documento separato da inviare ai fornitori; IVA e sconti restano passi successivi.

Per verificare il flusso completo con dati temporanei, dopo la build eseguire `npm.cmd run smoke:ordini -w @gestionale/api`. Il controllo crea e rimuove un cliente, due fornitori, un ordine e i relativi pagamenti.

Nel report i ricavi sono i prezzi concordati, non gli incassi né il fatturato fiscale. Il margine per categoria sottrae solo il costo della merce; i costi di montaggio sono mostrati a parte. Se manca un costo d'acquisto storico, il margine relativo è indicato come "Da completare".

Per verificare il flusso preventivo → PDF → approvazione → ordine eseguire `npm.cmd run smoke:preventivi -w @gestionale/api`. Anche questo test rimuove i propri dati temporanei.

Per verificare montatori, pianificazione, ritardi, ripianificazione e completamento eseguire `npm.cmd run smoke:lavori -w @gestionale/api`. Il test rimuove i propri dati temporanei.

Si usa `npm.cmd` perché la configurazione di sicurezza PowerShell presente sul PC blocca lo script `npm.ps1`.

