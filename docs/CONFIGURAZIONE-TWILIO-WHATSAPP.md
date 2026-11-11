# Twilio non e necessario

Secret Santa Club v5 non usa Twilio, WhatsApp Business Platform o altri provider a pagamento.

Gli inviti funzionano tramite click-to-chat: la cabina admin apre il normale WhatsApp con destinatario, messaggio, link personale e codice elfo gia compilati. L'admin preme soltanto **Invia**.

Le eventuali variabili ambiente `TWILIO_*` non vengono lette dal codice e possono essere rimosse dal progetto Netlify.
