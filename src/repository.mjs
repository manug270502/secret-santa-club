import crypto from 'node:crypto';
import {
  HttpError,
  assignSingleCycle,
  buildEvent,
  cleanRecoveryCode,
  cleanText,
  ensureEventManagementFields,
  normalizeE164,
  normalizeGiftProfile,
  normalizeSystemSettings,
  phoneIndexToken,
  recoveryCode,
  token,
  validateAssignments,
} from './domain.mjs';

const EVENT_PREFIX = 'event/';
const INDEX_PREFIX = 'index/';
const CATALOG_KEY = 'system/event-catalog-v1';
const SETTINGS_KEY = 'system/settings-v1';
const AUDIT_PREFIX = 'audit/';
const LOGIN_PREFIX = 'security/login/';
const BACKUP_PREFIX = 'backup/deleted/';

function eventKey(eventId) {
  return `${EVENT_PREFIX}${eventId}`;
}

function purgeBackupKey(eventId, backupId) {
  return `${BACKUP_PREFIX}${eventId}/${backupId}`;
}

function purgeBackupMediaKey(eventId, backupId, photoToken) {
  return `${BACKUP_PREFIX}${eventId}/${backupId}/${photoToken}`;
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

function eventStatus(event) {
  return ['active', 'blocked', 'completed', 'archived', 'trashed'].includes(event?.status)
    ? event.status
    : 'active';
}

function eventPolicies(event) {
  return {
    allowMessages: event?.policies?.allowMessages !== false,
    allowPhotoUploads: event?.policies?.allowPhotoUploads !== false,
    allowRecovery: event?.policies?.allowRecovery !== false,
    allowParticipantEdits: event?.policies?.allowParticipantEdits !== false,
    allowReveal: event?.policies?.allowReveal !== false,
  };
}

function participantProfileComplete(participant) {
  const profile = normalizeGiftProfile(participant?.giftProfile);
  return Boolean(
    participant?.photoUrl
    || participant?.wish
    || profile.favoriteColor
    || profile.giftStyle
    || profile.avoid
    || profile.interests.length,
  );
}

export function buildEventSummary(event) {
  const participants = Array.isArray(event?.participants) ? event.participants : [];
  const messages = Array.isArray(event?.messages) ? event.messages : [];
  const phones = participants.map((participant) => normalizeE164(participant.phone)).filter(Boolean);
  const searchText = [
    event?.id,
    event?.name,
    event?.organizer,
    event?.location,
    ...participants.map((participant) => participant.name),
    ...phones,
  ].filter(Boolean).join(' ').toLocaleLowerCase('it-IT');
  return {
    id: event.id,
    name: event.name || 'Festa senza nome',
    organizer: event.organizer || 'Admin della festa',
    organizerParticipates: Boolean(event.organizerParticipates),
    date: event.date || '',
    location: event.location || '',
    budgetCents: Number.isInteger(event.budgetCents) ? event.budgetCents : null,
    status: eventStatus(event),
    statusReason: cleanText(event.statusReason, 180),
    createdAt: event.createdAt || '',
    updatedAt: event.updatedAt || event.createdAt || '',
    statusUpdatedAt: event.statusUpdatedAt || event.updatedAt || event.createdAt || '',
    trashedAt: event.trashedAt || null,
    purgeAfter: event.purgeAfter || null,
    participantCount: participants.length,
    phoneCount: phones.length,
    photoCount: participants.filter((participant) => participant.photoUrl).length,
    profileCount: participants.filter(participantProfileComplete).length,
    revealedCount: participants.filter((participant) => participant.revealedAt).length,
    messageCount: messages.length,
    searchText,
  };
}

function recoveryRoomSummary(event, participant) {
  return {
    version: 1,
    eventId: event.id,
    participantId: participant.id,
    name: event.name,
    organizer: event.organizer,
    date: event.date || '',
    location: event.location || '',
    budgetCents: Number.isInteger(event.budgetCents) ? event.budgetCents : null,
    status: eventStatus(event),
    allowRecovery: eventPolicies(event).allowRecovery,
    participantName: participant.name,
    profileComplete: participantProfileComplete(participant),
    revealed: Boolean(participant.revealedAt),
    updatedAt: event.updatedAt || event.createdAt || '',
  };
}

function recoverySignature(event) {
  return JSON.stringify({
    name: event.name,
    organizer: event.organizer,
    date: event.date,
    location: event.location,
    budgetCents: event.budgetCents,
    status: eventStatus(event),
    allowRecovery: eventPolicies(event).allowRecovery,
    participants: (event.participants || []).map((participant) => ({
      id: participant.id,
      name: participant.name,
      phone: normalizeE164(participant.phone),
      profileComplete: participantProfileComplete(participant),
      revealed: Boolean(participant.revealedAt),
    })),
  });
}

function catalogComparable(summary) {
  const copy = { ...summary };
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

async function inChunks(items, size, operation) {
  const results = [];
  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    results.push(...await Promise.all(batch.map(operation)));
  }
  return results;
}

export class SecretSantaRepository {
  constructor({ dataStore, mediaStore }) {
    if (!dataStore || !mediaStore) throw new Error('Data store e media store sono obbligatori.');
    this.dataStore = dataStore;
    this.mediaStore = mediaStore;
    this.settingsCache = null;
  }

  async mutateJsonRecord(key, initialValue, mutator, {
    attempts = 10,
    metadata = {},
  } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const current = await this.dataStore.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });
      const draft = current?.data ? clone(current.data) : clone(initialValue);
      const result = await mutator(draft);
      const writeOptions = current
        ? { onlyIfMatch: current.etag, metadata }
        : { onlyIfNew: true, metadata };
      const write = await this.dataStore.setJSON(key, draft, writeOptions);
      if (write.modified) return { record: clone(draft), result };
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 8));
    }
    throw new HttpError(409, 'I dati sono stati aggiornati contemporaneamente. Riprova.');
  }

  async mutatePhoneIndex(phone, mutator, { attempts = 10 } = {}) {
    const key = phoneIndexKey(phone);
    if (!key) return null;
    return this.mutateJsonRecord(key, { entries: [] }, async (draft) => {
      if (!Array.isArray(draft.entries)) draft.entries = [];
      const result = await mutator(draft);
      draft.entries = draft.entries
        .filter((entry) => entry?.eventId && entry?.participantId)
        .slice(-250);
      return result;
    }, {
      attempts,
      metadata: { type: 'phone-index', updatedAt: new Date().toISOString() },
    });
  }

  async upsertPhoneIndexEntry(event, participant) {
    const normalized = normalizeE164(participant?.phone);
    if (!normalized) return null;
    const room = recoveryRoomSummary(event, participant);
    return this.mutatePhoneIndex(normalized, (record) => {
      const index = record.entries.findIndex((entry) => (
        entry.eventId === event.id && entry.participantId === participant.id
      ));
      const value = { eventId: event.id, participantId: participant.id, room };
      if (index >= 0) record.entries[index] = value;
      else record.entries.push(value);
      return { added: index < 0 };
    });
  }

  async addPhoneIndexEntry(phone, eventId, participantId, room = null) {
    const normalized = normalizeE164(phone);
    if (!normalized) return null;
    return this.mutatePhoneIndex(normalized, (record) => {
      const index = record.entries.findIndex((entry) => entry.eventId === eventId && entry.participantId === participantId);
      const value = { eventId, participantId, ...(room ? { room } : {}) };
      if (index >= 0) record.entries[index] = value;
      else record.entries.push(value);
      return { added: index < 0 };
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

  async getPhoneIndex(phone, { consistency = 'strong' } = {}) {
    const key = phoneIndexKey(phone);
    if (!key) return { entries: [] };
    const record = await this.dataStore.get(key, { type: 'json', consistency });
    return record && Array.isArray(record.entries) ? record : { entries: [] };
  }

  async upsertCatalogSummary(event, { complete } = {}) {
    const summary = buildEventSummary(event);
    return this.mutateJsonRecord(CATALOG_KEY, { version: 1, complete: false, entries: {} }, (catalog) => {
      catalog.version = 1;
      if (!catalog.entries || typeof catalog.entries !== 'object' || Array.isArray(catalog.entries)) catalog.entries = {};
      catalog.entries[event.id] = summary;
      if (typeof complete === 'boolean') catalog.complete = complete;
      else if (typeof catalog.complete !== 'boolean') catalog.complete = false;
      catalog.updatedAt = new Date().toISOString();
      return { summary };
    }, { metadata: { type: 'event-catalog', updatedAt: new Date().toISOString() } });
  }

  async removeCatalogEntry(eventId) {
    return this.mutateJsonRecord(CATALOG_KEY, { version: 1, complete: false, entries: {} }, (catalog) => {
      if (!catalog.entries || typeof catalog.entries !== 'object') catalog.entries = {};
      const existed = Boolean(catalog.entries[eventId]);
      delete catalog.entries[eventId];
      catalog.updatedAt = new Date().toISOString();
      return { removed: existed };
    }, { metadata: { type: 'event-catalog', updatedAt: new Date().toISOString() } });
  }

  async listEventKeys() {
    if (typeof this.dataStore.list !== 'function') return [];
    const result = await this.dataStore.list({ prefix: EVENT_PREFIX });
    const blobs = Array.isArray(result?.blobs) ? result.blobs : [];
    return blobs.map((blob) => blob.key).filter((key) => key.startsWith(EVENT_PREFIX));
  }

  async rebuildEventCatalog() {
    const keys = await this.listEventKeys();
    const events = (await inChunks(keys, 12, async (key) => {
      const event = await this.dataStore.get(key, { type: 'json', consistency: 'eventual' });
      return event || null;
    })).filter(Boolean);
    const entries = Object.fromEntries(events.map((event) => [event.id, buildEventSummary(event)]));
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.dataStore.getWithMetadata(CATALOG_KEY, { type: 'json', consistency: 'strong' });
      const catalog = { version: 1, complete: true, entries, updatedAt: now };
      const options = current
        ? { onlyIfMatch: current.etag, metadata: { type: 'event-catalog', rebuiltAt: now } }
        : { onlyIfNew: true, metadata: { type: 'event-catalog', rebuiltAt: now } };
      const write = await this.dataStore.setJSON(CATALOG_KEY, catalog, options);
      if (write.modified) return clone(catalog);
      await new Promise((resolve) => setTimeout(resolve, 15 + attempt * 10));
    }
    throw new HttpError(409, 'Impossibile ricostruire l’indice delle stanze. Riprova.');
  }

  async listEventSummaries({ refresh = false } = {}) {
    let catalog = refresh
      ? null
      : await this.dataStore.get(CATALOG_KEY, { type: 'json', consistency: 'strong' });
    if (!catalog?.complete || !catalog.entries || typeof catalog.entries !== 'object') {
      catalog = await this.rebuildEventCatalog();
    }
    return Object.values(catalog.entries || {}).map(clone);
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
        await this.upsertPhoneIndexEntry(event, participant);
        phoneWrites.push({ phone: participant.phone, participantId: participant.id });
      }
      await this.upsertCatalogSummary(event).catch((error) => console.error('Catalog update failed:', error));
    } catch (error) {
      await Promise.allSettled(phoneWrites.map((entry) => this.removePhoneIndexEntry(entry.phone, event.id, entry.participantId)));
      await Promise.allSettled(writes.map((key) => this.dataStore.delete(key)));
      throw error;
    }

    return clone(event);
  }

  async lookupIndex(kind, value, { consistency = 'strong' } = {}) {
    return this.dataStore.get(indexKey(kind, value), { type: 'json', consistency });
  }

  async getEventEntry(eventId, { consistency = 'strong' } = {}) {
    const entry = await this.dataStore.getWithMetadata(eventKey(eventId), {
      type: 'json',
      consistency,
    });
    if (!entry) return null;
    return { event: clone(entry.data), etag: entry.etag };
  }

  async getEventById(eventId, options = {}) {
    const entry = await this.getEventEntry(eventId, options);
    return entry?.event || null;
  }

  async getEventByAdminToken(adminToken, options = {}) {
    const index = await this.lookupIndex('admin', adminToken, options);
    if (!index?.eventId) return null;
    return this.getEventById(index.eventId, options);
  }

  async getEventByPublicToken(publicToken, options = {}) {
    const index = await this.lookupIndex('public', publicToken, options);
    if (!index?.eventId) return null;
    return this.getEventById(index.eventId, options);
  }

  async getParticipantByToken(participantToken, options = {}) {
    const index = await this.lookupIndex('participant', participantToken, options);
    if (!index?.eventId || !index?.participantId) return null;
    const event = await this.getEventById(index.eventId, options);
    if (!event) return null;
    const participant = event.participants.find((item) => item.id === index.participantId);
    if (!participant) return null;
    return { event, participant, eventId: event.id, participantId: participant.id };
  }

  async syncPhoneIndexesForEvent(event, previousEvent = null) {
    const previousById = new Map((previousEvent?.participants || []).map((participant) => [participant.id, participant]));
    const currentIds = new Set(event.participants.map((participant) => participant.id));
    const removals = [];
    for (const previous of previousEvent?.participants || []) {
      const oldPhone = normalizeE164(previous.phone);
      const current = event.participants.find((participant) => participant.id === previous.id);
      const newPhone = normalizeE164(current?.phone);
      if (oldPhone && (!currentIds.has(previous.id) || oldPhone !== newPhone)) {
        removals.push(this.removePhoneIndexEntry(oldPhone, event.id, previous.id));
      }
    }
    await Promise.allSettled(removals);
    await Promise.allSettled(event.participants.map((participant) => this.upsertPhoneIndexEntry(event, participant)));
    return { previousById };
  }

  async mutateEvent(eventId, mutator, { attempts = 8, syncRecovery = false } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const entry = await this.getEventEntry(eventId, { consistency: 'strong' });
      if (!entry) return null;
      const original = clone(entry.event);
      const draft = entry.event;
      ensureEventManagementFields(draft);
      const beforeSummary = buildEventSummary(draft);
      const beforeRecovery = recoverySignature(draft);
      const result = await mutator(draft);
      ensureEventManagementFields(draft);
      draft.updatedAt = new Date().toISOString();
      const write = await this.dataStore.setJSON(eventKey(eventId), draft, {
        onlyIfMatch: entry.etag,
        metadata: { type: 'event', updatedAt: draft.updatedAt },
      });
      if (write.modified) {
        const afterSummary = buildEventSummary(draft);
        if (catalogComparable(beforeSummary) !== catalogComparable(afterSummary)) {
          await this.upsertCatalogSummary(draft).catch((error) => console.error('Catalog update failed:', error));
        }
        if (syncRecovery || beforeRecovery !== recoverySignature(draft)) {
          await this.syncPhoneIndexesForEvent(draft, original).catch((error) => console.error('Recovery index update failed:', error));
        }
        return { event: clone(draft), result };
      }
      await new Promise((resolve) => setTimeout(resolve, 12 + attempt * 9));
    }
    throw new HttpError(409, 'La festa è stata aggiornata contemporaneamente. Riprova tra un istante.');
  }

  async mutateEventByAdminToken(adminToken, mutator, options = {}) {
    const index = await this.lookupIndex('admin', adminToken);
    if (!index?.eventId) return null;
    return this.mutateEvent(index.eventId, mutator, options);
  }

  async mutateEventByPublicToken(publicToken, mutator, options = {}) {
    const index = await this.lookupIndex('public', publicToken);
    if (!index?.eventId) return null;
    return this.mutateEvent(index.eventId, mutator, options);
  }

  async mutateParticipantByToken(participantToken, mutator, options = {}) {
    const index = await this.lookupIndex('participant', participantToken);
    if (!index?.eventId || !index?.participantId) return null;
    return this.mutateEvent(index.eventId, async (event) => {
      const participant = event.participants.find((item) => item.id === index.participantId);
      if (!participant) throw new HttpError(404, 'Invito non valido.');
      return mutator({ event, participant });
    }, options);
  }

  async ensureEventReady(eventId, { consistency = 'strong' } = {}) {
    let entry = await this.getEventEntry(eventId, { consistency });
    if (!entry && consistency !== 'strong') {
      entry = await this.getEventEntry(eventId, { consistency: 'strong' });
    }
    if (!entry) return null;
    const draft = entry.event;
    const changed = ensureEventManagementFields(draft);
    if (!changed) return draft;
    // Le migrazioni sono scritture: prima di applicarle rileggiamo sempre in modo forte.
    if (consistency !== 'strong') return this.ensureEventReady(eventId, { consistency: 'strong' });
    draft.updatedAt = new Date().toISOString();
    const write = await this.dataStore.setJSON(eventKey(eventId), draft, {
      onlyIfMatch: entry.etag,
      metadata: { type: 'event', migratedAt: draft.updatedAt },
    });
    if (!write.modified) return this.ensureEventReady(eventId, { consistency: 'strong' });
    await Promise.allSettled([
      this.upsertCatalogSummary(draft),
      this.syncPhoneIndexesForEvent(draft, entry.event),
    ]);
    return clone(draft);
  }

  async ensureEventRecovery(eventId) {
    return this.ensureEventReady(eventId);
  }

  async ensureEventRecoveryByAdminToken(adminToken) {
    const index = await this.lookupIndex('admin', adminToken);
    if (!index?.eventId) return null;
    return this.ensureEventReady(index.eventId);
  }

  async ensureEventRecoveryByPublicToken(publicToken) {
    let index = await this.lookupIndex('public', publicToken, { consistency: 'eventual' });
    if (!index?.eventId) index = await this.lookupIndex('public', publicToken, { consistency: 'strong' });
    if (!index?.eventId) return null;
    return this.ensureEventReady(index.eventId, { consistency: 'eventual' });
  }

  async ensureEventRecoveryByParticipantToken(participantToken) {
    const index = await this.lookupIndex('participant', participantToken);
    if (!index?.eventId) return null;
    return this.ensureEventReady(index.eventId);
  }

  async findRecoveryRoomSummariesByPhone(phone) {
    const normalized = normalizeE164(phone);
    if (!normalized) return [];
    const index = await this.getPhoneIndex(normalized, { consistency: 'strong' });
    const rooms = [];
    const stale = [];
    for (const entry of index.entries) {
      if (entry?.room?.version === 1) {
        if (entry.room.status === 'active' || entry.room.status === 'completed') {
          if (entry.room.allowRecovery !== false) rooms.push(clone(entry.room));
        }
        continue;
      }
      const event = await this.getEventById(entry.eventId, { consistency: 'strong' });
      const participant = event?.participants?.find((item) => item.id === entry.participantId);
      if (!event || !participant || normalizeE164(participant.phone) !== normalized) {
        stale.push(entry);
        continue;
      }
      await this.upsertPhoneIndexEntry(event, participant).catch(() => {});
      const room = recoveryRoomSummary(event, participant);
      if ((room.status === 'active' || room.status === 'completed') && room.allowRecovery !== false) rooms.push(room);
    }
    await Promise.allSettled(stale.map((entry) => this.removePhoneIndexEntry(normalized, entry.eventId, entry.participantId)));
    return rooms;
  }

  async findRecoveryRoomsByPhone(phone) {
    const summaries = await this.findRecoveryRoomSummariesByPhone(phone);
    return summaries.map((room) => ({
      event: {
        id: room.eventId,
        name: room.name,
        organizer: room.organizer,
        date: room.date,
        location: room.location,
        budgetCents: room.budgetCents,
        status: room.status,
      },
      participant: {
        id: room.participantId,
        name: room.participantName,
        photoUrl: room.profileComplete ? 'present' : '',
        revealedAt: room.revealed ? 'present' : null,
      },
    }));
  }

  async getRecoveryAccess({ phone, eventId, code }) {
    const normalized = normalizeE164(phone);
    if (!normalized) return null;
    const event = await this.ensureEventReady(eventId);
    if (!event) return null;
    const participant = event.participants.find((item) => normalizeE164(item.phone) === normalized);
    if (!participant || !sameRecoveryCode(participant.recoveryCode, code)) return null;
    return { event: clone(event), participant: clone(participant) };
  }

  async getSystemSettings({ consistency = 'eventual', useCache = true } = {}) {
    const now = Date.now();
    if (useCache && this.settingsCache && this.settingsCache.expiresAt > now) {
      return clone(this.settingsCache.value);
    }
    const record = await this.dataStore.get(SETTINGS_KEY, { type: 'json', consistency });
    const value = normalizeSystemSettings(record || {});
    this.settingsCache = { value, expiresAt: now + 5000 };
    return clone(value);
  }

  async updateSystemSettings(patch) {
    const outcome = await this.mutateJsonRecord(SETTINGS_KEY, normalizeSystemSettings(), (draft) => {
      const next = normalizeSystemSettings({ ...draft, ...patch });
      Object.assign(draft, next, { updatedAt: new Date().toISOString() });
      return { settings: next };
    }, { metadata: { type: 'system-settings', updatedAt: new Date().toISOString() } });
    this.settingsCache = null;
    return outcome.result.settings;
  }

  async appendAudit(entry) {
    const now = new Date().toISOString();
    const key = `${AUDIT_PREFIX}${now.replace(/[:.]/g, '-')}-${token(6)}`;
    const record = {
      id: key.slice(AUDIT_PREFIX.length),
      createdAt: now,
      action: cleanText(entry?.action, 80),
      eventId: cleanText(entry?.eventId, 120),
      eventName: cleanText(entry?.eventName, 120),
      actor: cleanText(entry?.actor, 80) || 'super-admin',
      detail: cleanText(entry?.detail, 300),
      outcome: cleanText(entry?.outcome, 30) || 'success',
    };
    await this.dataStore.setJSON(key, record, {
      onlyIfNew: true,
      metadata: { type: 'audit', action: record.action, createdAt: now },
    });
    return record;
  }

  async listAudit({ limit = 80 } = {}) {
    if (typeof this.dataStore.list !== 'function') return [];
    const result = await this.dataStore.list({ prefix: AUDIT_PREFIX });
    const keys = (result?.blobs || [])
      .map((blob) => blob.key)
      .filter((key) => key.startsWith(AUDIT_PREFIX))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 80)));
    return (await inChunks(keys, 20, (key) => this.dataStore.get(key, {
      type: 'json',
      consistency: 'eventual',
    }))).filter(Boolean);
  }

  async getLoginThrottle(identifier) {
    const key = `${LOGIN_PREFIX}${identifier}`;
    const record = await this.dataStore.get(key, { type: 'json', consistency: 'strong' });
    if (!record) return { attempts: 0, windowStartedAt: null, lockedUntil: null };
    const now = Date.now();
    if (record.lockedUntil && new Date(record.lockedUntil).getTime() > now) return record;
    if (!record.windowStartedAt || now - new Date(record.windowStartedAt).getTime() > 15 * 60 * 1000) {
      return { attempts: 0, windowStartedAt: null, lockedUntil: null };
    }
    return record;
  }

  async recordLoginFailure(identifier) {
    const key = `${LOGIN_PREFIX}${identifier}`;
    const now = new Date();
    const outcome = await this.mutateJsonRecord(key, {
      attempts: 0,
      windowStartedAt: now.toISOString(),
      lockedUntil: null,
    }, (draft) => {
      const windowStart = draft.windowStartedAt ? new Date(draft.windowStartedAt).getTime() : 0;
      if (!windowStart || now.getTime() - windowStart > 15 * 60 * 1000) {
        draft.attempts = 0;
        draft.windowStartedAt = now.toISOString();
        draft.lockedUntil = null;
      }
      draft.attempts = Math.max(0, Number(draft.attempts) || 0) + 1;
      if (draft.attempts >= 8) draft.lockedUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      draft.updatedAt = now.toISOString();
      return { ...draft };
    }, { metadata: { type: 'login-throttle', updatedAt: now.toISOString() } });
    return outcome.record;
  }

  async clearLoginThrottle(identifier) {
    await this.dataStore.delete(`${LOGIN_PREFIX}${identifier}`);
  }

  async setEventStatus(eventId, status, reason = '', { expectedUpdatedAt = '' } = {}) {
    const allowed = new Set(['active', 'blocked', 'completed', 'archived', 'trashed']);
    if (!allowed.has(status)) throw new HttpError(400, 'Stato della stanza non valido.');
    return this.mutateEvent(eventId, (event) => {
      if (expectedUpdatedAt && event.updatedAt !== expectedUpdatedAt) {
        throw new HttpError(409, 'La stanza è cambiata nel frattempo. Riaprila prima di modificare lo stato.', 'EVENT_CHANGED');
      }
      const previous = eventStatus(event);
      if (status === 'trashed') {
        event.previousStatus = previous === 'trashed' ? event.previousStatus || 'active' : previous;
        event.trashedAt = event.trashedAt || new Date().toISOString();
        event.purgeAfter = new Date(Date.now() + 30 * 86400000).toISOString();
      } else {
        if (previous === 'trashed') {
          event.trashedAt = null;
          event.purgeAfter = null;
          event.previousStatus = '';
        }
      }
      event.status = status;
      event.statusReason = cleanText(reason, 180);
      event.statusUpdatedAt = new Date().toISOString();
      return { previous, status };
    }, { syncRecovery: true });
  }

  async restoreEvent(eventId, { expectedUpdatedAt = '' } = {}) {
    const event = await this.getEventById(eventId, { consistency: 'strong' });
    if (!event) return null;
    if (expectedUpdatedAt && event.updatedAt !== expectedUpdatedAt) {
      throw new HttpError(409, 'La stanza è cambiata nel frattempo. Riaprila prima di ripristinarla.', 'EVENT_CHANGED');
    }
    const status = event.status === 'trashed' && ['active', 'blocked', 'completed', 'archived'].includes(event.previousStatus)
      ? event.previousStatus
      : 'active';
    return this.setEventStatus(eventId, status, '', { expectedUpdatedAt: event.updatedAt });
  }

  async regenerateRecoveryCode(eventId, participantId) {
    return this.mutateEvent(eventId, (event) => {
      const participant = event.participants.find((item) => item.id === participantId);
      if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
      participant.recoveryCode = recoveryCode();
      return { recoveryCode: participant.recoveryCode, participantName: participant.name };
    });
  }

  async regenerateParticipantToken(eventId, participantId) {
    const event = await this.getEventById(eventId, { consistency: 'strong' });
    if (!event) return null;
    const participant = event.participants.find((item) => item.id === participantId);
    if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
    const oldToken = participant.token;
    let newToken = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      newToken = token(24);
      const write = await this.dataStore.setJSON(indexKey('participant', newToken), {
        eventId,
        participantId,
      }, { onlyIfNew: true, metadata: { type: 'index' } });
      if (write.modified) break;
      newToken = '';
    }
    if (!newToken) throw new HttpError(500, 'Impossibile generare un nuovo link. Riprova.');
    try {
      const outcome = await this.mutateEvent(eventId, (draft) => {
        const target = draft.participants.find((item) => item.id === participantId);
        if (!target) throw new HttpError(404, 'Partecipante non trovato.');
        target.token = newToken;
        return { token: newToken, participantName: target.name };
      });
      await this.dataStore.delete(indexKey('participant', oldToken));
      return outcome;
    } catch (error) {
      await this.dataStore.delete(indexKey('participant', newToken));
      throw error;
    }
  }

  async removeParticipantPhoto(eventId, participantId) {
    let oldToken = '';
    const outcome = await this.mutateEvent(eventId, (event) => {
      const participant = event.participants.find((item) => item.id === participantId);
      if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
      oldToken = participant.photoToken || '';
      participant.photoToken = '';
      participant.photoUrl = '';
      return { participantName: participant.name };
    }, { syncRecovery: true });
    if (oldToken) await this.deletePhoto(oldToken).catch(() => {});
    return outcome;
  }

  async updateParticipant(eventId, participantId, patch) {
    const before = await this.getEventById(eventId, { consistency: 'strong' });
    if (!before) return null;
    const previous = before.participants.find((item) => item.id === participantId);
    if (!previous) throw new HttpError(404, 'Partecipante non trovato.');
    const oldPhone = normalizeE164(previous.phone);
    const outcome = await this.mutateEvent(eventId, (event) => {
      const participant = event.participants.find((item) => item.id === participantId);
      if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
      if (Object.hasOwn(patch, 'name')) {
        const name = cleanText(patch.name, 60);
        if (name.length < 2) throw new HttpError(400, 'Inserisci un nome valido.');
        const duplicate = event.participants.some((item) => (
          item.id !== participantId && item.name.toLocaleLowerCase('it-IT') === name.toLocaleLowerCase('it-IT')
        ));
        if (duplicate) throw new HttpError(400, `Il nome “${name}” è già presente.`);
        participant.name = name;
        if (participant.isOrganizer) event.organizer = name;
      }
      if (Object.hasOwn(patch, 'phone')) {
        const phone = normalizeE164(patch.phone);
        if (!phone) throw new HttpError(400, 'Inserisci un numero valido con prefisso internazionale.');
        participant.phone = phone;
      }
      return {
        participantName: participant.name,
        phone: participant.phone,
      };
    }, { syncRecovery: true });
    const updated = outcome?.event.participants.find((item) => item.id === participantId);
    const newPhone = normalizeE164(updated?.phone);
    if (oldPhone && oldPhone !== newPhone) await this.removePhoneIndexEntry(oldPhone, eventId, participantId).catch(() => {});
    return outcome;
  }

  async deleteParticipant(eventId, participantId) {
    const before = await this.getEventById(eventId, { consistency: 'strong' });
    if (!before) return null;
    const participant = before.participants.find((item) => item.id === participantId);
    if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
    if (participant.isOrganizer) throw new HttpError(409, 'Il partecipante admin non può essere eliminato: modifica prima l’organizzazione della stanza.');
    if (before.participants.some((item) => item.revealedAt)) {
      throw new HttpError(409, 'Non puoi eliminare partecipanti dopo una rivelazione.');
    }
    if (before.participants.length <= 3) throw new HttpError(409, 'Servono almeno 3 partecipanti.');
    const outcome = await this.mutateEvent(eventId, (event) => {
      event.participants = event.participants.filter((item) => item.id !== participantId);
      assignSingleCycle(event.participants);
      return { participantName: participant.name };
    }, { syncRecovery: true });
    await Promise.allSettled([
      this.dataStore.delete(indexKey('participant', participant.token)),
      this.removePhoneIndexEntry(participant.phone, eventId, participantId),
      participant.photoToken ? this.deletePhoto(participant.photoToken) : Promise.resolve(),
    ]);
    return outcome;
  }

  async duplicateEvent(eventId) {
    const source = await this.ensureEventReady(eventId);
    if (!source) return null;
    const organizerParticipant = source.participants.find((participant) => participant.isOrganizer);
    const duplicate = buildEvent({
      name: `${source.name} (copia)`.slice(0, 80),
      organizerParticipates: Boolean(source.organizerParticipates),
      organizerName: source.organizer,
      organizerPhone: organizerParticipant?.phone || '',
      date: source.date,
      location: source.location,
      budget: Number.isInteger(source.budgetCents) ? String(source.budgetCents / 100) : '',
      requirePhones: false,
      participants: source.participants
        .filter((participant) => !participant.isOrganizer)
        .map((participant) => ({ name: participant.name, phone: participant.phone })),
    });
    await this.createEvent(duplicate);
    return duplicate;
  }

  async repairEvent(eventId) {
    const event = await this.ensureEventReady(eventId);
    if (!event) return null;
    const validation = validateAssignments(event);
    let repairedAssignments = false;
    let current = event;
    if (!validation.valid && !event.participants.some((participant) => participant.revealedAt)) {
      const outcome = await this.mutateEvent(eventId, (draft) => {
        assignSingleCycle(draft.participants);
        return { repairedAssignments: true };
      });
      current = outcome.event;
      repairedAssignments = true;
    }
    await Promise.allSettled([
      this.syncPhoneIndexesForEvent(current),
      this.upsertCatalogSummary(current),
    ]);
    return {
      event: clone(current),
      validation: validateAssignments(current),
      repairedAssignments,
    };
  }

  async createPurgeBackup(event) {
    const now = new Date().toISOString();
    const backupId = `${now.replace(/[:.]/g, '-')}-${token(6)}`;
    const key = purgeBackupKey(event.id, backupId);
    const copiedMediaKeys = [];
    const photos = [];

    try {
      for (const participant of event.participants) {
        if (!participant.photoToken) continue;
        const original = await this.mediaStore.getWithMetadata(participant.photoToken, {
          type: 'arrayBuffer',
          consistency: 'strong',
        });
        if (!original) {
          photos.push({
            participantId: participant.id,
            originalToken: participant.photoToken,
            missing: true,
          });
          continue;
        }
        const backupKey = purgeBackupMediaKey(event.id, backupId, participant.photoToken);
        const write = await this.mediaStore.set(backupKey, original.data, {
          onlyIfNew: true,
          metadata: {
            ...(original.metadata || {}),
            type: 'purge-backup-photo',
            eventId: event.id,
            eventName: event.name,
            participantId: participant.id,
            originalToken: participant.photoToken,
            backupId,
            createdAt: now,
          },
        });
        if (!write.modified) throw new Error(`Copia foto non creata: ${participant.photoToken}`);
        copiedMediaKeys.push(backupKey);
        const verifyPhoto = await this.mediaStore.getWithMetadata(backupKey, {
          type: 'arrayBuffer',
          consistency: 'strong',
        });
        if (!verifyPhoto || verifyPhoto.data.byteLength !== original.data.byteLength) {
          throw new Error(`Copia foto non verificabile: ${participant.photoToken}`);
        }
        photos.push({
          participantId: participant.id,
          originalToken: participant.photoToken,
          backupKey,
          metadata: original.metadata || {},
          byteLength: original.data.byteLength,
          missing: false,
        });
      }

      const backup = {
        version: 2,
        backupId,
        createdAt: now,
        reason: 'pre-purge',
        event: clone(event),
        photos,
      };
      const write = await this.dataStore.setJSON(key, backup, {
        onlyIfNew: true,
        metadata: {
          type: 'event-backup',
          eventId: event.id,
          eventName: event.name,
          backupId,
          createdAt: now,
          photoCount: photos.filter((photo) => !photo.missing).length,
        },
      });
      if (!write.modified) throw new Error('Manifest di backup non creato.');
      const verify = await this.dataStore.get(key, { type: 'json', consistency: 'strong' });
      if (!verify?.event || verify.event.id !== event.id || verify.event.name !== event.name || verify.backupId !== backupId) {
        throw new Error('Manifest di backup non verificabile.');
      }
      return {
        key,
        backupId,
        createdAt: now,
        photoCount: photos.filter((photo) => !photo.missing).length,
        missingPhotoCount: photos.filter((photo) => photo.missing).length,
        manifest: backup,
      };
    } catch (error) {
      await Promise.allSettled(copiedMediaKeys.map((mediaKey) => this.mediaStore.delete(mediaKey)));
      await this.dataStore.delete(key).catch(() => {});
      throw new HttpError(500, 'Backup di sicurezza non completato. Eliminazione annullata.', 'PURGE_BACKUP_FAILED');
    }
  }

  async restoreEventFromPurgeBackup(backup) {
    const event = clone(backup.event);
    await this.dataStore.setJSON(eventKey(event.id), event, {
      metadata: { type: 'event', restoredFromBackupAt: new Date().toISOString() },
    });
    await this.dataStore.setJSON(indexKey('admin', event.adminToken), { eventId: event.id }, {
      metadata: { type: 'index', restoredFromBackupAt: new Date().toISOString() },
    });
    await this.dataStore.setJSON(indexKey('public', event.publicToken), { eventId: event.id }, {
      metadata: { type: 'index', restoredFromBackupAt: new Date().toISOString() },
    });
    for (const participant of event.participants) {
      await this.dataStore.setJSON(indexKey('participant', participant.token), {
        eventId: event.id,
        participantId: participant.id,
      }, { metadata: { type: 'index', restoredFromBackupAt: new Date().toISOString() } });
    }
    for (const photo of backup.photos || []) {
      if (photo.missing || !photo.backupKey || !photo.originalToken) continue;
      const stored = await this.mediaStore.getWithMetadata(photo.backupKey, {
        type: 'arrayBuffer',
        consistency: 'strong',
      });
      if (!stored) continue;
      await this.mediaStore.set(photo.originalToken, stored.data, {
        metadata: {
          ...(photo.metadata || stored.metadata || {}),
          restoredFromBackupAt: new Date().toISOString(),
        },
      });
    }
    await this.syncPhoneIndexesForEvent(event);
    await this.upsertCatalogSummary(event);
    return event;
  }

  async getOrphanCatalogEntry(eventId) {
    const [event, catalog, backups] = await Promise.all([
      this.getEventById(eventId, { consistency: 'strong' }),
      this.dataStore.get(CATALOG_KEY, { type: 'json', consistency: 'strong' }),
      this.listPurgeBackups(eventId),
    ]);
    return {
      eventPresent: Boolean(event),
      catalog: catalog?.entries?.[eventId] || null,
      backups,
    };
  }

  async removeOrphanCatalogEntry(eventId, expectedName) {
    const event = await this.getEventById(eventId, { consistency: 'strong' });
    if (event) throw new HttpError(409, 'La stanza esiste ancora: la voce non è orfana.', 'EVENT_NOT_ORPHANED');
    const catalog = await this.dataStore.get(CATALOG_KEY, { type: 'json', consistency: 'strong' });
    const entry = catalog?.entries?.[eventId] || null;
    if (!entry) return { removed: false, entry: null };
    if (cleanText(expectedName, 120) !== entry.name) {
      throw new HttpError(409, 'Il nome della voce è cambiato. Aggiorna il Control Center.', 'ORPHAN_CHANGED');
    }
    const outcome = await this.removeCatalogEntry(eventId);
    return { removed: Boolean(outcome?.result?.removed), entry: clone(entry) };
  }

  async listPurgeBackups(eventId) {
    if (typeof this.dataStore.list !== 'function') return [];
    const result = await this.dataStore.list({ prefix: `${BACKUP_PREFIX}${eventId}/` });
    return (result?.blobs || []).map((blob) => ({ key: blob.key, metadata: blob.metadata || null }));
  }

  async purgeEvent(eventId, { expectedUpdatedAt = '' } = {}) {
    const event = await this.getEventById(eventId, { consistency: 'strong' });
    if (!event) return null;
    if (expectedUpdatedAt && event.updatedAt !== expectedUpdatedAt) {
      throw new HttpError(409, 'La stanza è cambiata dopo la conferma. Eliminazione annullata.', 'EVENT_CHANGED');
    }
    const backup = await this.createPurgeBackup(event);
    try {
      for (const participant of event.participants) {
        await this.removePhoneIndexEntry(participant.phone, event.id, participant.id);
      }
      const indexKeys = [
        indexKey('admin', event.adminToken),
        indexKey('public', event.publicToken),
        ...event.participants.map((participant) => indexKey('participant', participant.token)),
      ];
      for (const key of indexKeys) await this.dataStore.delete(key);
      for (const participant of event.participants) {
        if (participant.photoToken) await this.deletePhoto(participant.photoToken);
      }
      await this.dataStore.delete(eventKey(event.id));
      const verify = await this.getEventById(event.id, { consistency: 'strong' });
      if (verify) throw new Error('Il record principale esiste ancora dopo la cancellazione.');
      await this.removeCatalogEntry(event.id);
      return {
        event: clone(event),
        backup: {
          key: backup.key,
          backupId: backup.backupId,
          createdAt: backup.createdAt,
          photoCount: backup.photoCount,
          missingPhotoCount: backup.missingPhotoCount,
        },
      };
    } catch (error) {
      try {
        await this.restoreEventFromPurgeBackup(backup.manifest);
      } catch (restoreError) {
        console.error('Ripristino automatico purge non completato:', restoreError);
        throw new HttpError(500, 'Eliminazione interrotta e ripristino automatico non completato. Controlla i log Netlify.', 'PURGE_RESTORE_FAILED');
      }
      throw new HttpError(500, 'Eliminazione annullata: la stanza è stata ripristinata dal backup.', 'PURGE_ROLLED_BACK');
    }
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

  async getPhoto(photoToken, { consistency = 'eventual' } = {}) {
    return this.mediaStore.getWithMetadata(photoToken, {
      type: 'arrayBuffer',
      consistency,
    });
  }

  async deletePhoto(photoToken) {
    if (!photoToken) return;
    await this.mediaStore.delete(photoToken);
  }
}
