# Architettura Netlify + Twilio

## Componenti

- `public/`: frontend statico distribuito dalla CDN Netlify.
- `netlify/functions/api.mjs`: API serverless per eventi, partecipanti, rivelazioni, messaggi e inviti Twilio.
- `netlify/functions/media.mjs`: endpoint serverless per servire le foto.
- `src/domain.mjs`: validazione, token, stato inviti e algoritmo di sorteggio.
- `src/repository.mjs`: accesso a Netlify Blobs, indici e aggiornamenti condizionali.
- `src/api-app.mjs`: routing HTTP condiviso tra Netlify Function, server locale e test.
- `src/twilio-whatsapp.mjs`: autenticazione Twilio, normalizzazione E.164, invio template e lettura stato messaggi.

## Flusso di invio WhatsApp

```text
Admin nel browser
    |
    | POST /api/admin/<token>/invites/<participantId>/send
    v
Netlify Function API
    |-- verifica token admin
    |-- trova partecipante e numero
    |-- costruisce URL personale HTTPS
    |-- applica il Content Template
    `-- chiama Twilio Messages API
            |
            v
        WhatsApp destinatario
```

Le credenziali Twilio vengono lette esclusivamente da `process.env` nella Function. L'endpoint `/api/system` restituisce soltanto uno stato sicuro della configurazione, mai SID sensibili, token o segreti.

## Persistenza e compatibilita

Il progetto usa due store site-wide in `eu-central-1`:

```text
secret-santa-data-v2
secret-santa-media-v2
```

I nomi restano volutamente `v2` per non separare la nuova applicazione dagli eventi e dalle foto gia presenti nel sito pubblicato.

Le chiavi dati seguono questo schema:

```text
event/<eventId>
index/admin/<adminToken>
index/public/<publicToken>
index/participant/<participantToken>
```

Le foto usano un token casuale come chiave e sono raggiungibili tramite `/media/<token-casuale>`.

## Modello evento versione 3

Un evento aggiunge:

```text
organizerParticipates
organizerParticipantId
participants[].isOrganizer
participants[].invite
```

Lo stato `invite` contiene:

```text
status
messageSid
sentAt
updatedAt
errorCode
errorMessage
attempts
```

Gli eventi precedenti restano leggibili: i campi assenti vengono normalizzati con valori predefiniti.

## Concorrenza

Ogni evento e un Blob JSON indipendente. Le mutazioni:

1. leggono evento ed ETag con consistenza forte;
2. applicano la modifica a una copia;
3. scrivono solo se l'ETag non e cambiato;
4. ritentano se un'altra richiesta ha scritto contemporaneamente.

Questo riduce gli aggiornamenti persi nei piccoli flussi collaborativi previsti dall'app.

## Privacy delle API

- L'API admin espone nomi, numeri, link personali e stato inviti, ma non `assignedId`.
- L'API pubblica non espone token, numeri, Message SID o abbinamenti.
- L'API partecipante restituisce il nome estratto solo al token personale e dopo la rivelazione.
- Il sorteggio viene bloccato dopo la prima rivelazione.
- Account SID, API Key, API Secret e Auth Token Twilio non vengono mai serializzati nelle risposte.

## Modalita Twilio

### Produzione consigliata

```text
API Key + API Secret
Messaging Service oppure WhatsApp Sender
Content SID approvato
TWILIO_ALLOW_FREEFORM=false
```

### Test controllato

La modalita free-form e disponibile solo impostando `TWILIO_ALLOW_FREEFORM=true`. Va usata esclusivamente nel Sandbox o in una conversazione per cui esiste gia una finestra WhatsApp valida. Non e la configurazione consigliata per gli inviti reali.

## Stato consegna

Il progetto conserva il Message SID nel Blob privato dell'evento. Il pulsante **Aggiorna consegne** interroga Twilio e aggiorna lo stato locale. Non e richiesto un webhook pubblico e non vengono esposte credenziali al browser.
