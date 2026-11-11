# Architettura Netlify Free v5

## Componenti

- `public/`: home, recupero inviti, regia, partecipante e dashboard responsive;
- `netlify/functions/api.mjs`: API serverless;
- `netlify/functions/media.mjs`: restituzione sicura delle foto;
- `src/domain.mjs`: validazione, budget, sorteggio, profili e normalizzazione;
- `src/repository.mjs`: persistenza concorrente, migrazione e indice telefonico;
- `src/api-app.mjs`: route, privacy e trasformazione delle risposte;
- `src/file-blob-store.mjs`: storage locale compatibile con l'interfaccia Blob.

## Dati principali

Ogni evento v5 contiene:

- metadati festa e `budgetCents`;
- token admin e token pubblico;
- partecipanti con token personale, codice elfo, telefono, abbinamento e profilo regalo;
- messaggi della bacheca.

Il denaro viene salvato in centesimi interi per evitare errori decimali.

## Recupero inviti

Il numero viene normalizzato in E.164 e trasformato in una chiave SHA-256 troncata:

```text
index/phone/<hash>
```

L'indice contiene solo coppie `eventId` / `participantId`; non contiene numero, token personale, codice o abbinamento.

`POST /api/recovery/lookup` restituisce un riepilogo delle feste associate. `POST /api/recovery/unlock` richiede numero, evento e codice elfo. Il confronto del codice usa `timingSafeEqual` quando le lunghezze coincidono.

Dopo lo sblocco:

- viene restituito il link personale;
- il nome estratto viene restituito soltanto se il partecipante lo aveva gia rivelato;
- il frontend lo mostra coperto finche non viene premuto l'occhio.

## Profili regalo

Il profilo viene validato attraverso elenchi consentiti e comprende:

```text
favoriteColor
interests[]
giftStyle
avoid
```

Le preferenze sono pubbliche nella stanza comune per scelta di prodotto. Telefoni, token e abbinamenti restano esclusi dalla risposta pubblica.

## Inviti WhatsApp

Il browser costruisce un URL `https://wa.me/<numero>?text=<messaggio>` con:

- nome del partecipante;
- nome, data, luogo e budget della festa;
- link personale `/join/<token>`;
- codice elfo;
- pagina `/my-events`.

Non esiste un bot e non vengono usate credenziali WhatsApp.

## Compatibilita dati

Gli eventi nuovi usano `schemaVersion: 5`. Alla prima apertura di un evento precedente, il repository:

- preserva abbinamenti, token, foto e messaggi;
- aggiunge `budgetCents: null` se assente;
- crea un codice elfo per ogni partecipante;
- normalizza un profilo regalo vuoto;
- crea gli indici telefonici per i numeri validi.

Gli store Blob non cambiano e la migrazione non e distruttiva.

## Concorrenza

Eventi e indici telefonici usano lettura con ETag e scrittura condizionale. In caso di conflitto l'operazione viene ripetuta, riducendo il rischio di perdere aggiornamenti simultanei.

## Privacy

Le API pubbliche non restituiscono:

- `assignedId`;
- token personali o admin;
- numeri di telefono;
- codici elfo;
- stato interno degli inviti;
- nome estratto prima della rivelazione autorizzata.

La pagina di recupero usa `no-store` e `noindex`. Il link admin e il codice elfo devono essere trattati come credenziali.
