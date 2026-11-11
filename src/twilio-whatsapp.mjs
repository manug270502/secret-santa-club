import { HttpError, cleanText } from './domain.mjs';

const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const API_KEY_PATTERN = /^SK[0-9a-fA-F]{32}$/;
const MESSAGING_SERVICE_PATTERN = /^MG[0-9a-fA-F]{32}$/;
const CONTENT_SID_PATTERN = /^HX[0-9a-fA-F]{32}$/;
const MESSAGE_SID_PATTERN = /^(SM|MM)[0-9a-fA-F]{32}$/;
const ALLOWED_STATUSES = new Set([
  'accepted', 'scheduled', 'canceled', 'queued', 'sending', 'sent',
  'failed', 'delivered', 'undelivered', 'receiving', 'received', 'read',
]);

function secret(value) {
  return String(value ?? '').trim();
}

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export function normalizeE164(value, defaultCountryCode = '39') {
  const raw = String(value ?? '').trim().replace(/^whatsapp:/i, '');
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return '';

  if (raw.startsWith('+')) return /^\d{8,15}$/.test(digits) ? `+${digits}` : '';
  if (digits.startsWith(defaultCountryCode) && /^\d{10,15}$/.test(digits)) return `+${digits}`;
  if (/^3\d{9}$/.test(digits)) return `+${defaultCountryCode}${digits}`;
  if (/^0\d{8,11}$/.test(digits)) return `+${defaultCountryCode}${digits}`;
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : '';
}

function normalizeSender(value) {
  const normalized = normalizeE164(value);
  return normalized ? `whatsapp:${normalized}` : '';
}

function statusValue(value) {
  const normalized = cleanText(value, 30).toLowerCase();
  return ALLOWED_STATUSES.has(normalized) ? normalized : 'queued';
}

function missingConfig(env) {
  const accountSid = secret(env.TWILIO_ACCOUNT_SID);
  const apiKey = secret(env.TWILIO_API_KEY);
  const apiSecret = secret(env.TWILIO_API_SECRET);
  const authToken = secret(env.TWILIO_AUTH_TOKEN);
  const serviceSid = secret(env.TWILIO_MESSAGING_SERVICE_SID);
  const from = normalizeSender(env.TWILIO_WHATSAPP_FROM);
  const contentSid = secret(env.TWILIO_CONTENT_SID);
  const allowFreeform = enabled(env.TWILIO_ALLOW_FREEFORM);
  const missing = [];

  if (!ACCOUNT_SID_PATTERN.test(accountSid)) missing.push('TWILIO_ACCOUNT_SID');
  if (apiKey || apiSecret) {
    if (!API_KEY_PATTERN.test(apiKey)) missing.push('TWILIO_API_KEY');
    if (!apiSecret) missing.push('TWILIO_API_SECRET');
  } else if (!authToken) {
    missing.push('TWILIO_AUTH_TOKEN oppure TWILIO_API_KEY/TWILIO_API_SECRET');
  }
  if (!MESSAGING_SERVICE_PATTERN.test(serviceSid) && !from) {
    missing.push('TWILIO_MESSAGING_SERVICE_SID oppure TWILIO_WHATSAPP_FROM');
  }
  if (!CONTENT_SID_PATTERN.test(contentSid) && !allowFreeform) {
    missing.push('TWILIO_CONTENT_SID');
  }
  return missing;
}

function buildConfig(env) {
  const accountSid = secret(env.TWILIO_ACCOUNT_SID);
  const apiKey = secret(env.TWILIO_API_KEY);
  const apiSecret = secret(env.TWILIO_API_SECRET);
  const authToken = secret(env.TWILIO_AUTH_TOKEN);
  const messagingServiceSid = secret(env.TWILIO_MESSAGING_SERVICE_SID);
  const from = normalizeSender(env.TWILIO_WHATSAPP_FROM);
  const contentSid = secret(env.TWILIO_CONTENT_SID);
  const allowFreeform = enabled(env.TWILIO_ALLOW_FREEFORM);
  const missing = missingConfig(env);
  return {
    accountSid,
    username: apiKey || accountSid,
    password: apiKey ? apiSecret : authToken,
    messagingServiceSid: MESSAGING_SERVICE_PATTERN.test(messagingServiceSid) ? messagingServiceSid : '',
    from,
    contentSid: CONTENT_SID_PATTERN.test(contentSid) ? contentSid : '',
    allowFreeform,
    configured: missing.length === 0,
    missing,
  };
}

