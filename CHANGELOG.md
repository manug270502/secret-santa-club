# Changelog

## 5.0.0 - Budget, recupero inviti e profili regalo

- corretto il dimensionamento del campo data sugli schermi mobili e rafforzati gli override per Safari iOS;
- aggiunto budget facoltativo in creazione, modifica admin, invito, pagina personale e dashboard;
- aggiunta la pagina `/my-events` per cercare le feste associate a un numero;
- aggiunto codice elfo personale per sbloccare in sicurezza link e abbinamento;
- aggiunta visualizzazione coperta del nome estratto con pulsante mostra/nascondi;
- aggiunto profilo regalo con colore, passioni, stile preferito e cose da evitare;
- aggiunte card regalo orizzontali nella dashboard comune;
- aggiunto indice telefonico con chiave hash e aggiornamento concorrente tramite ETag;
- aggiunta migrazione compatibile degli eventi v4 alla prima riapertura;
- aggiornato il messaggio WhatsApp con budget, codice elfo e pagina di recupero;
- ampliati test automatici, verifiche responsive e documentazione.

## 4.1.0 - Netlify runtime hotfix

- inizializzazione di Netlify Blobs spostata dentro ogni invocazione delle Functions;
- CSP aggiornata con l'hash specifico richiesto dal deploy;
- mantenuti invariati gli store `secret-santa-data-v2` e `secret-santa-media-v2`.

## 4.0.0 - Inviti WhatsApp gratuiti

- rimosso l'invio a pagamento e ogni dipendenza da provider esterni;
- aggiunto il flusso click-to-chat con destinatario, testo e link gia compilati;
- aggiunto **Apri il prossimo** per procedere una persona alla volta;
- aggiunta spunta persistente **Chat WhatsApp aperta** e reset per singolo partecipante;
- mantenuti il flag **Parteciperai anche tu?** e i miglioramenti responsive mobile;
- normalizzazione server dei numeri in formato E.164.

## 3.0.0

- admin partecipante opzionale;
- nuova interfaccia mobile;
- prima sperimentazione di invio tramite provider esterno, poi rimossa.

## 2.0.0

- conversione per Netlify Functions e Netlify Blobs.
