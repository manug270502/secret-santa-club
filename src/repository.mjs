import crypto from 'node:crypto';
import {
  HttpError,
  cleanRecoveryCode,
  normalizeE164,
  normalizeGiftProfile,
  phoneIndexToken,
  recoveryCode,
  token,
} from './domain.mjs';

const EVENT_PREFIX = 'event/';
const INDEX_PREFIX = 'index/';

function eventKey(eventId) {
  return `${EVENT_PREFIX}${eventId}`;
}

function indexKey(kind, value) {
  return `${INDEX_PREFIX}${kind}/${value}`;
}

function phoneIndexKey(phone) {
  const hash = phoneIndexToken(phone);
  return hash ? indexKey('phone', hash) : '';
}

function clone(value) {
  return structuredClone(value);
}

function sameRecoveryCode(left, right) {
  const first = Buffer.from(cleanRecoveryCode(left));
  const second = Buffer.from(cleanRecoveryCode(right));
  return first.length > 0 && first.length === second.length && crypto.timingSafeEqual(first, second);
}

export class SecretSantaRepository {
  constructor({ dataStore, mediaStore }) {
    if (!dataStore || !mediaStore) throw new Error('Data store e media store sono obbligatori.');
    this.dataStore = dataStore;
    this.mediaStore = mediaStore;
  }