export function twilioPublicConfig(env = process.env) {
  const config = buildConfig(env);
  return {
    configured: config.configured,
    mode: config.contentSid ? 'template' : config.allowFreeform ? 'freeform-test' : 'disabled',
    sender: config.messagingServiceSid ? 'messaging-service' : config.from ? 'whatsapp-sender' : 'missing',
    templateConfigured: Boolean(config.contentSid),
    missing: config.missing,
  };
}

function makeInviteBody({ participantName, eventName, dateText, inviteUrl }) {
  const when = dateText ? ` il ${dateText}` : '';
  return `🎅 Ciao ${participantName}!\n\nSei invitato/a a “${eventName}”${when}.\n\n🎁 Apri il tuo link personale:\n${inviteUrl}\n\n📸 Carica o scatta una foto e scopri a chi dovrai fare il regalo.\n\n🔒 Il link è personale: non inoltrarlo. Buon Secret Santa! 🎄`;
}

function safeErrorMessage(payload, fallback) {
  const message = cleanText(payload?.message, 240);
  if (!message) return fallback;
  if (/authenticate|credential|token|password|authorization/i.test(message)) {
    return 'Twilio ha rifiutato le credenziali. Controlla le variabili ambiente su Netlify.';
  }
  return message;
}

async function parseTwilioResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

export function createTwilioWhatsAppClient(env = process.env, fetchImpl = globalThis.fetch) {
  const config = buildConfig(env);
  if (typeof fetchImpl !== 'function') throw new Error('Fetch non disponibile per Twilio.');

  const authHeader = () => `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  const endpoint = (suffix = '') => `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages${suffix}.json`;

  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: authHeader(),
        ...(options.headers || {}),
      },
    });
    const payload = await parseTwilioResponse(response);
    if (!response.ok) {
      const message = safeErrorMessage(payload, `Twilio non ha accettato la richiesta (${response.status}).`);
      const error = new HttpError(response.status === 400 ? 400 : 502, message);
      error.twilioCode = cleanText(payload?.code, 30);
      error.twilioStatus = response.status;
      throw error;
    }
    return payload;
  }

  return {
    publicConfig() {
      return twilioPublicConfig(env);
    },

    async sendInvite({ to, participantName, eventName, dateText, inviteUrl }) {
      if (!config.configured) {
        const error = new HttpError(503, `Invio automatico non configurato. Mancano: ${config.missing.join(', ')}.`);
        error.twilioCode = 'NOT_CONFIGURED';
        throw error;
      }
      const recipient = normalizeE164(to);
      if (!recipient) throw new HttpError(400, 'Il numero WhatsApp non è valido. Usa il formato internazionale, ad esempio +39 333 123 4567.');

      const parameters = new URLSearchParams();
      parameters.set('To', `whatsapp:${recipient}`);
      if (config.messagingServiceSid) parameters.set('MessagingServiceSid', config.messagingServiceSid);
      else parameters.set('From', config.from);

      if (config.contentSid) {
        parameters.set('ContentSid', config.contentSid);
        parameters.set('ContentVariables', JSON.stringify({
          1: cleanText(participantName, 60),
          2: cleanText(eventName, 80),
          3: cleanText(dateText || 'data da definire', 80),
          4: String(inviteUrl).slice(0, 500),
        }));
      } else {
        parameters.set('Body', makeInviteBody({ participantName, eventName, dateText, inviteUrl }));
      }
      parameters.set('MessageIntent', 'events');

      const payload = await request(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: parameters.toString(),
      });
      return {
        sid: cleanText(payload.sid, 40),
        status: statusValue(payload.status),
        errorCode: cleanText(payload.error_code, 30),
        errorMessage: cleanText(payload.error_message, 240),
        to: recipient,
      };
    },

    async getMessageStatus(messageSid) {
      const sid = cleanText(messageSid, 40);
      if (!MESSAGE_SID_PATTERN.test(sid)) throw new HttpError(400, 'Identificativo messaggio Twilio non valido.');
      if (!config.configured) throw new HttpError(503, 'Twilio non è configurato su questo sito.');
      const payload = await request(endpoint(`/${sid}`), { method: 'GET' });
      return {
        sid,
        status: statusValue(payload.status),
        errorCode: cleanText(payload.error_code, 30),
        errorMessage: cleanText(payload.error_message, 240),
      };
    },
  };
}
