# Aggiornare Secret Santa Club v6 su Netlify

La versione 6 conserva gli stessi Netlify Blobs e aggiunge Control Center, moderazione globale e ottimizzazioni.

## 1. Crea un punto di ripristino

Puoi creare un branch prima di copiare i file:

```powershell
git switch -c backup-prima-v6
git switch main
```

In alternativa conserva una copia della cartella del progetto.

## 2. Copia la nuova versione

Estrai il pacchetto e copia il contenuto della cartella `secret-santa-club-netlify` nel repository locale già collegato a GitHub.

Non eliminare:

```text
.git
```

## 3. Verifica in locale

```powershell
npm run check
```

Il risultato atteso è:

```text
18 test
18 pass
0 fail
```

Per provare il sito ordinario:

```powershell
npm start
```

Apri `http://localhost:3000`.

## 4. Pubblica il codice

```powershell
git status
git add -A
git commit -m "Control Center super admin e ottimizzazioni v6"
git push
```

Netlify avvia automaticamente il deploy.

## 5. Configura il super-admin

Genera l'hash della password:

```powershell
npm run superadmin:hash -- 'Una password lunga e unica'
```

Genera il segreto:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

In Netlify apri:

```text
Project configuration → Environment variables
```

Aggiungi:

```text
SUPERADMIN_USERNAME=il-tuo-username
SUPERADMIN_PASSWORD_HASH=scrypt$v1$...
SUPERADMIN_SESSION_SECRET=...
SUPERADMIN_SESSION_HOURS=8
```

Non usare `SUPERADMIN_PASSWORD`: la password in chiaro non serve e non deve essere salvata.

Dopo il salvataggio esegui:

```text
Deploys → Trigger deploy → Deploy site
```

## 6. Controlla il deploy

Apri:

```text
https://TUO-SITO.netlify.app/api/health
```

Risposta attesa:

```json
{
  "ok": true,
  "service": "secret-santa-club-netlify-v6",
  "storage": "netlify-blobs",
  "superAdminConfigured": true
}
```

Poi apri:

```text
https://TUO-SITO.netlify.app/super-admin
```

## 7. Carica le stanze esistenti

Alla prima apertura il Control Center ricostruisce il catalogo se non è completo. Le stanze già presenti vengono individuate tramite il prefisso `event/` nei Blobs.

Se manca qualcosa, premi:

```text
Ricostruisci indice
```

L'operazione non cambia sorteggi, foto o partecipanti.

## 8. Dati conservati

Gli store restano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

Non vengono cancellati:

- eventi;
- partecipanti;
- abbinamenti;
- token;
- fotografie;
- messaggi;
- rivelazioni;
- codici elfo.

La prima apertura di un evento con schema precedente applica soltanto i campi mancanti in modo compatibile.

## 9. Prova consigliata

Prima di usare il pannello sulle feste reali:

1. crea una stanza di prova con almeno tre persone;
2. apri il Control Center;
3. blocca e sblocca la stanza;
4. concludila e verifica la modalità sola lettura;
5. esporta CSV e JSON;
6. spostala nel cestino e ripristinala;
7. elimina definitivamente soltanto la stanza di prova.

## 10. Cache e velocità

Dopo il deploy esegui un refresh completo del browser. Gli asset v6 hanno URL versionati e cache lunga; le API private rimangono `no-store`. La dashboard pubblica può mostrare un aggiornamento con qualche secondo di ritardo per ridurre le letture Blob e migliorare la velocità.

## Problemi comuni

### `/api/health` mostra `superAdminConfigured: false`

Manca una variabile, il segreto è più corto di 32 caratteri oppure il deploy non è stato rifatto dopo il salvataggio.

### Login non riuscito dopo aver cambiato password

Genera un nuovo hash, sostituisci `SUPERADMIN_PASSWORD_HASH`, salva e avvia un nuovo deploy. Non inserire la password in chiaro al posto dell'hash.

### Sessione scaduta

Accedi nuovamente. La durata predefinita è 8 ore e può essere cambiata con `SUPERADMIN_SESSION_HOURS` tra 1 e 24.

### `nothing to commit`

I file non sono stati copiati nella cartella che contiene `.git`, oppure erano già presenti. Controlla:

```powershell
git status
git remote -v
```

### Una stanza non appare

Premi **Ricostruisci indice**. Se ancora manca, verifica nei log Functions che il relativo Blob `event/...` sia leggibile.

### Il sito sembra ancora vecchio

Attendi il deploy `Published`, poi ricarica forzatamente la pagina. Controlla che gli HTML referenzino `styles.css?v=6.0.0`.
