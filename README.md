# Secret Santa Club - Netlify + Twilio

Applicazione completa per organizzare un Secret Santa online con HTTPS, sorteggio privato, foto, dashboard comune e inviti WhatsApp inviati automaticamente dal sito tramite Twilio.

## Novita della versione 3

- layout mobile rivisto per homepage, creazione evento, cabina admin, pagina partecipante e dashboard;
- scelta iniziale **Parteciperai anche tu?**;
- se l'admin partecipa, nome e numero vengono aggiunti automaticamente al sorteggio;
- se l'admin non partecipa, i relativi campi restano nascosti;
- invio WhatsApp automatico tramite Twilio, senza aprire WhatsApp e senza copiare link;
- pulsante **Invia tutti** e invio/reinvio per singolo partecipante;
- modifica del numero WhatsApp direttamente dalla riga del partecipante;
- stati Twilio: da inviare, in coda, inviato, consegnato, letto o fallito;
- credenziali Twilio conservate solo nelle variabili ambiente delle Netlify Functions.

## Funzioni principali

- crea una festa con almeno 3 partecipanti totali;
- genera un ciclo casuale senza auto-abbinamenti;
- crea un URL personale e segreto per ogni partecipante;
- invia automaticamente il template WhatsApp con il link corretto;
- consente di caricare o scattare una foto;
- mostra il nome estratto soltanto al partecipante corretto;
- offre una dashboard comune con foto, indizi, giochi e muro degli auguri;
- conserva eventi e foto in Netlify Blobs anche dopo nuovi deploy;
- usa HTTPS automatico sul dominio `netlify.app`.

## Importante su Twilio e WhatsApp

Twilio invia i messaggi attraverso la WhatsApp Business Platform. Per messaggi avviati dal sito in produzione servono normalmente:

1. un mittente WhatsApp registrato nel proprio account Twilio;
2. il consenso esplicito dei destinatari;
3. un Content Template WhatsApp approvato;
4. credito Twilio sufficiente.

Il template previsto dal progetto usa quattro variabili:

```text
{{1}} nome del partecipante
{{2}} nome dell'evento
{{3}} data dell'evento
{{4}} URL personale
```

La configurazione completa e il testo consigliato sono in [`docs/CONFIGURAZIONE-TWILIO-WHATSAPP.md`](docs/CONFIGURAZIONE-TWILIO-WHATSAPP.md).

## Architettura

