# Architettura Netlify Free v6.2

## Componenti

- `public/`: home, recupero inviti, regia, partecipante, dashboard e Control Center;
- `netlify/functions/api.mjs`: API serverless e riuso dell'handler nelle istanze calde;
- `netlify/functions/media.mjs`: foto con lettura eventuale e cache immutabile;
- `src/domain.mjs`: validazione, sorteggio, lifecycle, policy e normalizzazione;
- `src/repository.mjs`: ETag, indici, catalogo, audit, backup e persistenza;
- `src/super-admin-auth.mjs`: hash password, sessioni firmate, cookie, CSRF e token HMAC per azioni critiche;
- `src/api-app.mjs`: route, autorizzazione, privacy e risposte;
- `src/file-blob-store.mjs`: storage locale compatibile con l'interfaccia Blob.

## Store

Gli store restano invariati:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Il primo contiene eventi, indici, catalogo, impostazioni, audit, throttle login e backup di sicurezza. Il secondo contiene le immagini attive.

## Schema evento

Gli eventi nuovi usano `schemaVersion: 6` e includono:

- metadati della festa e budget in centesimi;
- token admin e pubblico;
- partecipanti con token, telefono, codice elfo, profilo, foto e abbinamento;
- messaggi;
- stato della stanza e motivo;
- policy granulari;
- metadati cestino e ripristino.

`ensureEventManagementFields()` aggiunge i campi mancanti agli eventi precedenti senza cambiare abbinamenti, token, foto o messaggi.

## Chiavi principali

```text
event/<eventId>
index/admin/<token>
index/public/<token>
index/participant/<token>
index/phone/<hash>
system/event-catalog-v1
system/settings-v1
audit/<timestamp>-<token>
security/login/<hash-ip>
backup/deleted/<eventId>/<backupId>
backup/deleted/<eventId>/<backupId>/media/<photoToken>
```

L'indice telefonico contiene un riepilogo sufficiente per la pagina di recupero, evitando di caricare ogni evento in sequenza. Il catalogo contiene statistiche e testo di ricerca; i telefoni in chiaro non vengono restituiti dall'API riepilogativa.

## Concorrenza

Eventi, indici, catalogo, impostazioni e throttle usano lettura con ETag e scrittura condizionale. In caso di conflitto l'operazione viene ripetuta. Le mutazioni che cambiano informazioni di recupero sincronizzano l'indice telefonico.

## Super-admin

### Credenziali e sessione

La configurazione arriva esclusivamente da variabili ambiente. La password è rappresentata da un hash scrypt. La sessione contiene username, scadenza, ID sessione e token CSRF; è firmata con HMAC SHA-256.

### Autorizzazione

- login pubblico con throttle persistente;
- cookie di sessione `HttpOnly`, `SameSite=Strict`, `Secure` in HTTPS;
- ogni mutazione richiede sessione valida e `X-CSRF-Token`;
- le mutazioni di stato verificano ID, nome e `updatedAt`;
- il purge richiede un token HMAC temporaneo legato a sessione, azione, evento, nome e versione;
- le esportazioni richiedono sessione ma sono operazioni in sola lettura;
- audit separato dagli eventi, così resta disponibile dopo la cancellazione definitiva.

### Protezione frontend

Quando viene aperta una stanza, il browser conserva uno snapshot limitato a quella finestra. Le richieste precedenti vengono annullate tramite `AbortController`, le risposte fuori ordine vengono ignorate e la chiusura del dialog cancella la selezione. Prima di ogni operazione il dataset del dialog deve corrispondere allo snapshot.

### Lifecycle

- `active`: lettura e scrittura normali;
- `blocked`: accesso pubblico e partecipante negato, admin normale in sola lettura;
- `completed`: lettura consentita, mutazioni negate;
- `archived`: accesso soltanto super-admin;
- `trashed`: accesso soltanto super-admin e possibilità di ripristino o purge.

## Privacy delle risposte

La dashboard pubblica non restituisce telefoni, token, codici, stato inviti o abbinamenti. La regia normale non riceve `assignedId`. Il dettaglio completo è disponibile soltanto al super-admin autenticato.

## Cache e consistenza

- mutazioni e accessi privati: consistenza forte e `no-store`;
- dashboard pubblica: lettura eventuale con fallback forte e cache CDN breve;
- foto: consistenza eventuale, URL immutabile e cache di un anno;
- impostazioni globali: cache in memoria di 5 secondi nelle istanze calde;
- file statici: cache lunga con query di versione.

Questo riduce la latenza senza memorizzare risposte contenenti token o dati sensibili.

## Prestazioni frontend

- polling dashboard ogni 45 secondi solo con scheda visibile;
- nessuna richiesta sovrapposta;
- confronto `updatedAt` per evitare ridisegni inutili;
- immagini `loading=lazy` e `decoding=async` dove applicabile;
- meno elementi decorativi e coriandoli su viewport piccoli;
- `content-visibility` sulle sezioni più lunghe;
- asset versionati per sfruttare la cache del browser.

## Cancellazione protetta

Il passaggio al cestino non cancella dati. La cancellazione definitiva segue una transazione applicativa protetta:

1. verifica che la stanza sia ancora nel cestino;
2. confronta ID, nome e `updatedAt` con lo snapshot mostrato al browser;
3. rilascia un token HMAC temporaneo e legato alla sessione;
4. crea un manifest di backup con l'intero record evento;
5. copia e verifica ogni fotografia nel data store di backup;
6. elimina in sequenza evento, indici, riferimenti telefonici, foto e catalogo;
7. verifica che il record principale sia scomparso;
8. in caso di errore ripristina automaticamente evento, indici, catalogo e foto.

Il backup usa chiavi separate da quelle dell'evento e non viene incluso nell'elenco delle chiavi da cancellare. Il campo `purgeAfter` è informativo: la v6.2 non esegue cancellazioni automatiche programmate.

## Catalogo e voci orfane

Il catalogo è un indice riassuntivo e non è la fonte primaria dell'evento. Se una voce non ha più il record `event/<id>`, l'API la tratta come orfana e consente soltanto di rimuovere quel riepilogo. La pulizia di una voce orfana non richiama `purgeEvent()` e non tocca altri eventi.
