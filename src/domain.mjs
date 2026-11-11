import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const GIFT_COLOR_OPTIONS = new Set([
  'rosso',
  'verde',
  'blu',
  'nero',
  'bianco',
  'rosa',
  'viola',
  'giallo-arancione',
  'multicolore',
  'nessuna-preferenza',
]);

export const GIFT_INTEREST_OPTIONS = new Set([
  'tecnologia',
  'sport',
  'musica',
  'cinema-serie',
  'libri',
  'cucina',
  'viaggi',
  'gaming',
  'arte-creativita',
  'benessere',
  'natura',
  'moda',
  'collezionismo',
]);

export const GIFT_STYLE_OPTIONS = new Set([
  'utile',
  'divertente',
  'esperienza',
  'goloso',
  'creativo',
  'sorpresa',
]);

export function token(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function recoveryCode(length = 8) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += RECOVERY_ALPHABET[crypto.randomInt(0, RECOVERY_ALPHABET.length)];
  }
  return value;
}

export function cleanRecoveryCode(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

export function cleanText(value, maxLength = 100) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function cleanPhone(value) {
  return cleanText(value, 30).replace(/[^\d+ ()-]/g, '');
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

export function phoneIndexToken(phone) {
  const normalized = normalizeE164(phone);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('base64url').slice(0, 32);
}

export function validateDate(value) {
  const date = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

export function parseBudgetCents(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(400, 'Inserisci un budget valido, ad esempio 25 o 25,50.');
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    throw new HttpError(400, 'Il budget deve essere compreso tra 0 e 100.000 euro.');
  }
  return Math.round(amount * 100);
}

export function normalizeGiftProfile(value = {}) {
  const favoriteColor = cleanText(value?.favoriteColor, 40).toLowerCase();
  const giftStyle = cleanText(value?.giftStyle, 40).toLowerCase();
  const interests = Array.isArray(value?.interests)
    ? value.interests
    : String(value?.interests ?? '').split(',');
  const normalizedInterests = [...new Set(interests
    .map((item) => cleanText(item, 40).toLowerCase())
    .filter((item) => GIFT_INTEREST_OPTIONS.has(item)))]
    .slice(0, 5);

  return {
    favoriteColor: GIFT_COLOR_OPTIONS.has(favoriteColor) ? favoriteColor : '',
    interests: normalizedInterests,
    giftStyle: GIFT_STYLE_OPTIONS.has(giftStyle) ? giftStyle : '',
    avoid: cleanText(value?.avoid, 140),
  };
}

export function assignSingleCycle(participants) {
  const order = [...participants];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  order.forEach((participant, index) => {
    participant.assignedId = order[(index + 1) % order.length].id;
  });
}

export function nextCelebrationDate() {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, 11, 20, 20, 0, 0);
  if (candidate.getTime() < now.getTime()) year += 1;
  return `${year}-12-20`;
}

function newInviteState() {
  return {
    status: 'not_opened',
    openedAt: null,
    updatedAt: null,
    openCount: 0,
  };
}

export function normalizedInviteState(value = {}) {
  const rawStatus = cleanText(value?.status, 30).toLowerCase();
  const legacyOpenedStatuses = new Set([
    'accepted', 'scheduled', 'queued', 'sending', 'sent', 'delivered', 'read',
    'receiving', 'received',
  ]);
  const openedAt = value?.openedAt || value?.sentAt || null;
  const status = rawStatus === 'opened' || Boolean(openedAt) || legacyOpenedStatuses.has(rawStatus)
    ? 'opened'
    : 'not_opened';
  return {
    status,
    openedAt: status === 'opened' ? openedAt || value?.updatedAt || null : null,
    updatedAt: value?.updatedAt || null,
    openCount: Math.max(0, Math.min(999, Number(value?.openCount ?? value?.attempts) || 0)),
  };
}

export function buildEvent(payload) {
  const name = cleanText(payload?.name, 80);
  const organizerParticipates = payload?.organizerParticipates === true;
  const organizerName = cleanText(payload?.organizerName ?? payload?.organizer, 60);
  const organizerPhone = cleanPhone(payload?.organizerPhone);
  const date = validateDate(payload?.date);
  const location = cleanText(payload?.location, 100);
  const budgetCents = parseBudgetCents(payload?.budget);
  const sourceParticipants = Array.isArray(payload?.participants) ? payload.participants : [];
  const requirePhones = payload?.requirePhones === true;

  if (name.length < 2) throw new HttpError(400, 'Inserisci un nome per la festa.');
  if (organizerParticipates && organizerName.length < 2) {
    throw new HttpError(400, 'Inserisci il tuo nome per partecipare al sorteggio.');
  }

  const entries = organizerParticipates
    ? [{ name: organizerName, phone: organizerPhone, isOrganizer: true }, ...sourceParticipants]
    : sourceParticipants;

  if (entries.length < 3) throw new HttpError(400, 'Servono almeno 3 partecipanti in totale.');
  if (entries.length > 80) throw new HttpError(400, 'Sono supportati al massimo 80 partecipanti.');

  const seen = new Set();
  const participants = entries.map((entry) => {
    const item = typeof entry === 'string' ? { name: entry } : entry || {};
    const participantName = cleanText(item.name, 60);
    const key = participantName.toLocaleLowerCase('it-IT');
    if (!participantName) throw new HttpError(400, 'Ogni partecipante deve avere un nome.');
    const participantPhone = normalizeE164(item.phone);
    if (requirePhones && !participantPhone) throw new HttpError(400, `Inserisci un numero WhatsApp valido per ${participantName}, includendo il prefisso internazionale.`);
    if (seen.has(key)) throw new HttpError(400, `Il nome “${participantName}” è presente più volte.`);
    seen.add(key);
    return {
      id: token(8),
      name: participantName,
      phone: participantPhone,
      isOrganizer: Boolean(item.isOrganizer),
      token: token(24),
      recoveryCode: recoveryCode(),
      assignedId: null,
      photoUrl: '',
      photoToken: '',
      wish: '',
      mood: '🎄',
      giftProfile: normalizeGiftProfile(),
      revealedAt: null,
      profileUpdatedAt: null,
      invite: newInviteState(),
    };
  });

  assignSingleCycle(participants);
  const now = new Date().toISOString();
  const organizerParticipant = participants.find((participant) => participant.isOrganizer);
  return {
    schemaVersion: 5,
    id: token(10),
    name,
    organizer: organizerParticipates ? organizerName : organizerName || 'Admin della festa',
    organizerParticipates,
    organizerParticipantId: organizerParticipant?.id || '',
    date,
    location,
    budgetCents,
    createdAt: now,
    updatedAt: now,
    adminToken: token(24),
    publicToken: token(20),
    participants,
    messages: [],
  };
}

export function assertOpaqueToken(value, label = 'Token') {
  const normalized = cleanText(value, 160);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(normalized)) {
    throw new HttpError(400, `${label} non valido.`);
  }
  return normalized;
}

export function isAllowedMood(value) {
  return new Set(['🎄', '🎁', '🦌', '☃️', '✨', '🍪']).has(value);
}

export function isAllowedWallEmoji(value) {
  return new Set(['✨', '🎄', '🎁', '❤️', '😂', '☃️']).has(value);
}
