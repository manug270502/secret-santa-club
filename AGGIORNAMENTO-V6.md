# Aggiornamento rapido alla versione 6

## 1. Sostituisci i file

Copia il contenuto del pacchetto v6 sopra il repository locale già collegato a GitHub e Netlify. Mantieni la cartella nascosta `.git`.

## 2. Controlla e pubblica

```powershell
npm run check
git status
git add -A
git commit -m "Control Center super admin e ottimizzazioni v6"
git push
```

## 3. Genera le credenziali

```powershell
npm run superadmin:hash -- 'Una password lunga e unica'
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copia i due valori risultanti: il primo è l'hash della password, il secondo è il segreto di sessione.

## 4. Configura Netlify

In **Project configuration → Environment variables** aggiungi:

```text
SUPERADMIN_USERNAME=il-tuo-username
SUPERADMIN_PASSWORD_HASH=scrypt$v1$...
SUPERADMIN_SESSION_SECRET=...
SUPERADMIN_SESSION_HOURS=8
```

Non aggiungere la password in chiaro. Dopo il salvataggio avvia un nuovo deploy.

## 5. Apri il pannello

```text
https://TUO-SITO.netlify.app/super-admin
```

Al primo caricamento il catalogo individua automaticamente anche le stanze già presenti. Il pulsante **Ricostruisci indice** permette di forzare una nuova scansione.

## Dati esistenti

Gli store non cambiano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

L'aggiornamento non cancella eventi, foto, sorteggi, link o messaggi.
