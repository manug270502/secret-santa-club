# Inviti WhatsApp gratuiti

Secret Santa Club v6 non usa Twilio, WhatsApp Business Platform o provider a pagamento.

La cabina admin costruisce un link `wa.me` che apre il normale WhatsApp con:

- destinatario già selezionato;
- messaggio già scritto;
- link personale;
- codice elfo;
- link di recupero.

L'admin deve soltanto premere **Invia** dentro WhatsApp. Il sito registra esclusivamente che la chat è stata aperta; non può sapere gratuitamente e senza API Business se il messaggio è stato inviato, consegnato o letto.

Le eventuali variabili `TWILIO_*` possono essere eliminate da Netlify.