```text
Browser
  |-- pagine, CSS e JavaScript -> Netlify CDN
  |-- /api/*                   -> Netlify Function API
  `-- /media/*                 -> Netlify Function foto
                                      |
                                      |-- Netlify Blobs: dati evento
                                      |-- Netlify Blobs: foto
                                      `-- Twilio Messaging API -> WhatsApp
```

Gli store continuano a chiamarsi `secret-santa-data-v2` e `secret-santa-media-v2` per mantenere compatibili gli eventi gia pubblicati con la versione precedente.

## Avvio locale in Visual Studio Code

### Requisiti

- Node.js 22.13 o superiore;
- npm;
- browser moderno.

### Avvio rapido

```bash
npm start
```

Apri:

```text
http://localhost:3000
```

I dati di prova vengono salvati in `.local-data`, esclusa da Git. Il server legge anche un eventuale file locale `.env`, ma le credenziali reali non devono mai essere caricate su GitHub.

Per eseguire tutti i controlli:

```bash
npm run check
```

Su Windows puoi usare anche `start-local.cmd`; su macOS/Linux `./start-local.sh`.

### Emulazione Netlify facoltativa

```bash
npm install
npm run netlify:dev
```

Netlify Dev usa normalmente `http://localhost:8888`.

## Aggiornare il sito gia online

Copia i file di questa versione nella cartella del repository gia collegato a Netlify, senza eliminare la cartella nascosta `.git`, quindi esegui:

```bash
git add .
git commit -m "Mobile, admin partecipante e inviti WhatsApp Twilio"
git push
```

Netlify avviera automaticamente un nuovo deploy. Gli eventi e le foto gia presenti nei Blob non vengono cancellati.

Dopo il deploy, configura le variabili Twilio in Netlify e avvia un ulteriore deploy. La guida dettagliata e in [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md).

## Variabili ambiente

```dotenv
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1

TWILIO_ACCOUNT_SID=
TWILIO_API_KEY=
TWILIO_API_SECRET=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_WHATSAPP_FROM=
TWILIO_CONTENT_SID=
TWILIO_ALLOW_FREEFORM=false
```

Configurazione consigliata per la produzione:

- `TWILIO_ACCOUNT_SID`;
- `TWILIO_API_KEY` e `TWILIO_API_SECRET`;
- `TWILIO_MESSAGING_SERVICE_SID` oppure `TWILIO_WHATSAPP_FROM`;
- `TWILIO_CONTENT_SID`;
- `TWILIO_ALLOW_FREEFORM=false`.

`TWILIO_AUTH_TOKEN` e un'alternativa alla coppia API Key/API Secret. Non serve valorizzarlo se usi l'API Key.

## Flusso dell'admin

1. Crea l'evento.
2. Sceglie se partecipare al sorteggio.
3. Inserisce nome e numero di ogni partecipante.
4. Arriva nella cabina di regia.
5. Preme **Invia tutti** oppure **Invia ora** su una singola persona.
6. La Netlify Function costruisce il link personale e chiama Twilio dal server.
7. Twilio consegna il template su WhatsApp.
8. L'admin puo aggiornare gli stati di consegna dalla stessa pagina.

Quando Twilio e configurato, il browser non riceve e non usa le credenziali Twilio. Se la configurazione manca, la pagina mostra chiaramente quali variabili sono assenti e lascia un collegamento manuale solo come soluzione di emergenza.

## Dati e privacy

I link admin e partecipante funzionano come credenziali segrete. La dashboard pubblica non riceve:

- token personali o admin;
- abbinamenti e `assignedId`;
- nomi estratti;
- numeri di telefono;
- Message SID Twilio;
- credenziali Twilio.

L'admin deve raccogliere il consenso esplicito dei partecipanti prima di usare numeri e foto e prima di inviare messaggi WhatsApp. Il checkbox di creazione registra solo una conferma operativa nell'interfaccia: non sostituisce un'informativa privacy adeguata al proprio utilizzo.

## Limiti utili

- Il progetto e pensato per feste private e piccoli gruppi.
- Le foto vengono compresse nel browser e il server accetta al massimo 4 MB per immagine.
- Netlify e Twilio hanno limiti, costi e condizioni legati ai rispettivi account.
- I messaggi WhatsApp avviati dal sito richiedono un template approvato, salvo test Sandbox o conversazioni nella finestra consentita.
- Non e presente un login con password: conserva con cura il link admin.
- Gli stati di consegna vengono aggiornati su richiesta dalla cabina admin interrogando Twilio.

## Struttura del progetto

```text
secret-santa-club-netlify/
|-- netlify.toml
|-- netlify/functions/
|   |-- api.mjs
|   `-- media.mjs
|-- src/
|   |-- api-app.mjs
|   |-- domain.mjs
|   |-- repository.mjs
|   `-- twilio-whatsapp.mjs
|-- public/
|   |-- index.html
|   |-- admin.html
|   |-- participant.html
|   |-- dashboard.html
|   |-- css/
|   |-- js/
|   `-- assets/
|-- tests/
|-- scripts/
|-- docs/
`-- mockups/
```

## Test inclusi

```bash
npm test
```

I test verificano, tra le altre cose:

- sorteggio senza auto-abbinamenti;
- admin partecipante opzionale;
- numeri obbligatori per il flusso automatico;
- costruzione della richiesta Twilio con `ContentSid` e variabili;
- blocco dei reinvii accidentali e dei doppi clic concorrenti;
- aggiornamento dello stato del messaggio;
- mancata esposizione dei segreti Twilio al frontend;
- privacy delle API pubbliche;
- caricamento foto e rivelazione privata;
- persistenza concorrente tramite ETag;
- route e configurazione Netlify.
