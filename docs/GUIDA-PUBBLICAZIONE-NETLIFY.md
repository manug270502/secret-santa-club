# Aggiornare Secret Santa Club su Netlify

Questa versione mantiene Netlify e i Blob gia esistenti, ma usa inviti WhatsApp gratuiti con conferma finale manuale.

## 1. Fai una copia della cartella attuale

Prima di sostituire i file, duplica la cartella locale del progetto oppure crea un branch:

```bash
git checkout -b backup-prima-v4
git checkout main
```

## 2. Copia la nuova versione

Estrai lo ZIP e copia il contenuto della cartella `secret-santa-club-netlify` nel repository locale gia collegato a GitHub.

Non eliminare:

```text
.git
```

La cartella `.git` contiene il collegamento al repository remoto.

## 3. Verifica in locale

```bash
npm start
```

Apri `http://localhost:3000`, crea una festa di prova e controlla:

- il flag **Parteciperai anche tu?**;
- il layout da telefono;
- il pulsante **Apri WhatsApp**;
- il pulsante **Apri il prossimo**;
- la spunta **Chat WhatsApp aperta**;
- il reset `↺` di una singola spunta.

Per eseguire tutti i controlli:

```bash
npm run check
```

## 4. Pubblica

```bash
git status
git add .
git commit -m "Inviti WhatsApp gratuiti click-to-chat"
git push
```

Netlify rileva il push e avvia automaticamente il deploy.

## 5. Controlla il deploy

Dalla pagina **Deploys** di Netlify attendi lo stato `Published`, poi apri il dominio `https://...netlify.app`.

Crea la festa definitiva direttamente sul sito online, non su `localhost`, perche i dati locali e quelli Netlify sono separati.

## 6. Usa gli inviti WhatsApp

Nella cabina admin:

1. premi **Apri WhatsApp** sulla prima persona;
2. si apre la chat con destinatario, testo e link gia compilati;
3. premi **Invia** dentro WhatsApp;
4. torna alla regia;
5. premi **Apri il prossimo**.

La regia salva una spunta quando apre la chat. Per prudenza la dicitura e **Chat WhatsApp aperta**, non **Messaggio inviato**: un normale sito non puo leggere l'esito del tuo WhatsApp personale.

## Eventi esistenti

Gli store Netlify restano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Eventi, link e foto esistenti continuano quindi a funzionare. La prima lettura converte in modo compatibile i vecchi stati degli inviti. Cambiando un numero WhatsApp, la spunta di quella persona viene azzerata.

## Variabili ambiente

Non servono variabili WhatsApp. Puoi rimuovere dal progetto Netlify eventuali variabili con prefisso `TWILIO_`.

Restano facoltative:

```text
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

Dopo aver rimosso vecchie variabili, esegui un nuovo deploy solo per mantenere pulita la configurazione; il codice non le usa comunque.

## Problemi comuni

### Git dice che non ci sono modifiche

Verifica di avere copiato i nuovi file dentro la cartella che contiene `.git`:

```bash
git status
```

### WhatsApp apre una chat sbagliata

Modifica il numero dalla matita nella cabina admin e usa il formato internazionale, per esempio:

```text
+39 333 123 4567
```

### Il browser blocca l'apertura

Premi direttamente **Apri WhatsApp** sulla riga del partecipante. L'apertura avviene in risposta a un gesto dell'utente e normalmente non viene bloccata. Su computer deve essere disponibile WhatsApp Web o l'app desktop; su telefono viene aperta l'app.

### La spunta non significa consegnato

E corretto: segnala soltanto che il sito ha aperto la chat. La conferma reale rimane visibile esclusivamente dentro WhatsApp.
