# Architettura del Gestionale Sormani

Questo documento descrive come è organizzato il progetto e come collaborano frontend, backend e database.

Il gestionale è pensato per un solo utilizzatore e gestisce clienti privati, fornitori, ordini con righe articolo e pagamenti. Il codice è suddiviso in due applicazioni indipendenti, raccolte nello stesso repository: una per l'interfaccia grafica e una per le API.

```text
Browser (React)
       │ richieste HTTP /api/...
       ▼
API (Express + TypeScript)
       │ Prisma Client
       ▼
PostgreSQL
```

## Struttura generale

```text
GestionaleSormani/
├── apps/
│   ├── api/                  # Backend: API e accesso al database
│   └── web/                  # Frontend: interfaccia usata nel browser
├── docs/                     # Documentazione del progetto
├── .editorconfig             # Regole base di formattazione dei file
├── .gitignore                # File locali o generati esclusi da Git
├── package.json              # Comandi comuni e configurazione workspace
├── package-lock.json         # Versioni esatte delle dipendenze installate
└── README.md                 # Istruzioni rapide di avvio
```

## Root del progetto

### `package.json`

È il punto di ingresso del progetto. Dichiara gli **npm workspaces**, cioè le due applicazioni `apps/api` e `apps/web`, e contiene i comandi che agiscono su entrambe:

| Comando | Scopo |
| --- | --- |
| `npm.cmd run dev` | Avvia backend e frontend insieme, in modalità sviluppo. |
| `npm.cmd run typecheck` | Verifica i tipi TypeScript senza produrre file di build. |
| `npm.cmd run build` | Produce le versioni compilate di backend e frontend. |

Su questo PC va usato `npm.cmd` anziché `npm`: PowerShell blocca lo script `npm.ps1` tramite la propria Execution Policy.

### `package-lock.json`

Memorizza le versioni esatte delle librerie. Va mantenuto in Git: permette a chiunque di installare lo stesso insieme di dipendenze con `npm.cmd install`.

### `.gitignore`

Evita di versionare elementi locali o ricreabili. In particolare `.env` contiene la password del database e non deve mai essere caricato su Git.

## Backend: `apps/api`

Il backend espone API HTTP e custodisce tutta la logica che parla con PostgreSQL. È scritto in Node.js, Express e TypeScript.

```text
apps/api/
├── .env                       # Configurazione locale segreta, non versionata
├── .env.example               # Modello pubblico della configurazione
├── package.json               # Dipendenze e comandi del backend
├── tsconfig.json              # Configurazione TypeScript del backend
├── prisma/
│   ├── schema.prisma          # Modello dei dati Prisma
│   └── migrations/            # Cronologia delle modifiche al database
└── src/
    ├── server.ts              # Avvio del server HTTP
    ├── app.ts                 # Configurazione di Express e registrazione rotte
    ├── lib/prisma.ts          # Istanza condivisa di Prisma Client
    └── routes/
        ├── clienti.ts         # API dell'anagrafica clienti
        ├── fornitori.ts       # API dell'anagrafica fornitori
        ├── montatori.ts       # API dell'anagrafica montatori
        ├── ordini.ts          # API di ordini, righe e pagamenti
        ├── lavori.ts          # API di pianificazione e completamento
        └── preventivi.ts      # API preventivi, PDF e conversione
    scripts/
    └── smoke-order-flow.mjs   # Verifica del flusso di vendita completo
```

### `.env` e `.env.example`

`.env` contiene `DATABASE_URL`, cioè indirizzo, utente, password e nome del database PostgreSQL locale. Esiste solo sulla macchina di lavoro. `.env.example` mostra invece la forma della configurazione, ma non contiene credenziali vere.

### `src/server.ts`

È il file eseguito quando si avvia l'API. Carica le variabili del file `.env`, importa l'app Express e la mette in ascolto sulla porta `3000` (o sulla porta indicata da `PORT`).

### `src/app.ts`

Contiene la configurazione generale di Express:

- abilita CORS per consentire al frontend locale di chiamare l'API;
- interpreta i corpi JSON delle richieste;
- espone `GET /api/health` per verificare che il backend sia in esecuzione;
- monta le rotte clienti sotto `/api/clienti`;
- monta le rotte ordini sotto `/api/ordini`;
- monta le rotte fornitori sotto `/api/fornitori`;
- monta le rotte preventivi sotto `/api/preventivi`;
- monta le rotte montatori sotto `/api/montatori` e lavori sotto `/api/lavori`;
- restituisce una risposta JSON uniforme in caso di errore inatteso.

### `src/lib/prisma.ts`

Crea una singola istanza di `PrismaClient`, riusata da tutte le rotte. Prisma traduce le chiamate TypeScript in query PostgreSQL: il resto dell'app non deve scrivere SQL per le normali operazioni sui dati.

### `src/routes/clienti.ts`

Contiene le API dell'anagrafica. Al momento implementa:

| Metodo e URL | Scopo |
| --- | --- |
| `GET /api/clienti` | Restituisce tutti i clienti, ordinati per cognome e nome. |
| `POST /api/clienti` | Crea un cliente dopo aver validato i dati ricevuti. |
| `GET /api/clienti/:id` | Restituisce un singolo cliente oppure `404` se non esiste. |
| `PUT /api/clienti/:id` | Aggiorna tutti i dati di un cliente. |
| `DELETE /api/clienti/:id` | Elimina un cliente e restituisce `204` senza contenuto. |

La validazione richiede nome e cognome, controlla il formato dell'email e converte provincia e codice fiscale in maiuscolo. L'API restituisce `409 Conflict` se email o codice fiscale sono già associati a un altro cliente. Per un ID non valido risponde `400`, per un cliente inesistente `404`.

Un cliente con ordini o preventivi collegati non può essere eliminato: l'API risponde `409 Conflict`.

### `src/routes/ordini.ts`

Gestisce ordini, righe e pagamenti con queste rotte:

| Metodo e URL | Scopo |
| --- | --- |
| `GET /api/ordini` | Elenca gli ordini con cliente, fornitori, righe, pagamenti e importi calcolati. |
| `GET /api/ordini/:id` | Legge un singolo ordine. |
| `POST /api/ordini` | Crea ordine e righe insieme. |
| `PUT /api/ordini/:id` | Aggiorna ordine e righe in una transazione, preservando gli ID delle righe esistenti. |
| `DELETE /api/ordini/:id` | Elimina l'ordine e le righe solo se non ci sono pagamenti o lavori collegati. |
| `POST /api/ordini/:id/pagamenti` | Registra acconto o saldo. |
| `DELETE /api/ordini/:id/pagamenti/:pagamentoId` | Rimuove un pagamento registrato per errore. |

Ogni ordine richiede cliente, data, stato e almeno una riga; dopo la bozza serve anche una data di consegna prevista. Ogni nuova riga richiede descrizione, quantità intera positiva, fornitore e prezzo concordato con massimo due decimali. Le righe precedenti alla migrazione possono avere il fornitore non assegnato. Ogni riga registra separatamente ordine al fornitore, conferma, arrivo previsto e arrivo effettivo.

L'ordine passa da bozza a confermato, in attesa fornitori, pronto per la consegna e consegnato. Per segnare un ordine pronto o consegnato devono risultare arrivati tutti i mobili; per segnare la consegna serve la data effettiva. L'API impedisce che un aggiornamento abbassi il totale sotto quanto già incassato.

Il totale è la somma di `quantità × prezzo concordato`; incassato è la somma dei pagamenti; residuo è `totale − incassato`. Gli importi sono conservati come `Decimal(12,2)` e calcolati sul backend. Un pagamento non può superare il residuo; un pagamento di tipo saldo deve coprirlo esattamente. `costoAcquistoUnitario` è un dato interno separato dal prezzo al cliente ed è richiesto per le nuove righe; gli ordini storici possono averlo vuoto. Gli ordini provenienti da preventivo mantengono immutabili cliente, articoli, fornitori e prezzi approvati. IVA, sconti, report dei margini e documenti di acquisto ai fornitori non sono ancora previsti.

