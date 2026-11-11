import {
  HttpError,
  assignSingleCycle,
  assertOpaqueToken,
  buildEvent,
  cleanText,
  isAllowedMood,
  isAllowedWallEmoji,
  nextCelebrationDate,
  token,
  validateDate,
} from './domain.mjs';
import { SecretSantaRepository } from './repository.mjs';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(self), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError)) console.error(error);
  return jsonResponse(status, {
    ok: false,
    error: status >= 500 ? 'Errore interno. Riprova tra poco.' : error.message,
  });
}

function normalizeApiPath(pathname) {
  const functionPrefix = '/.netlify/functions/api';
  if (pathname === functionPrefix) return '/';
  if (pathname.startsWith(`${functionPrefix}/`)) {
    return `/api/${pathname.slice(functionPrefix.length + 1)}`.replace(/\/{2,}/g, '/');
  }
  return pathname;
}

function normalizeMediaToken(pathname) {
  const publicPrefix = '/media/';
  const functionPrefix = '/.netlify/functions/media/';
  if (pathname.startsWith(publicPrefix)) return pathname.slice(publicPrefix.length);
  if (pathname.startsWith(functionPrefix)) return pathname.slice(functionPrefix.length);
  return '';
}

function configuredBaseUrl(env) {
  const candidate = cleanText(env.PUBLIC_BASE_URL, 300).replace(/\/$/, '');
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin + parsed.pathname.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

function getBaseUrl(request, env) {
  const configured = configuredBaseUrl(env);
  if (configured) return configured;
  const url = new URL(request.url);
  const forwardedHost = cleanText(request.headers.get('x-forwarded-host'), 300).split(',')[0];
  const forwardedProto = cleanText(request.headers.get('x-forwarded-proto'), 30).split(',')[0];
  const host = forwardedHost || request.headers.get('host') || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '') || 'https';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function eventPaths(event, request, env) {
  const base = getBaseUrl(request, env);
  return {
    adminPath: `/admin/${event.adminToken}`,
    publicPath: `/party/${event.publicToken}`,
    adminUrl: `${base}/admin/${event.adminToken}`,
    publicUrl: `${base}/party/${event.publicToken}`,
  };
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_JSON_BYTES) throw new HttpError(413, 'La richiesta supera il limite consentito.');
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) {
    throw new HttpError(413, 'La richiesta supera il limite consentito.');
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Corpo JSON non valido.');
  }
}

function detectImage(bytes, declaredMime = '') {
  const data = new Uint8Array(bytes);
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg' };
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
    data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: '.png' };
  }
  const ascii = (start, end) => String.fromCharCode(...data.slice(start, end));
  if (data.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { mime: 'image/webp', extension: '.webp' };
  }
  if (data.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return { mime: declaredMime === 'image/heif' ? 'image/heif' : 'image/heic', extension: '.heic' };
    }
  }
  return null;
}

async function parseProfileForm(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 5.8 * 1024 * 1024) {
    throw new HttpError(413, 'La foto è troppo grande. Scegline una più leggera.');
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Dati del profilo non validi.');
  }
  const wish = cleanText(form.get('wish'), 140);
  const rawMood = cleanText(form.get('mood'), 4) || '🎄';
  const mood = isAllowedMood(rawMood) ? rawMood : '🎄';
  const photo = form.get('photo');
  if (!photo || typeof photo === 'string' || photo.size === 0) return { wish, mood, photo: null };
  if (photo.size > MAX_PHOTO_BYTES) {
    throw new HttpError(413, 'La foto supera 4 MB. Il sito prova a comprimerla automaticamente: riprova o scegline un’altra.');
  }
  const bytes = await photo.arrayBuffer();
  const detected = detectImage(bytes, cleanText(photo.type, 80).toLowerCase());
  if (!detected) throw new HttpError(400, 'Formato immagine non supportato. Usa JPG, PNG, WebP o HEIC.');
  return { wish, mood, photo: { bytes, ...detected } };
}

function demoEnabled(env) {
  if (env.ENABLE_DEMO === 'true') return true;
  if (env.ENABLE_DEMO === 'false') return false;
  return env.CONTEXT === 'dev' || env.NETLIFY_DEV === 'true';
}

