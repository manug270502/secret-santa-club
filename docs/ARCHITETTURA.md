# Architettura Netlify

## Componenti

- `public/`: frontend statico distribuito dalla CDN Netlify.
- `netlify/functions/api.mjs`: API serverless per eventi, partecipanti, rivelazioni e messaggi.
- `netlify/functions/media.mjs`: endpoint serverless per servire le foto.
- `src/domain.mjs`: validazione, token e algoritmo di sorteggio.
- `src/repository.mjs`: accesso a Netlify Blobs, indici e aggiornamenti condizionali.
- `src/api-app.mjs`: routing HTTP condiviso tra Function e test.

## Persistenza

Il progetto usa due store site-wide in `eu-central-1`:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Le chiavi dati seguono questo schema:

```text
event/<eventId>
index/admin/<adminToken>
index/public/<publicToken>
index/participant/<participantToken>
```

Le foto usano un token casuale come chiave e sono raggiungibili soltanto tramite `/media/<token-casuale>`.

## Concorrenza

Ogni evento è un Blob JSON indipendente. Le mutazioni:

1. leggono evento ed ETag con consistenza forte;
2. applicano la modifica a una copia;
3. scrivono solo se l'ETag non è cambiato;
4. ritentano se un'altra richiesta ha scritto contemporaneamente.

Questo evita la maggior parte degli aggiornamenti persi nei piccoli flussi collaborativi previsti dall'app.

## Privacy delle API

- L'API admin espone nomi, numeri, stato e link personali, ma non `assignedId`.
- L'API pubblica non espone token, numeri o abbinamenti.
- L'API partecipante restituisce il nome estratto solo per il token personale e soltanto dopo la rivelazione.
- Il sorteggio viene bloccato dopo la prima rivelazione.

## Inviti WhatsApp

Il frontend genera link `wa.me` con:

- numero del partecipante, quando disponibile;
- messaggio precompilato;
- URL personale generato dal dominio HTTPS corrente.

Non viene usata WhatsApp Business Platform e non esistono token Meta nel progetto.
