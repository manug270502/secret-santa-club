# Secret Santa Club — edizione Netlify

Applicazione completa per organizzare un Secret Santa online con HTTPS, link personali, foto, dashboard comune e inviti WhatsApp già compilati.

## Cosa fa

- crea una festa con almeno 3 partecipanti;
- genera un sorteggio casuale senza auto-abbinamenti;
- crea un URL segreto differente per ogni persona;
- apre la chat WhatsApp corretta con testo e link già inseriti;
- permette di caricare o scattare una foto;
- mostra il nome estratto soltanto al partecipante corretto;
- offre una dashboard comune con foto, indizi, giochi e muro degli auguri;
- conserva eventi e foto in Netlify Blobs, anche dopo nuovi deploy;
- usa HTTPS automatico sul dominio `netlify.app`.

Il sito non usa WhatsApp Business Platform. Per motivi di sicurezza, WhatsApp richiede comunque che l'admin confermi **Invia** nella chat aperta dal sito.

## Architettura

```text
Browser
  ├─ pagine, CSS e JavaScript → Netlify CDN
  ├─ /api/*                   → Netlify Function API
  └─ /media/*                 → Netlify Function foto
                                  │
                                  ├─ secret-santa-data-v2
                                  └─ secret-santa-media-v2
                                      Netlify Blobs, regione UE
```

Gli eventi sono salvati separatamente e indicizzati tramite token casuali. Gli aggiornamenti usano ETag e scritture condizionali per ridurre il rischio di perdere modifiche contemporanee.

## Avvio locale in Visual Studio Code

### Requisiti

- Node.js 22.13 o superiore
- npm
- un browser moderno

### Avvio rapido

```bash
npm start
```

Apri:

```text
http://localhost:3000
```

Questo avvio non richiede dipendenze esterne e salva i dati di prova nella cartella locale `.local-data`, esclusa da Git.

Per eseguire tutti i controlli:

```bash
npm run check
```

Su Windows puoi anche avviare `start-local.cmd`. Su macOS/Linux usa `./start-local.sh`.

### Emulazione Netlify facoltativa

Per usare Netlify Dev e provare direttamente Functions e Blobs locali:

```bash
npm install
npm run netlify:dev
```

Netlify Dev usa normalmente:

```text
http://localhost:8888
```

I dati locali, sia con il server leggero sia con Netlify Dev, restano separati dai dati del sito pubblicato.

## Pubblicazione gratuita su Netlify

La procedura consigliata è GitHub → Netlify:

1. crea un repository GitHub;
2. carica tutto il contenuto di questa cartella;
3. su Netlify scegli **Add new project → Import an existing project**;
4. collega GitHub e seleziona il repository;
5. lascia che Netlify legga `netlify.toml`;
6. premi **Deploy**.

Le impostazioni già incluse sono:

```text
Build command: npm run build
Publish directory: public
Functions directory: netlify/functions
Node: 22
```

Non devi creare manualmente un database e non servono chiavi API. Al primo utilizzo, le Functions creano automaticamente gli store Blob del progetto.

La guida dettagliata è in [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md).

## Flusso WhatsApp senza copia manuale

Nella cabina di regia, ogni partecipante ha il pulsante **Apri WhatsApp**.

- Con un numero inserito, si apre direttamente la chat della persona.
- Senza numero, WhatsApp si apre con il testo pronto e permette di scegliere il contatto.
- Il messaggio contiene automaticamente il link personale corretto.
- Il pulsante **Apri il prossimo** aiuta a procedere in sequenza.
- L'indicatore “WhatsApp aperto” è locale al browser: non può confermare che il messaggio sia stato realmente inviato.

Per i numeri italiani puoi inserire `+39 333 123 4567`; anche un cellulare di 10 cifre che inizia per `3` viene normalizzato con il prefisso `39`.

## Variabili ambiente

Per il primo deploy non devi configurare nulla.

```dotenv
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

- `PUBLIC_BASE_URL`: facoltativa; utile solo per forzare un dominio personalizzato.
- `ENABLE_DEMO`: imposta `true` per mostrare il pulsante demo anche online.
- `BLOBS_REGION`: lascia `eu-central-1` per conservare i Blob a Francoforte. Le Functions del piano gratuito possono invece usare la regione predefinita di Netlify.

Non cambiare la regione Blob dopo aver iniziato a usare il sito, altrimenti l'app cercherà i dati in un archivio regionale diverso.

## Dati e privacy

I link admin e partecipante funzionano come credenziali segrete. Chi possiede un link personale può vedere l'abbinamento relativo dopo la rivelazione.

La dashboard pubblica non riceve:

- token personali;
- token admin;
- `assignedId`;
- nomi estratti;
- numeri di telefono.

Le foto vengono servite tramite URL casuali non prevedibili. Eventi e immagini sono cifrati da Netlify durante il trasferimento e nello storage della piattaforma, ma l'organizzatore resta responsabile di consenso, informativa e cancellazione dei dati.

## Limiti utili

- Il progetto è pensato per feste private e piccoli gruppi, non per un servizio pubblico ad alto traffico.
- Le foto sono compresse nel browser e il server accetta al massimo 4 MB per immagine.
- Il piano Netlify gratuito ha un limite mensile di utilizzo: controlla la sezione Usage del tuo account.
- Non è presente un'autenticazione con password: il link admin deve restare privato.
- Non c'è invio WhatsApp totalmente automatico: senza WhatsApp Business Platform, l'ultimo tocco su **Invia** resta obbligatorio.

## Struttura del progetto

```text
secret-santa-club-netlify/
├── netlify.toml
├── netlify/
│   └── functions/
│       ├── api.mjs
│       └── media.mjs
├── src/
│   ├── api-app.mjs
│   ├── domain.mjs
│   └── repository.mjs
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── participant.html
│   ├── dashboard.html
│   ├── css/
│   ├── js/
│   └── assets/
├── tests/
├── scripts/
├── docs/
└── mockups/
```

## Test inclusi

```bash
npm test
```

I test verificano:

- sorteggio senza auto-abbinamenti;
- privacy delle API;
- persistenza simulata con ETag;
- caricamento e restituzione delle foto;
- rivelazione privata;
- blocco del nuovo sorteggio dopo una rivelazione;
- messaggi concorrenti senza perdita di dati;
- route e configurazione Netlify;
- presenza del flusso WhatsApp precompilato.
