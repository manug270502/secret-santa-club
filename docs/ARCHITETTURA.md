# Architettura Netlify Free

## Componenti

- `public/`: interfaccia responsive per home, regia, partecipante e dashboard;
- `netlify/functions/api.mjs`: API serverless;
- `netlify/functions/media.mjs`: restituzione sicura delle foto;
- `src/domain.mjs`: validazione, sorteggio, normalizzazione numeri e stato inviti;
- `src/repository.mjs`: persistenza concorrente tramite Netlify Blobs ed ETag;
- `src/api-app.mjs`: route, privacy e trasformazione delle risposte;
- `src/file-blob-store.mjs`: storage locale compatibile con l'interfaccia Blob.

## Inviti WhatsApp

Il browser costruisce un URL `https://wa.me/<numero>?text=<messaggio>` usando:

- numero normalizzato in formato internazionale;
- nome del partecipante;
- nome, data e luogo della festa;
- link personale `/join/<token>`.

Il collegamento viene aperto soltanto dopo il gesto dell'admin. Non esiste un bot, non vengono usate credenziali WhatsApp e non viene eseguita automazione dentro WhatsApp.

Dopo l'apertura, il frontend chiama:

```text
POST /api/admin/<adminToken>/invites/<participantId>/opened
```

Il server salva esclusivamente:

```text
status: opened | not_opened
openedAt
updatedAt
openCount
```

Il dato e un promemoria dell'admin e non uno stato di consegna.

## Compatibilita dati

Gli eventi nuovi usano `schemaVersion: 4`. La funzione `normalizedInviteState` converte in lettura i vecchi stati della versione precedente senza esporre eventuali identificativi del provider.

Gli store Blob non cambiano, quindi non e necessaria una migrazione distruttiva.

## Privacy

Le API pubbliche non restituiscono:

- `assignedId`;
- token personali;
- token admin;
- numeri di telefono;
- stato interno degli inviti;
- nome estratto prima della rivelazione autorizzata.

L'API admin richiede un token opaco nell'URL. Il link admin deve quindi essere conservato come una password.

## Concorrenza

Il repository usa lettura con ETag e scrittura condizionale. In caso di modifica simultanea ripete l'operazione, riducendo il rischio di perdere messaggi o aggiornamenti della festa.