Se un ordine ha un lavoro di consegna, la data prevista e il completamento si aggiornano dalla sezione Lavori, per evitare date o stati divergenti tra le due schede.

### `src/routes/preventivi.ts` e `src/lib/simplePdf.ts`

Le rotte `/api/preventivi` creano, leggono, aggiornano ed eliminano preventivi. Ogni voce rappresenta un mobile con una o più alternative di fornitore e prezzo di vendita. Il percorso è `BOZZA` → `INVIATO` → `APPROVATO` o `RIFIUTATO`; l'approvazione richiede una scelta per ogni voce. `POST /api/preventivi/:id/converti` richiede una data di consegna e il costo d'acquisto di ogni alternativa scelta, poi crea l'ordine e collega i due record in una transazione. `GET /api/preventivi/:id/pdf` produce un PDF scaricabile con soli dati commerciali per il cliente: non include costo d'acquisto o margine. `simplePdf.ts` genera il documento senza dipendenze esterne.

### `src/routes/fornitori.ts`

Espone `GET`, `POST`, `PUT` e `DELETE /api/fornitori`. Il nome è univoco; un fornitore collegato a una riga ordine o a un'alternativa di preventivo non può essere eliminato.

### `src/routes/montatori.ts` e `src/routes/lavori.ts`

`/api/montatori` gestisce nome, cognome, telefono e costo giornaliero degli esterni. Un montatore già usato in un lavoro non può essere eliminato, per conservare lo storico.

`/api/lavori` permette di pianificare una sola consegna per ordine, ripianificarla e completarla. La data d'inizio deve essere successiva all'ultimo arrivo previsto o effettivo di tutti i mobili; se un arrivo manca, prima va aggiornato l'ordine. Ogni lavoro contiene giorni consecutivi, titolare o montatore, tariffa giornaliera copiata al momento dell'assegnazione e costo totale calcolato. Il titolare ha costo zero. Se la merce arriva dopo la data pianificata, l'API segnala il lavoro come `daRipianificare`. Il completamento richiede l'arrivo effettivo di tutti i mobili e aggiorna l'ordine a `CONSEGNATO` con la data effettiva.

### `prisma/schema.prisma`

È la descrizione dichiarativa del database. I modelli principali sono `Cliente`, `Fornitore`, `Montatore`, `Preventivo`, `VocePreventivo`, `OpzionePreventivo`, `Ordine`, `RigaOrdine`, `PagamentoOrdine` e `LavoroConsegna`. Il preventivo raggruppa le alternative per mobile; l'ordine può collegarsi a un preventivo oppure nascere direttamente. `LavoroConsegna` è collegato a un solo ordine tramite vincolo univoco.

Campi principali:

| Campo | Significato |
| --- | --- |
| `id` | Identificativo numerico generato dal database. |
| `nome`, `cognome` | Dati obbligatori del cliente privato. |
| `email`, `codiceFiscale` | Dati facoltativi ma univoci, quando valorizzati. |
| `telefono`, `indirizzo`, `citta`, `cap`, `provincia`, `note` | Recapiti e informazioni aggiuntive. |
| `createdAt`, `updatedAt` | Date gestite automaticamente dal sistema. |

Un `Cliente` può avere più preventivi e ordini. Ogni preventivo ha più voci e ogni voce più alternative, ciascuna collegata a un fornitore. Un ordine può nascere direttamente o collegarsi a un preventivo convertito; ha più righe e pagamenti. Il database impedisce di eliminare clienti e fornitori ancora collegati.

### `prisma/migrations/`

Ogni sottocartella descrive una modifica irreversibile e ordinata del database:

- `20260930124909_init_clienti`: crea la prima tabella clienti;
- `20260930151500_clienti_privati`: trasforma l'anagrafica da aziendale a privata, sostituendo ragione sociale e partita IVA con nome e cognome.
- `20260930142227_ordini`: aggiunge ordini, righe, stato e relazioni con i clienti.
- `20260930150858_flusso_ordini_fornitori_pagamenti`: aggiunge fornitori, date di fornitura e consegna, nuovi stati e pagamenti senza perdere gli ordini esistenti.
- `20261001120000_preventivi_e_costi`: aggiunge preventivi, voci, alternative, collegamento all'ordine e costo d'acquisto opzionale per preservare gli ordini storici.
- `20261001130000_montatori_e_lavori_consegna`: aggiunge montatori e pianificazione dei lavori senza modificare gli ordini esistenti.

