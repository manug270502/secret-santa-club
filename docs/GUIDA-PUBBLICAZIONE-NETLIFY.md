# Aggiornare Secret Santa Club v5 su Netlify

Questa versione conserva Netlify Functions, Netlify Blobs e inviti WhatsApp gratuiti, aggiungendo budget, recupero protetto e profili regalo.

## 1. Crea un punto di ripristino

Prima di sostituire i file puoi creare un branch locale:

```bash
git checkout -b backup-prima-v5
git checkout main
```

Oppure conserva una copia della cartella del progetto.

## 2. Copia la nuova versione

Estrai lo ZIP e copia il contenuto della cartella `secret-santa-club-netlify` nel repository locale gia collegato a GitHub.

Non eliminare:

```text
.git
```

## 3. Verifica in locale

```bash
npm start
```

Apri `http://localhost:3000` e controlla:

- campo data e budget nella creazione;
- flag **Parteciperai anche tu?**;
- pagina **Ho perso il mio link**;
- profilo regalo nella pagina partecipante;
- card scorrevoli nella dashboard;
- messaggio WhatsApp con codice elfo.

Esegui poi:

```bash
npm run check
```

Il risultato atteso e `13` test superati.

## 4. Pubblica

```bash
git status
git add -A
git commit -m "Budget, recupero inviti e profili regalo"
git push
```

Netlify rileva il push e avvia automaticamente il deploy.

## 5. Controlla il deploy

Dalla pagina **Deploys** di Netlify attendi lo stato `Published`, poi apri:

```text
https://TUO-SITO.netlify.app/api/health
```

La risposta deve indicare il servizio v5 e `netlify-blobs`.

Controlla anche:

```text
https://TUO-SITO.netlify.app/my-events
```

## 6. Migra gli eventi gia esistenti

Gli store restano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Non vengono cancellati eventi, fotografie, messaggi o abbinamenti.

Per ogni vecchia festa che vuoi rendere recuperabile:

1. apri una volta il relativo link admin dopo il deploy;
2. attendi che la lista partecipanti venga caricata;
3. verifica che accanto a ciascuno compaia un codice elfo;
4. reinvia l'invito WhatsApp oppure comunica il codice manualmente.

La prima apertura aggiorna lo schema e crea l'indice telefonico. Gli inviti inviati prima della v5 non contenevano il codice, quindi non possono recuperarlo dal vecchio messaggio.

## 7. Flusso di recupero

1. Il partecipante apre **Trova invito** dalla homepage.
2. Inserisce il numero usato dall'admin.
3. Vede le feste associate a quel numero.
4. Inserisce il codice elfo personale.
5. Ottiene il pulsante per il proprio invito e quello per la stanza comune.
6. Se aveva gia rivelato il nome, lo vede inizialmente coperto e puo mostrarlo con l'occhio.

Il numero da solo non restituisce token personali o abbinamenti.

## 8. Profili regalo

Ogni partecipante puo indicare:

- colore preferito;
- fino a cinque passioni;
- stile del regalo;
- cose da evitare;
- indizio libero gia presente nelle versioni precedenti.

Le informazioni sono mostrate nella stanza comune e anche alla persona che deve fare il regalo. Non inserire dati sensibili nelle preferenze.

## 9. Variabili ambiente

Non servono nuove variabili e non servono credenziali WhatsApp.

Restano facoltative:

```text
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

Puoi eliminare eventuali variabili obsolete con prefisso `TWILIO_`.

## Problemi comuni

### Git dice `nothing to commit`

Verifica di avere copiato i file dentro la cartella che contiene `.git`:

```bash
git status
```

### Una vecchia festa non appare nella ricerca

Apri una volta la sua cabina admin dopo il deploy. La migrazione crea l'indice per i numeri gia salvati.

### Il partecipante ha perso anche il codice

L'admin puo leggerlo nella cabina di regia e reinviare l'invito. Senza codice il sito non espone il link personale, per evitare accessi basati sul solo numero.

### Il campo data resta largo su iPhone

Esegui un refresh completo dopo il deploy. I CSS hanno cache di un'ora; in Safari puoi chiudere e riaprire la scheda o cancellare i dati del sito.

### WhatsApp apre una chat sbagliata

Modifica il numero dalla matita nella cabina admin e usa il formato internazionale, per esempio `+39 333 123 4567`.
