# Secret Santa Club v5 - guida di aggiornamento Netlify

## Cosa aggiunge questa versione

- correzione del campo data su schermi mobili e iPhone;
- budget facoltativo per ogni regalo;
- ricerca degli inviti persi tramite numero di telefono;
- codice elfo personale per impedire che basti conoscere il numero di un amico;
- nome estratto coperto e mostrabile con l'icona dell'occhio;
- preferenze regalo: colore, passioni, stile e cose da evitare;
- card orizzontali e scorrevoli nella dashboard comune;
- compatibilita con feste, foto, messaggi e sorteggi gia presenti.

## Quale ZIP usare

- **Pacchetto completo v5**: contiene tutto il progetto ed e ideale come copia pulita.
- **Aggiornamento v5 - solo file modificati**: copialo sopra il repository locale esistente, mantenendo la cartella `.git`.

## 1. Copia i file nel repository

La cartella dovrebbe essere simile a:

```text
C:\Users\manu-\OneDrive\Desktop\SolutionAI\secret-santa-club-netlify
```

Estrai lo ZIP e copia i file nella cartella sopra. Conferma la sostituzione. Non eliminare `.git`.

## 2. Verifica e pubblica

Apri il terminale di Visual Studio Code nella cartella del progetto:

```powershell
npm run check
git status
git add -A
git commit -m "Budget, recupero inviti e profili regalo"
git push
```

Il controllo atteso e:

```text
13 test
13 pass
0 fail
```

Dopo il push, Netlify avvia automaticamente il deploy.

## 3. Controlla il sito live

Attendi `Published` nella sezione Deploys di Netlify, quindi apri:

```text
https://TUO-SITO.netlify.app/api/health
```

La risposta deve contenere:

```json
{
  "ok": true,
  "service": "secret-santa-club-netlify-v5",
  "storage": "netlify-blobs"
}
```

Controlla anche:

```text
https://TUO-SITO.netlify.app/my-events
```

## 4. Eventi gia creati

Gli archivi restano invariati:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Non vengono persi eventi, abbinamenti, fotografie o messaggi.

Per rendere recuperabile una festa creata prima della v5:

1. apri una volta il suo link admin dopo il deploy;
2. attendi il caricamento della lista;
3. verifica che ogni partecipante mostri un **codice elfo**;
4. reinvia l'invito WhatsApp oppure comunica il codice manualmente.

Gli inviti vecchi non contenevano il codice elfo. Il link continua a funzionare, ma il recupero tramite numero richiede il nuovo codice.

## 5. Come funziona il recupero

Il partecipante:

1. apre **Trova invito** dalla homepage;
2. inserisce il numero usato dall'organizzatore;
3. vede le feste associate;
4. inserisce il proprio codice elfo;
5. ottiene il pulsante per il link personale e quello per la stanza comune;
6. se aveva gia aperto il pacchetto, puo mostrare o nascondere il nome estratto con l'occhio.

Il solo numero non restituisce link personali o abbinamenti. Questa protezione evita che una persona curiosa possa inserire il numero di un amico e leggerne il Secret Santa.

## 6. Nuovo messaggio WhatsApp

La cabina admin prepara automaticamente:

- nome della festa;
- data, luogo e budget;
- link personale;
- codice elfo;
- link alla pagina di recupero.

Il sito apre la chat corretta; dentro WhatsApp resta soltanto da premere **Invia**.

## 7. Preferenze regalo

Nella pagina personale ogni invitato puo scegliere:

- colore preferito;
- fino a cinque passioni;
- tipo di regalo preferito;
- cose da evitare;
- indizio libero.

Questi dati sono visibili nella dashboard comune, in card scorrevoli, e nella scheda mostrata alla persona abbinata. Telefoni e abbinamenti restano privati.

## 8. Nessuna nuova configurazione

Non servono nuove variabili ambiente o servizi esterni. Restano facoltative:

```text
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

Le vecchie variabili `TWILIO_*` possono essere eliminate: il progetto non le usa.

## Problemi rapidi

### Git mostra `nothing to commit`

Hai probabilmente estratto i file in una cartella diversa. Esegui:

```powershell
git status
```

dalla cartella che contiene `.git` e ricopia lo ZIP li dentro.

### Una vecchia festa non compare nella ricerca

Apri una volta la sua cabina admin dopo il deploy. Questo crea l'indice telefonico senza modificare il sorteggio.

### Il partecipante ha perso anche il codice

L'admin lo vede nella cabina di regia e puo copiarlo o reinviare il messaggio.

### Safari mostra ancora il vecchio campo data

Esegui un refresh completo oppure chiudi e riapri la scheda. I file CSS possono restare nella cache del browser per un'ora.