Le migrazioni si conservano sempre: permettono di creare lo stesso database da zero o di aggiornare un database esistente in modo controllato.

## Frontend: `apps/web`

Il frontend è l'applicazione React visualizzata nel browser. Vite fornisce server di sviluppo, aggiornamento automatico della pagina e build ottimizzata.

```text
apps/web/
├── index.html                 # Pagina HTML che ospita React
├── package.json               # Dipendenze e comandi del frontend
├── vite.config.ts             # Configurazione Vite e proxy API
├── tsconfig.json              # Configurazione TypeScript
└── src/
    ├── main.tsx               # Punto di ingresso React
    ├── App.tsx                # Navigazione e collegamento tra le pagine
    ├── ClientiPage.tsx        # Anagrafica clienti
    ├── DashboardPage.tsx      # Home con riepilogo e accessi rapidi
    ├── FornitoriPage.tsx      # Anagrafica fornitori
    ├── MontatoriPage.tsx      # Anagrafica montatori esterni
    ├── PreventiviPage.tsx      # Proposte, alternative, PDF e conversione
    ├── OrdiniPage.tsx         # Inserimento e gestione degli ordini
    ├── LavoriPage.tsx         # Pianificazione e completamento dei lavori
    ├── ConsegnePage.tsx       # Monitoraggio degli arrivi e delle consegne
    └── styles.css             # Stili dell'interfaccia
```

### `index.html`

Contiene solo il contenitore `<div id="root">`. React inserisce qui l'intera applicazione.

### `src/main.tsx`

Monta il componente principale `App` nel contenitore `root` e importa gli stili globali.

### `src/App.tsx`

Contiene soltanto la navigazione tra **Home**, **Clienti**, **Fornitori**, **Montatori**, **Preventivi**, **Ordini**, **Lavori** e **Consegne**. Mantiene la sezione attiva e passa alle pagine le funzioni necessarie per navigare, ad esempio per aprire un ordine dalla pagina Consegne, Lavori o da un preventivo.

### `src/ClientiPage.tsx`

Contiene la schermata e la logica dell'anagrafica clienti, separate dalla navigazione generale.

Flusso dell'anagrafica clienti:

1. All'apertura chiama `GET /api/clienti` e visualizza l'elenco.
2. L'utente compila nome, cognome e gli altri dati facoltativi.
3. Al salvataggio invia `POST /api/clienti` con i dati in JSON.
4. Se l'API conferma la creazione, il form viene svuotato e l'elenco è ricaricato.
5. Il pulsante **Modifica** copia i dati del cliente nel modulo e salva con `PUT /api/clienti/:id`; **Annulla** torna alla creazione.
6. Il pulsante **Elimina** chiede conferma prima di chiamare `DELETE /api/clienti/:id`.

### `src/DashboardPage.tsx`

È la pagina iniziale. Carica clienti, fornitori e ordini ogni volta che si apre; mostra i conteggi, i mobili ancora attesi, il residuo degli ordini non in bozza e gli ordini recenti. I pulsanti portano alle schermate operative.

### `src/FornitoriPage.tsx`

Permette di creare, modificare, consultare ed eliminare fornitori. Mostra il messaggio dell'API quando un fornitore non è eliminabile perché usato in una riga ordine.

### `src/MontatoriPage.tsx`

Permette di creare, modificare, consultare ed eliminare montatori esterni. Mostra il costo giornaliero corrente; le tariffe già copiate nei lavori restano invariate.

### `src/OrdiniPage.tsx`

