# Nota sulla recovery v6.1

La diagnostica straordinaria introdotta durante l'incidente di una stanza orfana non fa piu parte del flusso operativo della v6.2.

La versione finale:

- riconosce le voci orfane del catalogo;
- consente di rimuovere soltanto il riepilogo orfano;
- non tenta di ricostruire eventi privi del record principale;
- protegge i nuovi purge con token firmato, backup verificato delle foto e rollback automatico.

Per l'uso corrente consulta `AGGIORNAMENTO-V6.md` e `docs/CONTROL-CENTER-SUPER-ADMIN.md`.
