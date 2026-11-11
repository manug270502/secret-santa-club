# Control Center super-admin

## URL

```text
https://TUO-SITO.netlify.app/super-admin
```

La pagina non è collegata dalla homepage e contiene `noindex`, ma la sicurezza reale è l'autenticazione server-side. Non considerare l'URL segreto come sostituto della password.

## Configurazione iniziale

### 1. Genera l'hash della password

Dal terminale, nella cartella del progetto:

```powershell
npm run superadmin:hash -- 'Una password lunga e unica'
```

Il comando restituisce una stringa simile a:

```text
scrypt$v1$...$...
```

Conserva il risultato. La password in chiaro non deve essere inserita in GitHub, `netlify.toml` o `.env.example`.

### 2. Genera il segreto della sessione

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Usa un valore differente dalla password.

### 3. Aggiungi le variabili su Netlify

Apri:

```text
Project configuration → Environment variables
```

Aggiungi:

```text
SUPERADMIN_USERNAME=il-tuo-username
SUPERADMIN_PASSWORD_HASH=scrypt$v1$...
SUPERADMIN_SESSION_SECRET=valore-casuale-generato
SUPERADMIN_SESSION_HOURS=8
```

`SUPERADMIN_SESSION_HOURS` può essere compreso tra 1 e 24. Dopo ogni modifica alle variabili esegui un nuovo deploy.

## Sicurezza implementata

- password salvata solo come hash scrypt con salt casuale;
- confronto resistente ai timing attack quando possibile;
- sessione firmata HMAC con scadenza;
- cookie `HttpOnly`, `SameSite=Strict` e `Secure` in HTTPS;
- token CSRF per ogni modifica;
- otto tentativi falliti nella stessa finestra provocano un blocco temporaneo di circa 15 minuti;
- audit di login riusciti e falliti;
- risposte super-admin e pagina con `Cache-Control: no-store`;
- dati sensibili coperti nell'interfaccia fino al clic sull'occhio.

Cambiare `SUPERADMIN_SESSION_SECRET` disconnette tutte le sessioni esistenti. Cambiare `SUPERADMIN_PASSWORD_HASH` cambia la password.

## Dashboard

La vista iniziale mostra:

- stanze totali e distribuzione per stato;
- partecipanti, foto, profili regalo, rivelazioni e messaggi;
- modalità generale del sito;
- catalogo ricercabile;
- registro delle ultime operazioni.

La ricerca può usare nome stanza, organizzatore, partecipante, numero di telefono o ID evento. I telefoni non sono restituiti nell'elenco sintetico; servono solo lato server per il filtro.

## Stati di una stanza

### Attiva

Tutto funziona normalmente.

### Bloccata

- percorsi partecipante e dashboard non sono accessibili;
- la regia della festa resta consultabile in sola lettura;
- nessun dato viene cancellato;
- è possibile indicare un motivo visibile agli utenti.

### Conclusa

- stanza, foto e informazioni già presenti restano leggibili;
- non sono consentiti nuovi messaggi, modifiche o rivelazioni;
- può essere riattivata dal Control Center.

### Archiviata

- sparisce dal recupero inviti e dai percorsi normali;
- resta disponibile soltanto al super-admin;
- non viene cancellata.

### Cestino

- conserva l'evento e registra una data indicativa di eliminazione dopo 30 giorni;
- il sistema non elimina automaticamente la stanza;
- può essere ripristinata;
- per la cancellazione definitiva occorre digitare esattamente il nome della stanza.

## Gestione di una stanza

Nel dettaglio puoi:

- modificare nome, organizzatore, data, luogo e budget;
- attivare/disattivare messaggi, foto, recupero, modifiche partecipanti e rivelazione;
- aprire regia e dashboard in una nuova scheda;
- vedere link, codici elfo, telefoni e abbinamenti dietro controlli a occhio;
- modificare nome e numero di un partecipante;
- rigenerare codice elfo o link personale;
- rimuovere una foto;
- eliminare un partecipante prima di qualsiasi rivelazione, mantenendo almeno tre persone;
- rimuovere messaggi dal muro;
- controllare la validità del sorteggio;
- riparare indici e, se nessuno ha rivelato il nome, un sorteggio non valido;
- esportare CSV o backup JSON;
- duplicare la stanza con nuovi token, nuovi codici e nuovo sorteggio.

La duplicazione non copia fotografie, messaggi, profili, stato inviti o rivelazioni.

## Interruttori globali

Il Control Center permette di sospendere separatamente:

- creazione di nuove feste;
- recupero degli inviti;
- caricamento delle fotografie;
- pubblicazione sul muro;
- tutto il sito tramite manutenzione globale.

La manutenzione non impedisce l'accesso al super-admin. Usa il messaggio personalizzato per spiegare brevemente la situazione agli utenti.

## Esportazioni

### CSV

Riepilogo tabellare dei partecipanti e degli abbinamenti. È pensato per controllo amministrativo e contiene dati personali.

### JSON

Backup completo della stanza, inclusi token e dati interni. Conservalo in un luogo privato e non inviarlo nel gruppo WhatsApp.

L'importazione automatica del JSON non è inclusa nella v6; il file è un backup tecnico e può essere usato per un ripristino assistito.

## Buone pratiche

- usa una password unica di almeno 14 caratteri;
- non condividere la sessione su computer pubblici;
- premi **Esci** al termine;
- non mostrare abbinamenti o token durante condivisioni schermo;
- esporta dati soltanto quando necessario e cancellali dopo l'uso;
- prima di eliminare definitivamente una stanza, scarica il backup JSON;
- conserva almeno una copia del repository prima di un aggiornamento importante.