  async mutatePhoneIndex(phone, mutator, { attempts = 10 } = {}) {
    const key = phoneIndexKey(phone);
    if (!key) return null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await this.dataStore.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });
      const draft = current?.data && Array.isArray(current.data.entries)
        ? { entries: [...current.data.entries] }
        : { entries: [] };
      const result = await mutator(draft);
      draft.entries = draft.entries
        .filter((entry) => entry?.eventId && entry?.participantId)
        .slice(-250);
      const options = current
        ? { onlyIfMatch: current.etag, metadata: { type: 'phone-index', updatedAt: new Date().toISOString() } }
        : { onlyIfNew: true, metadata: { type: 'phone-index', createdAt: new Date().toISOString() } };
      const write = await this.dataStore.setJSON(key, draft, options);
      if (write.modified) return { record: clone(draft), result };
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 8));
    }
    throw new HttpError(409, 'L’indice degli inviti è stato aggiornato contemporaneamente. Riprova.');
  }

  async addPhoneIndexEntry(phone, eventId, participantId) {
    const normalized = normalizeE164(phone);
    if (!normalized) return null;
    return this.mutatePhoneIndex(normalized, (record) => {
      const exists = record.entries.some((entry) => entry.eventId === eventId && entry.participantId === participantId);
      if (!exists) record.entries.push({ eventId, participantId });
      return { added: !exists };
    });
  }

  async removePhoneIndexEntry(phone, eventId, participantId) {
    const normalized = normalizeE164(phone);
    if (!normalized) return null;
    return this.mutatePhoneIndex(normalized, (record) => {
      const before = record.entries.length;
      record.entries = record.entries.filter((entry) => !(entry.eventId === eventId && entry.participantId === participantId));
      return { removed: before !== record.entries.length };
    });
  }

  async getPhoneIndex(phone) {
    const key = phoneIndexKey(phone);
    if (!key) return { entries: [] };
    const record = await this.dataStore.get(key, { type: 'json', consistency: 'strong' });
    return record && Array.isArray(record.entries) ? record : { entries: [] };
  }

  async createEvent(event) {
    const writes = [];
    const phoneWrites = [];
    const eventWrite = await this.dataStore.setJSON(eventKey(event.id), event, {
      onlyIfNew: true,
      metadata: { type: 'event', createdAt: event.createdAt },
    });
    if (!eventWrite.modified) throw new HttpError(409, 'Collisione durante la creazione della festa. Riprova.');
    writes.push(eventKey(event.id));

    const indices = [
      [indexKey('admin', event.adminToken), { eventId: event.id }],
      [indexKey('public', event.publicToken), { eventId: event.id }],
      ...event.participants.map((participant) => [
        indexKey('participant', participant.token),
        { eventId: event.id, participantId: participant.id },
      ]),
    ];

    try {
      for (const [key, value] of indices) {
        const result = await this.dataStore.setJSON(key, value, {
          onlyIfNew: true,
          metadata: { type: 'index' },
        });
        if (!result.modified) throw new HttpError(409, 'Collisione durante la creazione degli inviti. Riprova.');
        writes.push(key);
      }
      for (const participant of event.participants) {
        if (!normalizeE164(participant.phone)) continue;
        await this.addPhoneIndexEntry(participant.phone, event.id, participant.id);
        phoneWrites.push({ phone: participant.phone, participantId: participant.id });
      }
    } catch (error) {
      await Promise.allSettled(phoneWrites.map((entry) => this.removePhoneIndexEntry(entry.phone, event.id, entry.participantId)));
      await Promise.allSettled(writes.map((key) => this.dataStore.delete(key)));
      throw error;
    }

    return clone(event);
  }

  async lookupIndex(kind, value) {
    return this.dataStore.get(indexKey(kind, value), { type: 'json', consistency: 'strong' });
  }

  async getEventEntry(eventId) {
    const entry = await this.dataStore.getWithMetadata(eventKey(eventId), {
      type: 'json',
      consistency: 'strong',
    });
    if (!entry) return null;
    return { event: clone(entry.data), etag: entry.etag };
  }

  async getEventById(eventId) {
    const entry = await this.getEventEntry(eventId);
    return entry?.event || null;
  }

  async getEventByAdminToken(adminToken) {
    const index = await this.lookupIndex('admin', adminToken);
    if (!index?.eventId) return null;
    return this.getEventById(index.eventId);
  }

  async getEventByPublicToken(publicToken) {
    const index = await this.lookupIndex('public', publicToken);
    if (!index?.eventId) return null;
    return this.getEventById(index.eventId);
  }

  async getParticipantByToken(participantToken) {
    const index = await this.lookupIndex('participant', participantToken);
    if (!index?.eventId || !index?.participantId) return null;
    const event = await this.getEventById(index.eventId);
    if (!event) return null;
    const participant = event.participants.find((item) => item.id === index.participantId);
    if (!participant) return null;
    return { event, participant, eventId: event.id, participantId: participant.id };
  }

  async mutateEvent(eventId, mutator, { attempts = 8 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const entry = await this.getEventEntry(eventId);
      if (!entry) return null;
      const draft = entry.event;
      const result = await mutator(draft);
      draft.updatedAt = new Date().toISOString();
      const write = await this.dataStore.setJSON(eventKey(eventId), draft, {
        onlyIfMatch: entry.etag,
        metadata: { type: 'event', updatedAt: draft.updatedAt },
      });
      if (write.modified) return { event: clone(draft), result };
      await new Promise((resolve) => setTimeout(resolve, 12 + attempt * 9));
    }
    throw new HttpError(409, 'La festa è stata aggiornata contemporaneamente. Riprova tra un istante.');
  }

  async mutateEventByAdminToken(adminToken, mutator) {
    const index = await this.lookupIndex('admin', adminToken);
    if (!index?.eventId) return null;
    return this.mutateEvent(index.eventId, mutator);
  }

  async mutateEventByPublicToken(publicToken, mutator) {
    const index = await this.lookupIndex('public', publicToken);
    if (!index?.eventId) return null;
    return this.mutateEvent(index.eventId, mutator);
  }

  async mutateParticipantByToken(participantToken, mutator) {
    const index = await this.lookupIndex('participant', participantToken);
    if (!index?.eventId || !index?.participantId) return null;
    return this.mutateEvent(index.eventId, async (event) => {
      const participant = event.participants.find((item) => item.id === index.participantId);
      if (!participant) throw new HttpError(404, 'Invito non valido.');
      return mutator({ event, participant });
    });
  }

  async ensureEventRecovery(eventId) {
    let event = await this.getEventById(eventId);
    if (!event) return null;
    const needsMigration = Number(event.schemaVersion || 0) < 5
      || event.budgetCents === undefined
      || event.participants.some((participant) => (
        !cleanRecoveryCode(participant.recoveryCode)
        || !participant.giftProfile
      ));

    if (needsMigration) {
      const migrated = await this.mutateEvent(eventId, (draft) => {
        draft.schemaVersion = 5;
        if (draft.budgetCents === undefined) draft.budgetCents = null;
        draft.participants.forEach((participant) => {
          if (!cleanRecoveryCode(participant.recoveryCode)) participant.recoveryCode = recoveryCode();
          participant.giftProfile = normalizeGiftProfile(participant.giftProfile);
        });
        return { migrated: true };
      });
      event = migrated?.event || event;
    }

    await Promise.all(event.participants.map((participant) => (
      normalizeE164(participant.phone)
        ? this.addPhoneIndexEntry(participant.phone, event.id, participant.id)
        : Promise.resolve(null)
    )));
    return event;
  }

  async ensureEventRecoveryByAdminToken(adminToken) {
    const index = await this.lookupIndex('admin', adminToken);
    if (!index?.eventId) return null;
    return this.ensureEventRecovery(index.eventId);
  }

  async ensureEventRecoveryByPublicToken(publicToken) {
    const index = await this.lookupIndex('public', publicToken);
    if (!index?.eventId) return null;
    return this.ensureEventRecovery(index.eventId);
  }

  async ensureEventRecoveryByParticipantToken(participantToken) {
    const index = await this.lookupIndex('participant', participantToken);
    if (!index?.eventId) return null;
    return this.ensureEventRecovery(index.eventId);
  }

  async findRecoveryRoomsByPhone(phone) {
    const normalized = normalizeE164(phone);
    if (!normalized) return [];
    const index = await this.getPhoneIndex(normalized);
    const rooms = [];
    const stale = [];
    for (const entry of index.entries) {
      const event = await this.getEventById(entry.eventId);
      const participant = event?.participants?.find((item) => item.id === entry.participantId);
      if (!event || !participant || normalizeE164(participant.phone) !== normalized) {
        stale.push(entry);
        continue;
      }
      rooms.push({ event, participant });
    }
    await Promise.allSettled(stale.map((entry) => this.removePhoneIndexEntry(normalized, entry.eventId, entry.participantId)));
    return rooms;
  }

  async getRecoveryAccess({ phone, eventId, code }) {
    const normalized = normalizeE164(phone);
    if (!normalized) return null;
    const rooms = await this.findRecoveryRoomsByPhone(normalized);
    const found = rooms.find((room) => room.event.id === eventId && sameRecoveryCode(room.participant.recoveryCode, code));
    return found ? { event: clone(found.event), participant: clone(found.participant) } : null;
  }

  async savePhoto({ bytes, mime, extension, participantId, eventId }) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const photoToken = token(30);
      const result = await this.mediaStore.set(photoToken, bytes, {
        onlyIfNew: true,
        metadata: {
          mime,
          extension,
          participantId,
          eventId,
          createdAt: new Date().toISOString(),
        },
      });
      if (result.modified) return { photoToken, photoUrl: `/media/${photoToken}` };
    }
    throw new HttpError(500, 'Non è stato possibile salvare la foto. Riprova.');
  }

  async getPhoto(photoToken) {
    return this.mediaStore.getWithMetadata(photoToken, {
      type: 'arrayBuffer',
      consistency: 'strong',
    });
  }

  async deletePhoto(photoToken) {
    if (!photoToken) return;
    await this.mediaStore.delete(photoToken);
  }
}
