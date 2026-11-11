# Secret Santa Club - Netlify Free v5

Applicazione completa per organizzare un Secret Santa online con HTTPS, sorteggio privato, foto, budget, preferenze regalo, recupero protetto degli inviti e condivisione WhatsApp gratuita in modalita click-to-chat.

## Novita della versione 5

- correzione mirata del campo data sui dispositivi mobili, inclusi gli schermi stretti di iPhone;
- budget facoltativo per ogni regalo, visibile nell'invito e nella stanza comune;
- pagina **Le mie feste** per ritrovare gli inviti associati a un numero di telefono;
- protezione del recupero con un **codice elfo** personale di 8 caratteri;
- nome estratto inizialmente coperto e mostrabile con il pulsante a forma di occhio;
- profilo regalo con colore preferito, passioni, stile del regalo e cose da evitare;
- card orizzontali e scorrevoli nella dashboard comune con le preferenze di tutti;
- piena compatibilita con feste, link e foto gia salvati nelle versioni precedenti.

## Funzioni principali

- l'admin crea la festa e sceglie se partecipare al sorteggio;
- ogni partecipante riceve un link personale, un codice elfo e un abbinamento segreto;
- la regia apre la chat WhatsApp corretta con destinatario, testo, link e codice gia compilati;
- dentro WhatsApp resta soltanto da premere **Invia**;
- ogni invitato puo caricare o scattare una foto, compilare le preferenze regalo e aprire il pacchetto;
- chi perde il messaggio puo cercare le proprie feste tramite numero e sbloccarle con il codice elfo;
- la dashboard comune mostra partecipanti, foto, budget, preferenze, countdown, giochi e muro degli auguri, ma non gli abbinamenti;
- eventi e foto vengono conservati nei Netlify Blobs gia usati dalle versioni precedenti.

## Recupero sicuro degli inviti

Il solo numero di telefono mostra soltanto un elenco essenziale delle feste associate. Per ottenere il link personale e vedere l'abbinamento gia rivelato serve anche il codice elfo ricevuto nell'invito.

Questo evita che una persona possa inserire il numero di un amico e leggere il suo Secret Santa. Il numero viene usato per creare un indice con hash; l'indice non contiene il numero in chiaro. Il numero originale resta nel record dell'evento, accessibile solo dalla cabina admin.

Il codice elfo viene incluso automaticamente nel messaggio WhatsApp. L'admin puo anche copiarlo dalla regia e comunicarlo di nuovo in caso di necessita.

## Perche WhatsApp richiede il tap finale

Il progetto non usa API WhatsApp Business, automazioni del browser o servizi non ufficiali. Il link `wa.me` apre il normale WhatsApp dell'admin con destinatario e messaggio pronti. Questa e la soluzione gratuita e a basso rischio: WhatsApp mantiene il controllo dell'invio e l'admin preme soltanto il pulsante finale.

Lo stato **Chat WhatsApp aperta** significa solo che il collegamento e stato aperto. Non dimostra che il messaggio sia stato inviato, consegnato o letto.

## Avvio locale

Requisito: Node.js 22 o successivo.

```bash
npm start
```

Apri:

```text
http://localhost:3000
```

Per cancellare i dati locali:

```bash
npm run reset:local
```

I dati locali vengono salvati in `.local-data`, esclusa da Git.

## Verifiche

```bash
npm run check
```

Il comando controlla struttura Netlify, sintassi JavaScript e flussi automatici, compresi privacy, migrazione, recupero inviti, budget e profili regalo.

## Aggiornare il sito gia collegato a Netlify

Copia i file di questa versione dentro il repository locale gia pubblicato, senza eliminare la cartella `.git`, quindi esegui:

```bash
npm run check
git add -A
git commit -m "Budget, recupero inviti e profili regalo"
git push
```

Netlify avviera automaticamente il nuovo deploy. Non sono richieste nuove variabili ambiente, API o servizi esterni.

## Eventi gia esistenti

Gli store restano invariati:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Dopo il deploy, apri una volta il link admin di ogni vecchia festa che vuoi rendere recuperabile. Il sistema aggiungera in modo compatibile codice elfo, profilo regalo vuoto e indice telefonico, senza cambiare sorteggio, link, foto o messaggi.

Gli inviti inviati prima della versione 5 non contengono il codice elfo. Per usare il recupero, apri la cabina admin e reinvia l'invito oppure comunica il codice mostrato accanto al partecipante.

## Configurazione Netlify

Il file `netlify.toml` contiene gia:

- build command: `npm run build`;
- publish directory: `public`;
- functions directory: `netlify/functions`;
- redirect per API, media, recupero e pagine dinamiche;
- intestazioni HTTPS, noindex e sicurezza.

Variabili facoltative:

```text
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

Su Netlify normalmente `PUBLIC_BASE_URL` deve restare vuota: il dominio HTTPS viene rilevato automaticamente.

## Struttura

```text
public/                 frontend statico
netlify/functions/      Functions API e media
src/                    dominio, repository e handler API
scripts/                build check e reset locale
tests/                  test automatici
docs/                   guida, privacy e architettura
mockups/                mockup di riferimento
```

## Privacy

- token admin, token partecipante, telefoni e abbinamenti non vengono esposti nella dashboard comune;
- il recupero richiede numero e codice personale prima di restituire il link privato;
- il nome estratto viene restituito dal recupero solo se era gia stato rivelato dal partecipante;
- le preferenze regalo sono intenzionalmente visibili nella stanza comune;
- il link admin deve essere trattato come una password;
- il link della stanza comune va condiviso soltanto con il gruppo.

Consulta [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md) per l'aggiornamento passo-passo.