export function createApiHandler({ dataStore, mediaStore, env = process.env } = {}) {
  const repository = new SecretSantaRepository({ dataStore, mediaStore });

  return async function handleApi(request) {
    try {
      const url = new URL(request.url);
      const pathname = normalizeApiPath(decodeURIComponent(url.pathname));
      const method = request.method.toUpperCase();

      if (method === 'GET' && ['/health', '/api/health'].includes(pathname)) {
        return jsonResponse(200, { ok: true, service: 'secret-santa-club-netlify', storage: 'netlify-blobs' });
      }

      if (method === 'GET' && pathname === '/api/system') {
        return jsonResponse(200, {
          ok: true,
          currentBaseUrl: getBaseUrl(request, env),
          configuredBaseUrl: configuredBaseUrl(env),
          lanUrls: [],
          hosting: 'netlify',
          persistentStorage: true,
          demoEnabled: demoEnabled(env),
        });
      }

      if (method === 'POST' && pathname === '/api/events') {
        const event = buildEvent(await readJson(request));
        await repository.createEvent(event);
        return jsonResponse(201, { ok: true, eventId: event.id, ...eventPaths(event, request, env) });
      }

      if (method === 'POST' && pathname === '/api/demo') {
        if (!demoEnabled(env)) throw new HttpError(404, 'Demo non disponibile.');
        const event = buildEvent({
          name: 'Il Natale degli Elfi',
          organizer: 'Martina',
          date: nextCelebrationDate(),
          location: 'Casa di Babbo Natale',
          participants: ['Martina', 'Luca', 'Giulia', 'Marco', 'Sofia', 'Davide'].map((name) => ({ name })),
        });
        await repository.createEvent(event);
        return jsonResponse(201, { ok: true, eventId: event.id, ...eventPaths(event, request, env) });
      }

      let match = /^\/api\/admin\/([^/]+)\/messages\/([^/]+)$/.exec(pathname);
      if (match && method === 'DELETE') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const messageId = assertOpaqueToken(match[2], 'Messaggio');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const before = event.messages.length;
          event.messages = event.messages.filter((message) => message.id !== messageId);
          return { deleted: before !== event.messages.length };
        });
        if (!outcome) throw new HttpError(404, 'Evento non trovato.');
        return jsonResponse(200, { ok: true, deleted: outcome.result.deleted });
      }

      match = /^\/api\/admin\/([^/]+)\/redraw$/.exec(pathname);
      if (match && method === 'POST') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          if (event.participants.some((participant) => participant.revealedAt)) {
            throw new HttpError(409, 'Il sorteggio non può essere rifatto: almeno una persona ha già scoperto il nome.');
          }
          assignSingleCycle(event.participants);
          return { redrawn: true };
        });
        if (!outcome) throw new HttpError(404, 'Evento non trovato.');
        return jsonResponse(200, { ok: true });
      }

      match = /^\/api\/admin\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const event = await repository.getEventByAdminToken(adminToken);
        if (!event) throw new HttpError(404, 'Evento non trovato.');
        const base = getBaseUrl(request, env);
        return jsonResponse(200, {
          ok: true,
          event: {
            name: event.name,
            organizer: event.organizer,
            date: event.date,
            location: event.location,
            createdAt: event.createdAt,
            ...eventPaths(event, request, env),
            participants: event.participants.map((participant) => ({
              id: participant.id,
              name: participant.name,
              phone: participant.phone,
              path: `/join/${participant.token}`,
              url: `${base}/join/${participant.token}`,
              photoUrl: participant.photoUrl,
              wish: participant.wish,
              mood: participant.mood,
              revealedAt: participant.revealedAt,
              profileComplete: Boolean(participant.photoUrl),
            })),
            messages: event.messages.map((message) => ({ ...message })),
          },
        });
      }

      if (match && method === 'PATCH') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const body = await readJson(request);
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const name = cleanText(body.name, 80);
          const organizer = cleanText(body.organizer, 60);
          if (name) event.name = name;
          if (organizer) event.organizer = organizer;
          event.date = validateDate(body.date) || event.date;
          event.location = cleanText(body.location, 100);
          return { updated: true };
        });
        if (!outcome) throw new HttpError(404, 'Evento non trovato.');
        return jsonResponse(200, { ok: true });
      }

      match = /^\/api\/participant\/([^/]+)\/profile$/.exec(pathname);
      if (match && method === 'POST') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const found = await repository.getParticipantByToken(participantToken);
        if (!found) throw new HttpError(404, 'Invito non valido.');
        const form = await parseProfileForm(request);
        let uploaded = null;
        if (form.photo) {
          uploaded = await repository.savePhoto({
            bytes: form.photo.bytes,
            mime: form.photo.mime,
            extension: form.photo.extension,
            participantId: found.participantId,
            eventId: found.eventId,
          });
        }

        let outcome;
        try {
          outcome = await repository.mutateParticipantByToken(participantToken, ({ participant }) => {
            const oldPhotoToken = participant.photoToken || '';
            if (uploaded) {
              participant.photoToken = uploaded.photoToken;
              participant.photoUrl = uploaded.photoUrl;
            }
            participant.wish = form.wish;
            participant.mood = form.mood;
            participant.profileUpdatedAt = new Date().toISOString();
            return { oldPhotoToken, photoUrl: participant.photoUrl };
          });
          if (!outcome) throw new HttpError(404, 'Invito non valido.');
        } catch (error) {
          if (uploaded) await repository.deletePhoto(uploaded.photoToken).catch(() => {});
          throw error;
        }
        if (uploaded && outcome.result.oldPhotoToken && outcome.result.oldPhotoToken !== uploaded.photoToken) {
          await repository.deletePhoto(outcome.result.oldPhotoToken).catch(() => {});
        }
        return jsonResponse(200, { ok: true, photoUrl: outcome.result.photoUrl });
      }

      match = /^\/api\/participant\/([^/]+)\/reveal$/.exec(pathname);
      if (match && method === 'POST') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const outcome = await repository.mutateParticipantByToken(participantToken, ({ event, participant }) => {
          if (!participant.photoUrl) throw new HttpError(400, 'Aggiungi prima una foto per aprire il pacchetto.');
          if (!participant.revealedAt) participant.revealedAt = new Date().toISOString();
          const target = event.participants.find((item) => item.id === participant.assignedId);
          return { targetName: target?.name || 'Mistero' };
        });
        if (!outcome) throw new HttpError(404, 'Invito non valido.');
        return jsonResponse(200, { ok: true, targetName: outcome.result.targetName });
      }

      match = /^\/api\/participant\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const found = await repository.getParticipantByToken(participantToken);
        if (!found) throw new HttpError(404, 'Invito non valido o scaduto.');
        const target = found.participant.revealedAt
          ? found.event.participants.find((item) => item.id === found.participant.assignedId)
          : null;
        return jsonResponse(200, {
          ok: true,
          event: {
            name: found.event.name,
            organizer: found.event.organizer,
            date: found.event.date,
            location: found.event.location,
            publicPath: `/party/${found.event.publicToken}`,
          },
          participant: {
            name: found.participant.name,
            photoUrl: found.participant.photoUrl,
            wish: found.participant.wish,
            mood: found.participant.mood,
            revealed: Boolean(found.participant.revealedAt),
            revealedAt: found.participant.revealedAt,
            targetName: target?.name || null,
          },
        });
      }

      match = /^\/api\/public\/([^/]+)\/messages$/.exec(pathname);
      if (match && method === 'POST') {
        const publicToken = assertOpaqueToken(match[1], 'Festa');
        const body = await readJson(request);
        const author = cleanText(body.author, 40) || 'Elfo anonimo';
        const message = cleanText(body.message, 180);
        const rawEmoji = cleanText(body.emoji, 4) || '✨';
        const emoji = isAllowedWallEmoji(rawEmoji) ? rawEmoji : '✨';
        if (message.length < 2) throw new HttpError(400, 'Scrivi un messaggio un po’ più lungo.');
        const outcome = await repository.mutateEventByPublicToken(publicToken, (event) => {
          const entry = {
            id: token(8),
            author,
            message,
            emoji,
            createdAt: new Date().toISOString(),
          };
          event.messages.unshift(entry);
          event.messages = event.messages.slice(0, 100);
          return { entry };
        });
        if (!outcome) throw new HttpError(404, 'Festa non trovata.');
        return jsonResponse(201, { ok: true, message: outcome.result.entry });
      }

      match = /^\/api\/public\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const publicToken = assertOpaqueToken(match[1], 'Festa');
        const event = await repository.getEventByPublicToken(publicToken);
        if (!event) throw new HttpError(404, 'Festa non trovata.');
        return jsonResponse(200, {
          ok: true,
          event: {
            name: event.name,
            organizer: event.organizer,
            date: event.date,
            location: event.location,
            participantCount: event.participants.length,
            revealedCount: event.participants.filter((participant) => participant.revealedAt).length,
            participants: event.participants.map((participant) => ({
              id: participant.id,
              name: participant.name,
              photoUrl: participant.photoUrl,
              wish: participant.wish,
              mood: participant.mood,
              revealed: Boolean(participant.revealedAt),
            })),
            messages: [...event.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
          },
        });
      }

      throw new HttpError(404, 'Risorsa non trovata.');
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createMediaHandler({ mediaStore } = {}) {
  if (!mediaStore) throw new Error('Media store obbligatorio.');
  return async function handleMedia(request) {
    try {
      if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
        throw new HttpError(405, 'Metodo non consentito.');
      }
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const photoToken = assertOpaqueToken(normalizeMediaToken(pathname), 'Foto');
      const entry = await mediaStore.getWithMetadata(photoToken, {
        type: 'arrayBuffer',
        consistency: 'strong',
      });
      if (!entry?.data) throw new HttpError(404, 'Foto non trovata.');
      const mime = cleanText(entry.metadata?.mime, 80) || 'application/octet-stream';
      const headers = {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
        'Content-Type': mime,
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      };
      return new Response(request.method.toUpperCase() === 'HEAD' ? null : entry.data, { status: 200, headers });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
