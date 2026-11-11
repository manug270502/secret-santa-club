# Configurare Twilio WhatsApp per gli inviti automatici

Questa guida configura l'invio in modo che il sito non apra WhatsApp: l'admin preme **Invia tutti** o **Invia ora** e la Netlify Function invia il messaggio tramite Twilio.

## Prima di iniziare

Per l'uso reale servono:

- account Twilio abilitato all'invio;
- WhatsApp Business Account collegato tramite Twilio;
- un numero registrato come WhatsApp Sender;
- consenso esplicito di ogni destinatario;
- Content Template approvato;
- credito sufficiente sull'account Twilio.

Twilio usa la WhatsApp Business Platform. Non e possibile fare invii automatici dal proprio WhatsApp personale senza questo canale.

## 1. Registra il mittente WhatsApp

Nella Twilio Console apri l'area dei WhatsApp Senders e completa il processo di Self Sign-up. Collega il Business Portfolio Meta e registra il numero che verra visualizzato come mittente.

Documentazione ufficiale:

- https://www.twilio.com/docs/whatsapp/self-sign-up
- https://www.twilio.com/docs/whatsapp/api

Per prove preliminari puoi usare il Twilio Sandbox, ma ogni destinatario di test deve prima aderire al Sandbox e le sue limitazioni non equivalgono alla produzione.

## 2. Crea un Messaging Service, consigliato

Nella Twilio Console:

1. apri **Messaging > Services**;
2. crea un Messaging Service;
3. aggiungi il tuo WhatsApp Sender al Sender Pool;
4. copia il SID che inizia con `MG`.

Lo userai come:

```dotenv
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

In alternativa puoi saltare il Messaging Service e configurare direttamente:

```dotenv
TWILIO_WHATSAPP_FROM=whatsapp:+39XXXXXXXXXX
```

Devi compilare una sola delle due opzioni. Il Messaging Service e preferibile per una gestione piu ordinata del mittente.

## 3. Crea il Content Template

Apri **Messaging > Content Template Builder** e crea un contenuto di tipo testo, lingua italiana.

Nome suggerito:

```text
secret_santa_invito
```

Testo suggerito:

```text
Ciao {{1}}! Sei stato/a invitato/a al Secret Santa "{{2}}" del {{3}}.
Apri il tuo invito personale qui: {{4}}
Il link e personale: non inoltrarlo. Buon Secret Santa!
```

Valori di esempio da usare durante la creazione o la richiesta di approvazione:

```text
{{1}} Anna
{{2}} Natale degli amici
{{3}} 20 dicembre 2026
{{4}} https://esempio.netlify.app/join/esempio123456
```

Le quattro variabili devono restare nello stesso ordine, perche il progetto invia:

```text
1 = nome partecipante
2 = nome evento
3 = data formattata
4 = link personale
```

Per un invito a un evento privato, la categoria **Marketing** e normalmente la scelta prudente: un invito avviato dall'organizzatore non e una conferma di una transazione esistente. Meta puo comunque riclassificare il template.

Invia il template all'approvazione WhatsApp e attendi che risulti approvato. Poi copia il Content SID che inizia con `HX`:

```dotenv
TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Documentazione ufficiale:

- https://www.twilio.com/docs/content/create-and-send-your-first-content-api-template
- https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder
- https://www.twilio.com/docs/whatsapp/tutorial/message-template-approvals-statuses

## 4. Crea credenziali API dedicate

Configurazione consigliata:

```dotenv
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=il_segreto_generato_una_sola_volta
```

Conserva subito l'API Secret: Twilio potrebbe mostrarlo soltanto al momento della creazione.

Alternativa meno consigliata per prove:

```dotenv
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=il_tuo_auth_token
```

Se usi API Key/API Secret, lascia vuoto `TWILIO_AUTH_TOKEN`.

## 5. Aggiungi le variabili su Netlify

Nel progetto Netlify apri la sezione delle variabili ambiente e aggiungi:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
TWILIO_MESSAGING_SERVICE_SID=MG...
TWILIO_CONTENT_SID=HX...
TWILIO_ALLOW_FREEFORM=false
```

Oppure, al posto del Messaging Service:

```dotenv
TWILIO_WHATSAPP_FROM=whatsapp:+39...
```

Imposta le variabili per il contesto Production e rendile disponibili alle Functions. Contrassegna API Secret o Auth Token come valori segreti quando Netlify offre l'opzione.

Non mettere questi valori in:

- `netlify.toml`;
- file JavaScript;
- GitHub;
- screenshot pubblici;
- `.env.example`.

Il file `.env` locale e gia escluso da Git, ma per la produzione e preferibile configurare tutto nella dashboard Netlify.

Documentazione ufficiale Netlify:

- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/environment-variables/get-started/

## 6. Pubblica un nuovo deploy

Dopo aver salvato le variabili, avvia un nuovo deploy dalla dashboard Netlify oppure effettua un nuovo push Git.

Apri poi la cabina admin. Il riquadro deve mostrare:

```text
Invio automatico Twilio attivo
```

Se mostra "Twilio non e ancora configurato", il riquadro elenca soltanto i nomi delle variabili mancanti, mai i valori segreti.

## 7. Prova con una persona consenziente

Prima di usare **Invia tutti**:

1. crea un evento di prova con il tuo numero;
2. verifica di avere espresso l'opt-in;
3. premi **Invia ora** sulla singola riga;
4. controlla il messaggio ricevuto;
5. premi **Aggiorna consegne**;
6. verifica che il link apra la pagina personale corretta.

Solo dopo il test usa l'invio multiplo.

## 8. Sandbox e free-form

La variabile:

```dotenv
TWILIO_ALLOW_FREEFORM=true
```

fa inviare il testo direttamente nel campo `Body`, senza `ContentSid`. Usala solo:

- nel Twilio Sandbox, con destinatari che hanno aderito;
- oppure in conversazioni per cui e ancora aperta la finestra WhatsApp prevista.

Per il sito reale lascia:

```dotenv
TWILIO_ALLOW_FREEFORM=false
```

Se non imposti un Content SID approvato, gli inviti business-initiated possono essere rifiutati da WhatsApp.

## 9. Errori frequenti

### Twilio non configurato

Manca una variabile oppure il SID non ha il formato previsto. Controlla il riquadro nella cabina admin e i log della Netlify Function.

### Errore 63016 o messaggio fuori finestra

Stai tentando un messaggio free-form fuori dalla finestra consentita. Usa il Content SID di un template approvato e `TWILIO_ALLOW_FREEFORM=false`.

### Template non approvato o variabili errate

Controlla che il Content SID sia approvato per WhatsApp e che contenga esattamente `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}`.

### Numero non valido

Usa E.164, per esempio:

```text
+39 333 123 4567
```

Il progetto normalizza i cellulari italiani, ma e preferibile salvare sempre il prefisso internazionale.

### Invio accettato ma non consegnato

Premi **Aggiorna consegne** e leggi il dettaglio passando sullo stato fallito. Controlla anche i Messaging Logs nella Twilio Console.

### Destinatario non consenziente o opt-out

Non reinviare. WhatsApp richiede un opt-in esplicito e le richieste di opt-out devono essere rispettate.

## 10. Sicurezza

- usa un'API Key dedicata invece del token principale quando possibile;
- non condividere il link admin;
- ruota immediatamente le credenziali se finiscono in GitHub o in uno screenshot;
- non inviare inviti a numeri che non hanno acconsentito;
- controlla costi e utilizzo sia in Twilio sia in Netlify;
- elimina i dati della festa quando non servono piu, secondo la tua informativa.
