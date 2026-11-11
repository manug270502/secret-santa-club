# Hotfix v6.1 - Recovery & Safety

## Cosa corregge
- Il purge non usa piu lo stato globale dopo il prompt: ID e nome della stanza vengono catturati prima della conferma.
- La conferma richiede `ELIMINA <nome stanza>` e invia anche l'ID atteso al server.
- Il server verifica nuovamente ID, nome e stato `trashed`.
- Prima di cancellare viene creato e riletto un backup completo in `backup/deleted/<eventId>/...`.
- Le cancellazioni sono sequenziali e gli errori non vengono piu ignorati con `Promise.allSettled`.
- Il catalogo viene rimosso solo dopo aver verificato la scomparsa del record principale.
- Endpoint diagnostico read-only per stanze orfane.

## Belloccio Natale
Dopo il deploy, entra in `/super-admin` e premi `Gestisci` su Belloccio Natale. Poiche il record principale e gia mancante, la v6.1 eseguira automaticamente la diagnostica read-only e mostrera: catalogo, indici residui, foto residue, audit e backup purge.

Annota o fai uno screenshot del risultato e riportalo in chat. Non premere `Ricostruisci indice` prima della diagnostica.

## Deploy
Copia i file dell'aggiornamento nel repository esistente, senza eliminare `.git`, poi:

    npm run check
    git add -A
    git commit -m "Hotfix v6.1 sicurezza purge e diagnostica recovery"
    git push

Non sono richieste nuove variabili ambiente.
