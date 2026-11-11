# Aggiornamento rapido alla versione 5

## Sostituzione dei file

Copia il contenuto di questo pacchetto nella cartella del repository gia collegato a GitHub e Netlify. Mantieni la cartella nascosta `.git`.

## Controllo e pubblicazione

```powershell
npm run check
git status
git add -A
git commit -m "Budget, recupero inviti e profili regalo"
git push
```

## Subito dopo il deploy

1. Apri la homepage e controlla il form da iPhone.
2. Apri `/my-events` e verifica la ricerca per numero.
3. Apri una volta la cabina admin di ogni festa precedente che vuoi rendere recuperabile.
4. Reinvia gli inviti precedenti oppure comunica il nuovo codice elfo mostrato in admin.

Non servono nuove variabili ambiente. Eventi e foto rimangono negli stessi Netlify Blobs.
