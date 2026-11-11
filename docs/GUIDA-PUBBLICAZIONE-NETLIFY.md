# Guida passo-passo: pubblicare Secret Santa Club su Netlify

## 1. Preparazione sul computer

Installa Node.js 22.13 o superiore, estrai il pacchetto e apri la cartella in Visual Studio Code.

Nel terminale esegui:

```bash
npm run check
npm start
```

Apri `http://localhost:3000` e crea una festa di prova. Questo avvio leggero non richiede `npm install` e salva i dati nella cartella `.local-data`.

Per emulare anche Netlify Functions e Netlify Blobs in locale, facoltativamente esegui:

```bash
npm install
npm run netlify:dev
```

In questo secondo caso Netlify Dev mostra normalmente `http://localhost:8888`.

## 2. Creazione del repository GitHub

### Metodo grafico

1. Accedi a GitHub.
2. Crea un nuovo repository, per esempio `secret-santa-club`.
3. Non aggiungere README o `.gitignore` dal sito: sono già presenti nel pacchetto.
4. Carica tutti i file della cartella oppure usa GitHub Desktop.

### Metodo da terminale

Dopo aver creato il repository vuoto su GitHub:

```bash
git init
git add .
git commit -m "Prima versione Secret Santa Netlify"
git branch -M main
git remote add origin https://github.com/manug270502/secret-santa-club
git push -u origin main
```

Non caricare mai file `.env` con credenziali. Il file `.gitignore` li esclude già.

## 3. Collegamento a Netlify

1. Accedi a Netlify.
2. Seleziona **Add new project**.
3. Scegli **Import an existing project**.
4. Seleziona GitHub e autorizza l'accesso al repository.
5. Scegli `secret-santa-club`.
6. Netlify leggerà automaticamente `netlify.toml`.
7. Controlla che compaiano:
   - build command: `npm run build`;
   - publish directory: `public`;
   - functions directory: `netlify/functions`.
8. Premi **Deploy**.

Non servono variabili ambiente per il primo deploy.

## 4. Primo utilizzo online

Al termine del deploy Netlify assegna un URL HTTPS, per esempio:

```text
https://nome-casuale.netlify.app
```

Aprilo e crea la festa. Dopo il sorteggio si apre la cabina di regia.

Conserva il link admin in un posto sicuro. Non pubblicarlo nella chat del gruppo.

## 5. Inviti WhatsApp

Per ogni partecipante:

1. inserisci il numero con prefisso, per esempio `+39 333 123 4567`;
2. premi **Apri WhatsApp**;
3. si apre direttamente la chat con il messaggio già compilato;
4. controlla il destinatario;
5. premi **Invia** in WhatsApp.

Il pulsante **Apri il prossimo** seleziona il primo partecipante per cui WhatsApp non è ancora stato aperto su quel browser.

Se non inserisci il numero, il sito apre WhatsApp con il testo pronto e ti lascia scegliere il contatto. In nessun caso devi copiare manualmente il link.

Il sito non può sapere con certezza se hai premuto **Invia** dentro WhatsApp. Per questo mostra “WhatsApp aperto”, non “messaggio consegnato”.

## 6. Scegliere un nome più bello

In Netlify apri:

```text
Project configuration > General > Project details > Change project name
```

Puoi ottenere, se disponibile, un URL come:

```text
https://il-nostro-secret-santa.netlify.app
```

Dopo il cambio, apri la cabina di regia dal nuovo dominio prima di usare i pulsanti WhatsApp, così i link generati useranno il nuovo indirizzo.

## 7. Dominio personalizzato facoltativo

Puoi collegare un dominio da:

```text
Domain management > Add a domain
```

Netlify gestisce automaticamente HTTPS. Normalmente non serve impostare `PUBLIC_BASE_URL`, perché l'app usa il dominio della richiesta corrente.

Impostalo solo se vuoi forzare un indirizzo preciso:

```dotenv
PUBLIC_BASE_URL=https://secret-santa.tuodominio.it
```

## 8. Dove sono salvati dati e foto

Nel progetto Netlify apri:

```text
Data & Storage > Blobs
```

Troverai due store:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Il primo contiene eventi, token e abbinamenti. Il secondo contiene le foto. I nuovi deploy non cancellano questi store.

Non modificare manualmente i Blob mentre una festa è in corso.

## 9. Aggiornare il sito

Modifica i file in Visual Studio Code, poi:

```bash
git add .
git commit -m "Descrizione della modifica"
git push
```

Netlify avvierà automaticamente un nuovo deploy. I dati già salvati nei Blob restano disponibili.

## 10. Risoluzione rapida dei problemi

### Il deploy fallisce per la versione Node

Controlla che Netlify usi Node 22. Il progetto include `.nvmrc` e `NODE_VERSION = "22"`.

### Il pulsante WhatsApp apre il contatto sbagliato

Inserisci il numero nel formato internazionale, senza doppioni:

```text
+39 333 123 4567
```

### La foto è troppo grande

Il browser prova a comprimerla automaticamente. In caso di errore, scatta la foto direttamente dal sito oppure scegli un'immagine più leggera.

### La fotocamera non parte

Controlla i permessi del browser. Online il sito è già in HTTPS, requisito necessario per l'accesso alla fotocamera.

### Vedo la festa in locale ma non online

Gli ambienti locali usano archivi separati dalla produzione. Le feste create su `localhost` non vengono copiate in produzione: crea la festa definitiva dal dominio `netlify.app`.

### Ho perso il link admin

Non esiste un elenco pubblico degli eventi, proprio per proteggere gli abbinamenti. Recupera il link dalla cronologia del browser o dai tuoi appunti.
