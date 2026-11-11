# Secret Santa Club - Netlify Free

Applicazione completa per organizzare un Secret Santa online con HTTPS, sorteggio privato, foto, dashboard comune, giochi natalizi e inviti WhatsApp gratuiti in modalita click-to-chat.

## Funzioni principali

- l'admin crea la festa e sceglie se partecipare al sorteggio;
- se partecipa, inserisce nome e numero e viene aggiunto automaticamente alla lista;
- ogni invitato riceve un link personale e segreto;
- la regia apre la chat WhatsApp corretta con destinatario, testo e link gia compilati;
- dentro WhatsApp resta soltanto da premere **Invia**;
- la regia ricorda quali chat sono gia state aperte, senza fingere di conoscere la consegna reale;
- ogni invitato puo caricare o scattare una foto, lasciare un indizio e scoprire il proprio abbinamento;
- la dashboard comune mostra partecipanti, foto, countdown, indizi, missioni e muro degli auguri, ma non gli abbinamenti;
- eventi e foto vengono salvati nei Netlify Blobs gia usati dalle versioni precedenti.

## Perche l'invio richiede il tap finale

Il progetto non usa API WhatsApp Business, automazioni del browser o servizi non ufficiali. Il link `wa.me` apre il normale WhatsApp dell'admin con il messaggio pronto. Questa e la soluzione gratuita e a basso rischio: WhatsApp mantiene il controllo dell'invio e l'admin preme soltanto il pulsante finale.

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

Il comando esegue controllo della struttura, controllo sintattico e test automatici.

## Aggiornare il sito gia collegato a Netlify

Copia i file di questa versione dentro il repository locale gia pubblicato, senza eliminare la cartella `.git`, quindi esegui:

```bash
npm run check
git add .
git commit -m "Inviti WhatsApp gratuiti click-to-chat"
git push
```

Netlify avviera automaticamente il nuovo deploy. Non sono richieste variabili, account o credenziali WhatsApp.

## Configurazione Netlify

Il file `netlify.toml` contiene gia:

- build command: `npm run build`;
- publish directory: `public`;
- functions directory: `netlify/functions`;
- redirect per API, media e pagine dinamiche;
- intestazioni HTTPS e di sicurezza.

Variabili facoltative:

```text
PUBLIC_BASE_URL=
ENABLE_DEMO=false
BLOBS_REGION=eu-central-1
```

Su Netlify normalmente `PUBLIC_BASE_URL` deve restare vuota: il dominio HTTPS viene rilevato automaticamente.

## Flusso degli inviti

1. L'admin inserisce nome e numero di ogni partecipante.
2. Nella regia preme **Apri WhatsApp** sulla singola persona oppure **Apri il prossimo**.
3. Il sito apre la chat corretta con il testo e il link personale gia pronti.
4. L'admin preme **Invia** dentro WhatsApp.
5. Tornando alla regia, passa al partecipante successivo.
6. Se una spunta e stata segnata per errore, il pulsante `↺` rimette la persona tra gli inviti da aprire.

## Struttura

```text
public/                 frontend statico
netlify/functions/      Functions API e media
src/                    dominio, repository e handler API
scripts/                build check e reset locale
tests/                  test automatici
docs/                   guida e architettura
mockups/                mockup di riferimento
```

## Privacy

- i token admin e partecipante sono casuali e non vengono mostrati nella dashboard comune;
- gli abbinamenti non vengono restituiti dalle API pubbliche;
- i numeri WhatsApp sono visibili soltanto nella cabina admin;
- nessuna credenziale WhatsApp viene richiesta o conservata;
- il link admin deve essere trattato come una password.

Consulta [`docs/GUIDA-PUBBLICAZIONE-NETLIFY.md`](docs/GUIDA-PUBBLICAZIONE-NETLIFY.md) per l'aggiornamento passo-passo.
