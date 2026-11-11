# Secret Santa Club - Netlify Free v6

Applicazione completa per organizzare Secret Santa online con HTTPS, sorteggio privato, foto, budget, preferenze regalo, recupero protetto degli inviti, inviti WhatsApp gratuiti click-to-chat e un Control Center riservato al proprietario del sito.

## Novità della versione 6

- pagina nascosta `/super-admin` protetta da username, password con hash, cookie `HttpOnly` e controllo CSRF;
- catalogo di tutte le stanze, comprese quelle create nelle versioni precedenti;
- ricerca per nome stanza, organizzatore, partecipante, telefono o ID;
- stati **attiva**, **bloccata**, **conclusa**, **archiviata** e **cestino**;
- modifica completa di evento, permessi e partecipanti;
- visualizzazione protetta di telefoni, link, codici elfo e abbinamenti;
- rimozione foto e messaggi, rigenerazione link/codici e riparazione degli indici;
- duplicazione di una stanza senza copiare foto, messaggi o rivelazioni;
- esportazione CSV e backup JSON;
- registro delle operazioni critiche;
- interruttori globali per creazione feste, recupero inviti, foto, muro e manutenzione;
- ottimizzazioni a Netlify Blobs, cache breve della dashboard pubblica, asset con cache lunga, meno animazioni su mobile e polling intelligente.

## Funzioni principali

- l'admin di una festa crea l'evento e sceglie se partecipare;
- ogni partecipante riceve link personale, codice elfo e abbinamento segreto;
- la regia apre WhatsApp con destinatario e messaggio già compilati: resta solo da premere **Invia**;
- gli invitati possono caricare/scattare una foto, compilare preferenze e scoprire il destinatario del regalo;
- chi perde il messaggio ritrova le proprie feste tramite numero e codice elfo;
- la dashboard comune mostra partecipanti, foto, budget, preferenze e muro, ma non gli abbinamenti;
- il super-admin può controllare e moderare tutte le stanze da un unico pannello.

## Accesso al Control Center

La pagina è disponibile all'indirizzo:

```text
https://TUO-SITO.netlify.app/super-admin
```

Non è collegata dalla homepage. Prima del primo accesso configura su Netlify:

```text
SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD_HASH
SUPERADMIN_SESSION_SECRET
SUPERADMIN_SESSION_HOURS
```

Genera l'hash della password in locale:

```powershell
npm run superadmin:hash -- 'Una password lunga e unica'
```

Genera il segreto di sessione:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Non salvare mai la password in chiaro nel repository. La procedura completa è in [`docs/CONTROL-CENTER-SUPER-ADMIN.md`](docs/CONTROL-CENTER-SUPER-ADMIN.md).

## Stati delle stanze

- **Attiva**: funzionamento normale.
- **Bloccata**: invitati e percorsi pubblici vengono congelati; la regia resta consultabile in sola lettura.
- **Conclusa**: la stanza resta visibile, ma non accetta modifiche, messaggi o nuove rivelazioni.
- **Archiviata**: sparisce dai percorsi normali ed è disponibile solo nel Control Center.
- **Cestino**: dati conservati e ripristinabili; la cancellazione definitiva richiede di digitare esattamente il nome della stanza.

## Ottimizzazioni introdotte

- le Netlify Functions riutilizzano handler e connessioni Blob quando l'istanza resta calda;
- le foto sono lette con consistenza eventuale e servite con cache immutabile;
- la dashboard pubblica usa una cache CDN di pochi secondi, mentre admin, partecipante, recupero e super-admin restano `no-store`;
- il recupero inviti usa un indice telefonico ricco senza caricare in sequenza tutte le stanze;
- le migrazioni vengono scritte soltanto quando lo schema è realmente vecchio;
- il catalogo super-admin viene mantenuto incrementale e può essere ricostruito su richiesta;
- il frontend evita refresh sovrapposti, sospende il polling in background e non ridisegna la dashboard se i dati non sono cambiati;
- immagini lazy/async, meno neve e coriandoli sui dispositivi piccoli e `content-visibility` sulle sezioni lunghe;
- CSS, JavaScript e asset sono versionati e memorizzabili a lungo dal browser.

## Avvio locale

Requisito: Node.js 22 o successivo.

```bash
npm start
```

Apri:

```text
http://localhost:3000
```

Per provare anche il super-admin in locale:

1. copia `.env.example` in `.env`;
2. inserisci username, hash e segreto;
3. riavvia `npm start`;
4. apri `http://localhost:3000/super-admin`.

I dati locali sono salvati in `.local-data`, esclusa da Git. Per azzerarli:

```bash
npm run reset:local
```

## Verifiche

```bash
npm run check
```

Il comando controlla struttura Netlify, sintassi JavaScript, CSP, asset versionati e flussi automatici, compresi privacy, recupero inviti, lifecycle delle stanze, login, sessione, CSRF, manutenzione e cancellazione definitiva.

## Aggiornare il sito collegato a Netlify

Copia i file della v6 nel repository locale senza eliminare `.git`, quindi esegui:

```bash
npm run check
git status
git add -A
git commit -m "Control Center super admin e ottimizzazioni v6"
git push
```

Dopo il deploy configura le variabili `SUPERADMIN_*` e avvia un nuovo deploy. Gli store restano invariati:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Eventi, fotografie, link, sorteggi e messaggi già presenti non vengono cancellati.

## Struttura

```text
public/                 frontend statico
netlify/functions/      Functions API e media
src/                    dominio, repository, autenticazione e handler
scripts/                verifiche, reset e generatore hash
 tests/                 test automatici
 docs/                  guide e architettura
 mockups/               mockup di riferimento
```

## Privacy e sicurezza

- token, telefoni, codici e abbinamenti non sono esposti nella dashboard comune;
- il recupero richiede numero e codice personale;
- il super-admin usa password hashata, sessione firmata, cookie `HttpOnly`, `SameSite=Strict`, CSRF e blocco temporaneo dopo tentativi ripetuti;
- i dati sensibili nel Control Center sono coperti fino al clic sull'occhio;
- ogni azione critica viene registrata nell'audit log;
- il link admin di una festa, il codice elfo e le credenziali super-admin devono essere trattati come credenziali private.

Consulta [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md) per l'aggiornamento passo-passo.
