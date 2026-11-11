# Hotfix Netlify 4.1

Corregge due errori osservati sul deploy live:

1. `Executing inline script violates Content Security Policy ... script-src 'self'`
2. `POST /api/events -> 500`

## Modifiche

- `netlify/functions/api.mjs`: `getStore()` viene eseguito dentro l'handler della Function.
- `netlify/functions/media.mjs`: stessa correzione per le foto.
- `netlify.toml`: la CSP ammette solo l'hash dello script inline segnalato, senza `unsafe-inline` per gli script.

Gli store Blob non cambiano nome né regione. I dati esistenti non vengono migrati o cancellati.

## Deploy

Copia i file del pacchetto nel repository esistente, mantenendo la cartella `.git`, poi:

```powershell
npm run check
git add -A
git commit -m "Hotfix Netlify Functions e CSP"
git push
```

Dopo il deploy, prova prima `/api/health`, poi crea un evento.

Se `/api/events` restituisce ancora 500, apri Netlify > Logs & Metrics > Functions > api e copia l'errore runtime completo: il browser mostra solo il codice 500, mentre il log contiene la causa esatta.
