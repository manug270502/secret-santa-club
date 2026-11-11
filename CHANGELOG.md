# Changelog

## 3.0.0 - Netlify + Twilio

- ridisegno responsive per smartphone;
- toggle **Parteciperai anche tu?** nella creazione evento;
- admin aggiunto al sorteggio solo quando il toggle e attivo;
- nome e numero admin nascosti quando non partecipa;
- invio WhatsApp automatico lato server tramite Twilio;
- supporto Content Template con quattro variabili;
- pulsanti **Invia tutti**, **Invia ora**, **Reinvia** e **Aggiorna consegne**;
- stato messaggio persistente per partecipante;
- modifica del numero WhatsApp dalla cabina admin;
- blocco dei doppi invii concorrenti;
- credenziali Twilio solo in variabili ambiente Netlify;
- nuovi test per Twilio, privacy, mobile e concorrenza;
- compatibilita mantenuta con gli store Blob `v2` gia in produzione.
