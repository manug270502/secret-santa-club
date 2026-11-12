import crypto from 'node:crypto';
import { HttpError, cleanText, token } from './domain.mjs';

const COOKIE_NAME = 'ss_superadmin';
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_VERSION = 1;

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function safeEqual(left, right) {
  const first = Buffer.isBuffer(left) ? left : Buffer.from(String(left || ''));
  const second = Buffer.isBuffer(right) ? right : Buffer.from(String(right || ''));
  return first.length > 0 && first.length === second.length && crypto.timingSafeEqual(first, second);
}

function passwordDigest(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 64, SCRYPT_OPTIONS);
}

export function hashSuperAdminPassword(password, salt = crypto.randomBytes(18)) {
  if (String(password || '').length < 10) {
    throw new Error('La password super-admin deve contenere almeno 10 caratteri.');
  }
  const normalizedSalt = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
  const digest = passwordDigest(password, normalizedSalt);
  return `scrypt$v1$${toBase64Url(normalizedSalt)}$${toBase64Url(digest)}`;
}

export function verifySuperAdminPassword(password, encodedHash) {
  const parts = String(encodedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return false;
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    const actual = passwordDigest(password, salt);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function superAdminConfiguration(env = process.env) {
  const username = cleanText(env.SUPERADMIN_USERNAME, 80);
  const passwordHash = cleanText(env.SUPERADMIN_PASSWORD_HASH, 500);
  const sessionSecret = String(env.SUPERADMIN_SESSION_SECRET || '').trim();
  const configured = Boolean(username && passwordHash && sessionSecret.length >= 32);
  return {
    configured,
    username,
    passwordHash,
    sessionSecret,
    sessionHours: Math.max(1, Math.min(24, Number(env.SUPERADMIN_SESSION_HOURS) || 8)),
  };
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const cookies = new Map();
  header.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  });
  return cookies;
}

function signSession(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function signAction(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(`super-admin-action:${encodedPayload}`).digest('base64url');
}

function sessionPayload(username, hours) {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: SESSION_VERSION,
    sub: username,
    iat: now,
    exp: now + hours * 60 * 60,
    csrf: token(18),
    sid: token(12),
  };
}

export function createSuperAdminSession(username, env = process.env) {
  const config = superAdminConfiguration(env);
  if (!config.configured) throw new HttpError(503, 'Accesso super-admin non ancora configurato.', 'SUPERADMIN_NOT_CONFIGURED');
  const payload = sessionPayload(username, config.sessionHours);
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = signSession(encoded, config.sessionSecret);
  return {
    payload,
    value: `${encoded}.${signature}`,
    maxAge: config.sessionHours * 60 * 60,
  };
}

export function verifySuperAdminSession(request, env = process.env) {
  const config = superAdminConfiguration(env);
  if (!config.configured) throw new HttpError(503, 'Accesso super-admin non ancora configurato.', 'SUPERADMIN_NOT_CONFIGURED');
  const value = parseCookies(request).get(COOKIE_NAME) || '';
  const [encoded, signature, ...extra] = value.split('.');
  if (!encoded || !signature || extra.length) throw new HttpError(401, 'Sessione super-admin non valida.', 'SUPERADMIN_UNAUTHORIZED');
  const expected = signSession(encoded, config.sessionSecret);
  if (!safeEqual(signature, expected)) throw new HttpError(401, 'Sessione super-admin non valida.', 'SUPERADMIN_UNAUTHORIZED');
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encoded).toString('utf8'));
  } catch {
    throw new HttpError(401, 'Sessione super-admin non valida.', 'SUPERADMIN_UNAUTHORIZED');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload?.v !== SESSION_VERSION || payload?.sub !== config.username || !payload?.csrf || Number(payload?.exp) <= now) {
    throw new HttpError(401, 'La sessione super-admin è scaduta.', 'SUPERADMIN_UNAUTHORIZED');
  }
  return payload;
}

export function createSuperAdminActionToken(action, claims, session, env = process.env, ttlSeconds = 300) {
  const config = superAdminConfiguration(env);
  if (!config.configured) throw new HttpError(503, 'Accesso super-admin non ancora configurato.', 'SUPERADMIN_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    v: 1,
    action: cleanText(action, 80),
    sub: session?.sub || '',
    sid: session?.sid || '',
    iat: now,
    exp: now + Math.max(30, Math.min(600, Number(ttlSeconds) || 300)),
    nonce: token(10),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${signAction(encoded, config.sessionSecret)}`;
}

export function verifySuperAdminActionToken(value, expectedAction, session, env = process.env) {
  const config = superAdminConfiguration(env);
  if (!config.configured) throw new HttpError(503, 'Accesso super-admin non ancora configurato.', 'SUPERADMIN_NOT_CONFIGURED');
  const [encoded, signature, ...extra] = String(value || '').split('.');
  if (!encoded || !signature || extra.length) {
    throw new HttpError(400, 'Conferma di sicurezza non valida. Riapri la stanza e riprova.', 'SUPERADMIN_ACTION_INVALID');
  }
  const expected = signAction(encoded, config.sessionSecret);
  if (!safeEqual(signature, expected)) {
    throw new HttpError(400, 'Conferma di sicurezza non valida. Riapri la stanza e riprova.', 'SUPERADMIN_ACTION_INVALID');
  }
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encoded).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Conferma di sicurezza non valida. Riapri la stanza e riprova.', 'SUPERADMIN_ACTION_INVALID');
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    payload?.v !== 1
    || payload?.action !== expectedAction
    || payload?.sub !== session?.sub
    || payload?.sid !== session?.sid
    || Number(payload?.exp) <= now
  ) {
    throw new HttpError(409, 'La conferma è scaduta o appartiene a un’altra sessione. Riapri la stanza.', 'SUPERADMIN_ACTION_EXPIRED');
  }
  return payload;
}

export function requireSuperAdminCsrf(request, session) {
  const received = request.headers.get('x-csrf-token') || '';
  if (!safeEqual(received, session?.csrf || '')) {
    throw new HttpError(403, 'Controllo di sicurezza non valido. Ricarica la pagina.', 'SUPERADMIN_CSRF');
  }
}

export function superAdminCookie(value, request, maxAge) {
  const protocol = new URL(request.url).protocol;
  const forwardedProtocol = String(request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const secure = protocol === 'https:' || forwardedProtocol === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${Math.max(0, Number(maxAge) || 0)}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearSuperAdminCookie(request) {
  return superAdminCookie('', request, 0);
}

export function clientAddress(request) {
  const candidate = request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('client-ip')
    || 'unknown';
  return cleanText(candidate, 120) || 'unknown';
}

export function privacyHash(value, secret = '') {
  return crypto.createHash('sha256').update(`${secret}:${value}`).digest('base64url').slice(0, 32);
}

export function maskPhone(phone) {
  const value = String(phone || '');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return value ? '••••••' : '';
  const prefix = digits.slice(0, Math.min(4, digits.length - 4));
  const suffix = digits.slice(-3);
  return `+${prefix} ••• ••${suffix}`;
}
