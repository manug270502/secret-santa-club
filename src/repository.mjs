import { HttpError, token } from './domain.mjs';

const EVENT_PREFIX = 'event/';
const INDEX_PREFIX = 'index/';

function eventKey(eventId) {
  return `${EVENT_PREFIX}${eventId}`;
}

function indexKey(kind, value) {
  return `${INDEX_PREFIX}${kind}/${value}`;
}

function clone(value) {
  return structuredClone(value);
}

export class SecretSantaRepository {
  constructor({ dataStore, mediaStore }) {
    if (!dataStore || !mediaStore) throw new Error('Data store e media store sono obbligatori.');
    this.dataStore = dataStore;
    this.mediaStore = mediaStore;
  }

  async createEvent(event) {
    const writes = [];
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
    } catch (error) {
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
