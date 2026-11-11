# Aggiornare e pubblicare Secret Santa Club su Netlify

Questa versione e pensata anche per un sito gia collegato a GitHub e Netlify.

## 1. Fai una copia di sicurezza

Prima di sostituire i file, duplica la cartella locale del progetto oppure crea un branch Git:

```bash
git checkout -b backup-prima-twilio
git checkout main
```

Non cancellare la cartella nascosta `.git` del repository esistente.

## 2. Sostituisci i file del progetto

Estrai il nuovo pacchetto e copia il contenuto della cartella `secret-santa-club-netlify` dentro la cartella del repository live. Accetta la sostituzione dei file omonimi.

Non copiare eventuali cartelle temporanee come `.local-data` o `node_modules`.

Gli store Netlify Blobs mantengono i nomi precedenti, quindi il deploy aggiornato continua a leggere eventi e foto gia salvati.

## 3. Verifica in locale

Nel terminale di Visual Studio Code:

```bash
npm run check
npm start
```

Apri:

```text
http://localhost:3000
```

Controlla almeno:

- il toggle **Parteciperai anche tu?**;
- la comparsa/scomparsa di nome e numero admin;
- il form partecipanti su una finestra stretta;
- la cabina admin su mobile;
- pagina partecipante e dashboard.

I dati locali sono separati da quelli online.

## 4. Pubblica tramite GitHub

Nel repository gia configurato:

```bash
git status
git add .
git commit -m "Mobile, admin partecipante e inviti WhatsApp Twilio"
git push
```

Non serve eseguire di nuovo `git init` o `git remote add origin`.

Netlify rilevera il push e avviera automaticamente il deploy con:

```text
Build command: npm run build
Publish directory: public
Functions directory: netlify/functions
Node: 22
```

## 5. Verifica il deploy prima di Twilio

Apri il dominio `https://...netlify.app` e controlla che:

- la homepage carichi senza errori;
- la creazione evento funzioni;
- il nuovo admin partecipante venga mostrato con il badge Admin;
- la dashboard comune non mostri abbinamenti;
- la cabina admin mostri il riquadro di configurazione Twilio.

Senza variabili Twilio, la pagina segnala che l'automazione non e ancora attiva. Questo e previsto.

## 6. Configura Twilio

Segui integralmente:

```text
docs/CONFIGURAZIONE-TWILIO-WHATSAPP.md
```

In sintesi servono:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
TWILIO_MESSAGING_SERVICE_SID=MG...
TWILIO_CONTENT_SID=HX...
TWILIO_ALLOW_FREEFORM=false
```

Puoi sostituire `TWILIO_MESSAGING_SERVICE_SID` con `TWILIO_WHATSAPP_FROM` e API Key/API Secret con `TWILIO_AUTH_TOKEN`, ma la configurazione sopra e quella consigliata.

## 7. Imposta le variabili in Netlify

Usa la dashboard Netlify, non `netlify.toml` e non GitHub.

Rendi le variabili disponibili alle Functions e al contesto Production. Dopo il salvataggio esegui un nuovo deploy affinche le Functions usino la configurazione aggiornata.

Apri `/api/system` soltanto per una verifica tecnica: deve indicare `whatsappAutomation.configured: true`, senza mostrare alcun segreto.

## 8. Crea o aggiorna l'evento

Per i nuovi eventi tutti i numeri WhatsApp sono obbligatori. L'admin sceglie:

- toggle attivo: entra nel sorteggio, inserisce nome e numero e riceve il proprio link;
- toggle disattivo: resta solo organizzatore e non appare tra i partecipanti.

Gli eventi creati con la versione precedente restano accessibili. Se un vecchio partecipante non ha numero o il numero e errato, usa il pulsante con la matita nella sua riga: il nuovo numero viene salvato e lo stato dell'invito torna a **Da inviare**.

## 9. Invia gli inviti

Nella cabina admin:

- **Invia tutti** spedisce in sequenza tutti gli inviti non ancora inviati;
- **Invia ora** spedisce una singola riga;
- **Reinvia** richiede conferma per evitare duplicati;
- **Aggiorna consegne** interroga Twilio per gli stati correnti;
- **Backup link** copia i link personali come soluzione di emergenza.

Quando Twilio e attivo, non viene aperta alcuna finestra WhatsApp.

## 10. Aggiornamenti successivi

Dopo ogni modifica:

```bash
npm run check
git add .
git commit -m "Descrizione modifica"
git push
```

Eventi e foto restano nei Netlify Blobs tra un deploy e l'altro.

## 11. Risoluzione rapida

### Il deploy fallisce

Apri il log Netlify e verifica Node 22, `npm run build` e l'installazione di `@netlify/blobs`.

### La pagina dice che Twilio non e configurato

Controlla i nomi esatti delle variabili, il contesto Production, lo scope Functions e avvia un nuovo deploy.

### Il template viene rifiutato

Usa un testo chiaro, campioni realistici e categoria coerente. Un invito a un evento viene normalmente trattato come Marketing, non come Utility.

### Il messaggio fallisce

Premi **Aggiorna consegne**, apri i Messaging Logs Twilio e verifica sender, Content SID, opt-in e formato E.164.

### La foto non parte da mobile

Controlla il permesso fotocamera e prova da HTTPS sul dominio Netlify, non da un indirizzo HTTP della rete locale.

### Vedo dati diversi tra locale e online

E corretto: `.local-data` e Netlify Blobs sono archivi separati.

### Ho perso il link admin

Recuperalo dalla cronologia o dai tuoi appunti. Non esiste un elenco pubblico degli eventi per proteggere gli abbinamenti.
