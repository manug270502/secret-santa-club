# Changelog

## 6.2.0

- corretto il rischio di operare su una stanza diversa da quella mostrata nel Control Center;
- aggiunto annullamento delle richieste precedenti e protezione dalle risposte asincrone fuori ordine;
- lo stato della stanza viene azzerato quando il pannello viene chiuso;
- cambio stato, cestino e ripristino richiedono ID, nome e `updatedAt` coerenti;
- la cancellazione definitiva richiede una nuova apertura della stanza dal cestino;
- aggiunto endpoint di anteprima purge con token HMAC temporaneo legato a sessione, evento e versione;
- la frase finale di conferma e `ELIMINA <ID_EVENTO>`;
- aggiunto backup verificato dell'evento e di tutte le foto prima del purge;
- aggiunto ripristino automatico di evento, indici, catalogo e foto se il purge fallisce;
- eliminazione resa sequenziale, senza ignorare errori parziali;
- aggiunta gestione sicura delle voci catalogo orfane senza toccare eventi esistenti;
- controllo build aggiornato per impedire asset con versione diversa dal package;
- asset frontend aggiornati a `v=6.2.0`;
- suite portata a 22 test automatici, inclusi cross-room, backup foto e rollback.

## 6.0.0

- aggiunto Control Center riservato su `/super-admin`;
- autenticazione con hash scrypt, sessione HMAC, cookie HttpOnly/SameSite, CSRF e throttle dei tentativi;
- catalogo globale con ricerca e metriche aggregate;
- lifecycle stanze: attiva, bloccata, conclusa, archiviata e cestino;
- modifica evento e policy, gestione partecipanti, codici, link, foto, messaggi e abbinamenti;
- audit log, modalita manutenzione e interruttori globali;
- backup JSON, esportazione CSV, duplicazione e riparazione indici;
- catalogo e indice telefonico ottimizzati per evitare letture sequenziali;
- handler Blob riutilizzati nelle Functions calde;
- cache CDN breve per la dashboard pubblica e cache immutabile per foto e asset;
- polling dashboard ridotto e sospeso quando la scheda non e visibile;
- alleggerimento di animazioni e rendering su mobile;
- schema eventi aggiornato alla versione 6 senza cambiare gli store Blob.

## 5.0.0

- budget evento;
- recupero inviti tramite numero e codice elfo;
- profili regalo e card scorrevoli;
- correzioni responsive per iPhone;
- schema eventi versione 5.

## 4.0.0

- inviti WhatsApp gratuiti click-to-chat;
- admin partecipante;
- miglioramenti responsive.
