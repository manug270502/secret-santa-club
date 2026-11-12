# Aggiornare Secret Santa Club v6.2.0 su Netlify

La versione 6.2 conserva gli stessi Netlify Blobs e finalizza il Control Center con conferme legate alla stanza, backup delle fotografie e rollback automatico del purge.

## 1. Crea un punto di ripristino del codice

Puoi creare un branch prima di copiare i file:

```powershell
git switch -c backup-prima-v6-2
git switch main
```

In alternativa conserva una copia della cartella del progetto.

## 2. Copia la nuova versione

Estrai il pacchetto e copia il contenuto della cartella `secret-santa-club-netlify` nel repository locale già collegato a GitHub.

Non eliminare:

```text
.git
```

Non aggiungere al repository file `.env` o credenziali.

## 3. Verifica in locale

```powershell
npm run check
```

Il risultato atteso è:

```text
22 test
22 pass
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
git commit -m "Fix finale cancellazione stanze v6.2"
git push
```

Netlify avvia automaticamente il deploy.

## 5. Configura il super-admin

Se il super-admin è già configurato, non devi cambiare nulla. Per una prima configurazione, genera l'hash della password:

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

Dopo ogni modifica alle variabili esegui un nuovo deploy.

## 6. Controlla il deploy

Apri:

```text
https://TUO-SITO.netlify.app/api/health?v=620
```

Risposta attesa:

```json
{
  "ok": true,
  "service": "secret-santa-club-netlify-v6.2.0",
  "storage": "netlify-blobs",
  "superAdminConfigured": true
}
```

Poi apri:

```text
https://TUO-SITO.netlify.app/super-admin
```

## 7. Verifica con una stanza di prova

Prima di usare il pannello sulle feste reali:

1. crea una stanza di prova con almeno tre persone;
2. apri il Control Center;
3. blocca e riattiva la stanza;
4. concludila e verifica la modalità sola lettura;
5. esporta CSV e JSON;
6. spostala nel cestino: il pannello deve chiudersi;
7. riaprila dal cestino e verifica che nome e ID siano quelli corretti;
8. premi elimina definitivamente e controlla che la frase richiesta sia `ELIMINA <ID_EVENTO>`;
9. completa il purge soltanto sulla stanza di prova;
10. verifica che le altre stanze siano ancora gestibili.

## 8. Protezione del purge

Il server non accetta una semplice richiesta DELETE. Prima emette un token firmato valido per pochi minuti, per quella sessione e per la versione corrente dell'evento. Il purge parte solo dopo la conferma esatta.

Prima di cancellare:

- salva l'intero record dell'evento;
- copia tutte le foto in chiavi di backup separate;
- rilegge e verifica backup e dimensioni;
- procede in sequenza;
- in caso di errore ripristina automaticamente record, indici, catalogo e foto.

## 9. Stanze esistenti e voci orfane

Le stanze già presenti vengono individuate tramite il prefisso `event/` nei Blobs. Il pulsante **Ricostruisci indice** non cambia sorteggi, foto o partecipanti.

Se il catalogo contiene una scheda senza evento corrispondente, il pannello la segnala come voce orfana. Puoi rimuovere soltanto quella scheda riassuntiva; l'operazione non esegue un purge.

## 10. Dati conservati

Gli store restano:

```text
secret-santa-data-v2
secret-santa-media-v2
```

L'aggiornamento non cancella:

- eventi;
- partecipanti;
- abbinamenti;
- token;
- fotografie;
- messaggi;
- rivelazioni;
- codici elfo.

## Problemi comuni

### `/api/health` mostra una versione precedente

Apri il deploy più recente. Se è `Failed`, leggi il deploy log; Netlify continua a servire l'ultimo deploy riuscito. Se è `Published`, usa l'URL con `?v=620` e fai un refresh completo.

### `/api/health` mostra `superAdminConfigured: false`

Manca una variabile, il segreto è più corto di 32 caratteri oppure il deploy non è stato rifatto dopo il salvataggio.

### Login non riuscito dopo aver cambiato password

Genera un nuovo hash, sostituisci `SUPERADMIN_PASSWORD_HASH`, salva e avvia un nuovo deploy. Nel form devi inserire la password originale, non la stringa `scrypt$...`.

### `nothing to commit`

I file non sono stati copiati nella cartella che contiene `.git`, oppure erano già presenti. Controlla:

```powershell
git status
git remote -v
```

### Il sito sembra ancora vecchio

Attendi il deploy `Published`, poi ricarica forzatamente la pagina. Controlla che gli HTML referenzino `styles.css?v=6.2.0` e che `/api/health?v=620` mostri il servizio v6.2.0.
