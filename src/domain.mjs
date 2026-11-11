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

export function buildEvent(payload) {
  const name = cleanText(payload?.name, 80);
  const organizer = cleanText(payload?.organizer, 60);
  const date = validateDate(payload?.date);
  const location = cleanText(payload?.location, 100);
  const sourceParticipants = Array.isArray(payload?.participants) ? payload.participants : [];

  if (name.length < 2) throw new HttpError(400, 'Inserisci un nome per la festa.');
  if (organizer.length < 2) throw new HttpError(400, 'Inserisci il nome dell’organizzatore.');
  if (sourceParticipants.length < 3) throw new HttpError(400, 'Servono almeno 3 partecipanti.');
  if (sourceParticipants.length > 80) throw new HttpError(400, 'Sono supportati al massimo 80 partecipanti.');

  const seen = new Set();
  const participants = sourceParticipants.map((entry) => {
    const item = typeof entry === 'string' ? { name: entry } : entry || {};
    const participantName = cleanText(item.name, 60);
    const key = participantName.toLocaleLowerCase('it-IT');
    if (!participantName) throw new HttpError(400, 'Ogni partecipante deve avere un nome.');
    if (seen.has(key)) throw new HttpError(400, `Il nome “${participantName}” è presente più volte.`);
    seen.add(key);
    return {
      id: token(8),
      name: participantName,
      phone: cleanPhone(item.phone),
      token: token(24),
      assignedId: null,
      photoUrl: '',
      photoToken: '',
      wish: '',
      mood: '🎄',
      revealedAt: null,
      profileUpdatedAt: null,
    };
  });

  assignSingleCycle(participants);
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: token(10),
    name,
    organizer,
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
