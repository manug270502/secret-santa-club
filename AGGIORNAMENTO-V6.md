# Aggiornamento finale alla versione 6.2.0

Questa versione corregge in modo definitivo il flusso di selezione e cancellazione delle stanze nel Control Center.

## 1. Sostituisci i file

Copia il contenuto del pacchetto v6.2 sopra il repository locale gia collegato a GitHub e Netlify. Mantieni la cartella nascosta `.git`.

Non copiare file `.env` nel repository.

## 2. Controlla in locale

```powershell
npm run check
```

Risultato atteso:

```text
22 test
22 pass
0 fail
```

## 3. Pubblica

```powershell
git status
git add -A
git commit -m "Fix finale cancellazione stanze v6.2"
git push
```

## 4. Controlla Netlify

Attendi che il deploy diventi `Published`, quindi apri:

```text
https://TUO-SITO.netlify.app/api/health?v=620
```

Deve comparire:

```json
{
  "ok": true,
  "service": "secret-santa-club-netlify-v6.2.0",
  "storage": "netlify-blobs",
  "superAdminConfigured": true
}
```

Se compare ancora una versione precedente, apri il deploy log: Netlify sta ancora servendo l'ultimo deploy riuscito.

## 5. Verifica il Control Center

Apri:

```text
https://TUO-SITO.netlify.app/super-admin
```

Crea o usa soltanto una stanza di prova e verifica:

1. blocco e riattivazione;
2. passaggio nel cestino;
3. chiusura automatica del pannello;
4. riapertura della stanza dal cestino;
5. anteprima della cancellazione definitiva;
6. richiesta della frase `ELIMINA <ID_EVENTO>`.

Non e necessario completare il purge nella prova: basta verificare che nome e ID mostrati corrispondano esattamente alla stanza selezionata.

## Protezioni introdotte

- le richieste di dettaglio precedenti vengono annullate quando si apre un'altra stanza;
- la stanza selezionata viene cancellata dallo stato del browser quando il pannello si chiude;
- ogni cambio di stato richiede ID, nome e `updatedAt` coerenti;
- il purge richiede un token HMAC valido solo per evento, sessione e versione correnti;
- prima di cancellare vengono salvati e verificati evento e fotografie;
- se il purge fallisce, il repository esegue il rollback automatico;
- una voce catalogo orfana puo essere rimossa senza eseguire un purge.

## Dati esistenti

Gli store non cambiano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

L'aggiornamento non cancella eventi, foto, sorteggi, link, profili o messaggi.

## Credenziali super-admin

Le variabili esistenti rimangono valide:

```text
SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD_HASH
SUPERADMIN_SESSION_SECRET
SUPERADMIN_SESSION_HOURS
```

Non e necessario rigenerarle per passare dalla v6.1 alla v6.2.