Carica clienti, fornitori e ordini. Il modulo permette di inserire un ordine diretto o aggiornare uno convertito da preventivo, compresi stato, consegna, costo d'acquisto interno e date di approvvigionamento. La scheda mostra mobili arrivati o attesi, prezzo concordato, totale, incassato, residuo e pagamenti. Include ricerca per cliente o numero e filtro per stato. Il totale nel modulo è un'anteprima; quello restituito dall'API è calcolato con i decimali memorizzati nel database.

### `src/PreventiviPage.tsx`

Gestisce preventivi con più alternative per ogni mobile. Permette di scaricare il PDF, segnare il preventivo inviato, registrare la scelta approvata dal cliente e convertirla in ordine dopo aver inserito i costi d'acquisto interni.

### `src/ConsegnePage.tsx`

È una pagina di sola consultazione: mostra gli arrivi ancora attesi dai fornitori e le consegne previste ai clienti, ordinati per data. Indica anche l'incaricato o se il lavoro è da pianificare/ripianificare. Cliccando una voce si passa alla scheda dell'ordine.

### `src/LavoriPage.tsx`

Mostra ordini ancora da pianificare, lavori pianificati e lavori completati. Permette di scegliere data, giorni e incaricato, di ripianificare in caso di ritardo e di segnare il lavoro completato dopo l'arrivo di tutti i mobili.

### `src/styles.css`

Definisce l'aspetto dell'interfaccia: griglia del form, schede clienti, stati dei campi, messaggi di errore e adattamento a schermi piccoli.

### `vite.config.ts`

In sviluppo Vite gira sulla porta `5173`, mentre l'API gira sulla `3000`. Il proxy configurato inoltra ogni richiesta che inizia con `/api` al backend. Per questo il frontend usa URL semplici come `/api/clienti`, senza conoscere la porta del server.

## Categorie mobili e analisi vendite

`prisma/schema.prisma` definisce `CategoriaMobile` e il campo `categoria` nelle righe d'ordine e nelle voci del preventivo. La migrazione `20261001140000_categorie_mobile_analisi` classifica solo le vecchie descrizioni riconoscibili, senza cancellare il testo originale; le altre rimangono senza categoria.

I selettori condividono l'elenco in `apps/web/src/categorieMobile.ts`; il backend verifica i valori tramite `apps/api/src/lib/categorieMobile.ts`. Le nuove righe devono avere una categoria valida. La conversione del preventivo in ordine conserva la categoria scelta.

`apps/api/src/routes/analisiVendite.ts` espone `GET /api/analisi-vendite?mese=AAAA-MM`. Considera gli ordini non in bozza in base alla data dell'ordine e restituisce ricavi concordati, costi merce, margini e classifica clienti. Usa i decimali Prisma per i calcoli monetari. `apps/web/src/AnalisiVenditePage.tsx` mostra il filtro per mese e i risultati; è raggiungibile dalla navigazione in `App.tsx` e dalla dashboard. Il costo di montaggio è riportato separatamente, non ripartito tra categorie. Se manca il costo merce di una riga storica, il margine relativo rimane non calcolabile.

## Ciclo di lavoro consigliato

Quando si aggiunge una nuova funzionalità che richiede nuovi dati:

1. Modificare il modello in `prisma/schema.prisma`.
2. Creare e applicare una migrazione con `npm.cmd run prisma:migrate -w @gestionale/api -- --name nome_modifica`.
3. Aggiornare le rotte backend e la loro validazione.
4. Aggiornare il frontend che usa quelle API.
5. Eseguire `npm.cmd run typecheck` e `npm.cmd run build`.

## File generati: non modificare manualmente

Questi elementi sono creati da npm, TypeScript, Prisma o Vite e possono essere ricostruiti:

- `node_modules/`: librerie installate;
- `dist/`: build di produzione;
- `*.tsbuildinfo`: cache incrementale di TypeScript;
- `vite.config.js` e `vite.config.d.ts`: file emessi da una precedente compilazione TypeScript; la sorgente da modificare è sempre `vite.config.ts`;
- `apps/api/node_modules/.prisma/`: Prisma Client generato.

In caso di dubbi, non modificare questi file: la fonte di verità è il codice TypeScript e lo schema Prisma.
