# Secret Santa Club - Netlify Free v6.2.0

Applicazione completa per organizzare Secret Santa online con HTTPS, sorteggio privato, foto, budget, preferenze regalo, recupero protetto degli inviti, inviti WhatsApp gratuiti click-to-chat e un Control Center riservato al proprietario del sito.

## Novita della versione finale 6.2

La v6.2 consolida il Control Center e mette in sicurezza tutte le operazioni distruttive:

- selezione della stanza legata al pannello effettivamente aperto;
- annullamento delle richieste precedenti quando si apre rapidamente un'altra stanza;
- conferme server-side con ID, nome e versione corrente dell'evento;
- passaggio nel cestino separato dalla cancellazione definitiva;
- riapertura obbligatoria della stanza dal cestino prima del purge;
- token di conferma firmato, temporaneo e valido soltanto per quella stanza;
- frase finale esatta `ELIMINA <ID_EVENTO>`;
- backup verificato del record e di tutte le fotografie prima della cancellazione;
- ripristino automatico dal backup se una cancellazione si interrompe;
- rimozione sicura delle sole voci orfane dal catalogo;
- controllo build che impedisce di pubblicare asset con versioni incoerenti.

Restano incluse tutte le funzioni introdotte nelle versioni precedenti: catalogo globale, stati delle stanze, moderazione, manutenzione, esportazioni, duplicazione, audit e ottimizzazioni Netlify Blobs.

## Funzioni principali

- l'admin di una festa crea l'evento e sceglie se partecipare;
- ogni partecipante riceve link personale, codice elfo e abbinamento segreto;
- la regia apre WhatsApp con destinatario e messaggio gia compilati: resta solo da premere **Invia**;
- gli invitati possono caricare o scattare una foto, compilare preferenze e scoprire il destinatario del regalo;
- chi perde il messaggio ritrova le proprie feste tramite numero e codice elfo;
- la dashboard comune mostra partecipanti, foto, budget, preferenze e muro, ma non gli abbinamenti;
- il super-admin controlla e modera tutte le stanze da un unico pannello.

## Accesso al Control Center

La pagina e disponibile all'indirizzo:

```text
https://TUO-SITO.netlify.app/super-admin
```

Non e collegata dalla homepage. Prima del primo accesso configura su Netlify:

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

Non salvare mai la password in chiaro nel repository. La procedura completa e in [`docs/CONTROL-CENTER-SUPER-ADMIN.md`](docs/CONTROL-CENTER-SUPER-ADMIN.md).

## Stati delle stanze

- **Attiva**: funzionamento normale.
- **Bloccata**: invitati e percorsi pubblici vengono congelati; la regia resta consultabile in sola lettura.
- **Conclusa**: la stanza resta visibile, ma non accetta modifiche, messaggi o nuove rivelazioni.
- **Archiviata**: sparisce dai percorsi normali ed e disponibile solo nel Control Center.
- **Cestino**: conserva tutti i dati ed e ripristinabile. Il passaggio nel cestino non elimina nulla.

## Cancellazione definitiva protetta

La cancellazione definitiva e possibile solo da una stanza gia nel cestino e segue questo flusso:

1. il pannello congela ID, nome, stato e `updatedAt` della stanza aperta;
2. il server verifica che la stanza corrisponda ancora a quei dati;
3. il server rilascia un token firmato valido per pochi minuti e solo per quella sessione;
4. l'utente deve digitare `ELIMINA <ID_EVENTO>`;
5. viene creato e riletto un backup completo dell'evento;
6. vengono copiate e verificate tutte le fotografie;
7. la cancellazione procede in modo sequenziale;
8. se un passaggio fallisce, evento, indici, catalogo e foto vengono ripristinati automaticamente.

Una conferma o un token ottenuti per una stanza non possono essere riutilizzati su un'altra.

## Stanze orfane

Se il catalogo contiene una vecchia voce ma il relativo evento non esiste piu, il Control Center la riconosce come **voce orfana**. La rimozione proposta cancella soltanto quella scheda riassuntiva dal catalogo; non esegue purge e non tocca altre stanze.

## Ottimizzazioni

- le Netlify Functions riutilizzano handler e store Blob quando l'istanza resta calda;
- le foto sono lette con consistenza eventuale e servite con cache immutabile;
- la dashboard pubblica usa una cache CDN di pochi secondi, mentre admin, partecipante, recupero e super-admin restano `no-store`;
- il recupero inviti usa un indice telefonico ricco senza caricare in sequenza tutte le stanze;
- le migrazioni vengono scritte soltanto quando lo schema e realmente vecchio;
- il catalogo super-admin viene mantenuto incrementalmente e puo essere ricostruito su richiesta;
- il frontend evita refresh sovrapposti, sospende il polling in background e non ridisegna la dashboard se i dati non sono cambiati;
- le immagini usano caricamento lazy e async dove applicabile;
- su mobile vengono ridotti elementi decorativi e animazioni;
- CSS e JavaScript sono versionati e memorizzabili a lungo dal browser.

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

Il comando controlla struttura Netlify, sintassi JavaScript, CSP, asset versionati e 22 flussi automatici. Sono inclusi test specifici per:

- conferma appartenente alla stanza corretta;
- impossibilita di usare una conferma su una stanza diversa;
- backup evento e fotografie prima del purge;
- ripristino automatico in caso di errore a meta cancellazione;
- pulizia sicura delle sole voci orfane;
- lifecycle, privacy, concorrenza, recupero inviti e super-admin.

## Aggiornare il sito collegato a Netlify

Copia i file della v6.2 nel repository locale senza eliminare `.git`, quindi esegui:

```bash
npm run check
git status
git add -A
git commit -m "Fix finale cancellazione stanze v6.2"
git push
```

Dopo che il deploy e `Published`, controlla:

```text
https://TUO-SITO.netlify.app/api/health?v=620
```

La risposta deve contenere:

```json
"service": "secret-santa-club-netlify-v6.2.0"
```

Gli store restano invariati:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Eventi, fotografie, link, sorteggi e messaggi gia presenti non vengono cancellati dall'aggiornamento.

## Struttura

```text
public/                 frontend statico
netlify/functions/      Functions API e media
src/                    dominio, repository, autenticazione e handler
scripts/                verifiche, reset e generatore hash
tests/                  test automatici
docs/                   guide e architettura
mockups/                mockup di riferimento
```

## Privacy e sicurezza

- token, telefoni, codici e abbinamenti non sono esposti nella dashboard comune;
- il recupero richiede numero e codice personale;
- il super-admin usa password hashata, sessione firmata, cookie `HttpOnly`, `SameSite=Strict`, CSRF e blocco temporaneo dopo tentativi ripetuti;
- le azioni distruttive usano snapshot della stanza, token HMAC temporanei e controllo della versione corrente;
- i dati sensibili nel Control Center sono coperti fino al clic sull'occhio;
- ogni azione critica viene registrata nell'audit log;
- il link admin di una festa, il codice elfo e le credenziali super-admin devono essere trattati come credenziali private.

Consulta [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md) per l'aggiornamento passo-passo.
