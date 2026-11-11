import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function token(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
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

export function validateDate(value) {
  const date = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
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
    status: 'not_sent',
    messageSid: '',
    sentAt: null,
    updatedAt: null,
    errorCode: '',
    errorMessage: '',
    attempts: 0,
  };
}

export function normalizedInviteState(value = {}) {
  const allowed = new Set([
    'not_sent', 'accepted', 'scheduled', 'canceled', 'queued', 'sending',
    'sent', 'failed', 'delivered', 'undelivered', 'receiving', 'received', 'read',
  ]);
  const status = cleanText(value?.status, 30).toLowerCase();
  return {
    status: allowed.has(status) ? status : 'not_sent',
    messageSid: cleanText(value?.messageSid, 40),
    sentAt: value?.sentAt || null,
    updatedAt: value?.updatedAt || null,
    errorCode: cleanText(value?.errorCode, 30),
    errorMessage: cleanText(value?.errorMessage, 240),
    attempts: Math.max(0, Math.min(999, Number(value?.attempts) || 0)),
  };
}

export function buildEvent(payload) {
  const name = cleanText(payload?.name, 80);
  const organizerParticipates = payload?.organizerParticipates === true;
  const organizerName = cleanText(payload?.organizerName ?? payload?.organizer, 60);
  const organizerPhone = cleanPhone(payload?.organizerPhone);
  const date = validateDate(payload?.date);
  const location = cleanText(payload?.location, 100);
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
    const participantPhone = cleanPhone(item.phone);
    if (requirePhones && !participantPhone) throw new HttpError(400, `Inserisci il numero WhatsApp di ${participantName}.`);
    if (seen.has(key)) throw new HttpError(400, `Il nome “${participantName}” è presente più volte.`);
    seen.add(key);
    return {
      id: token(8),
      name: participantName,
      phone: participantPhone,
      isOrganizer: Boolean(item.isOrganizer),
      token: token(24),
      assignedId: null,
      photoUrl: '',
      photoToken: '',
      wish: '',
      mood: '🎄',
      revealedAt: null,
      profileUpdatedAt: null,
      invite: newInviteState(),
    };
  });

  assignSingleCycle(participants);
  const now = new Date().toISOString();
  const organizerParticipant = participants.find((participant) => participant.isOrganizer);
  return {
    schemaVersion: 3,
    id: token(10),
    name,
    organizer: organizerParticipates ? organizerName : organizerName || 'Admin della festa',
    organizerParticipates,
    organizerParticipantId: organizerParticipant?.id || '',
    date,
    location,
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
