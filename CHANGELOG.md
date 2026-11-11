# Changelog

## 6.0.0

- aggiunto Control Center riservato su `/super-admin`;
- autenticazione con hash scrypt, sessione HMAC, cookie HttpOnly/SameSite, CSRF e throttle dei tentativi;
- catalogo globale con ricerca e metriche aggregate;
- lifecycle stanze: attiva, bloccata, conclusa, archiviata e cestino;
- modifica evento e policy, gestione partecipanti, codici, link, foto, messaggi e abbinamenti;
- audit log, modalità manutenzione e interruttori globali;
- backup JSON, esportazione CSV, duplicazione e riparazione indici;
- cancellazione reversibile e cancellazione definitiva con conferma nominale;
- catalogo e indice telefonico ottimizzati per evitare letture sequenziali;
- handler Blob riutilizzati nelle Functions calde;
- cache CDN breve per la dashboard pubblica e cache immutabile per foto/asset;
- polling dashboard ridotto e sospeso quando la scheda non è visibile;
- alleggerimento di animazioni e rendering su mobile;
- feedback coerente di sola lettura nelle stanze bloccate/concluse/archiviate;
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
