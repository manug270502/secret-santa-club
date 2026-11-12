import crypto from 'node:crypto';
import {
  HttpError,
  assignSingleCycle,
  assertOpaqueToken,
  buildEvent,
  cleanRecoveryCode,
  cleanText,
  isAllowedMood,
  isAllowedWallEmoji,
  nextCelebrationDate,
  normalizeE164,
  normalizeEventPolicies,
  normalizeGiftProfile,
  normalizedInviteState,
  parseBudgetCents,
  token,
  validateAssignments,
  validateDate,
} from './domain.mjs';
import { SecretSantaRepository } from './repository.mjs';
import {
  clearSuperAdminCookie,
  clientAddress,
  createSuperAdminActionToken,
  createSuperAdminSession,
  maskPhone,
  privacyHash,
  requireSuperAdminCsrf,
  superAdminConfiguration,
  superAdminCookie,
  verifySuperAdminActionToken,
  verifySuperAdminPassword,
  verifySuperAdminSession,
} from './super-admin-auth.mjs';

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

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, max-age=5, stale-while-revalidate=5',
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

function textResponse(status, body, contentType, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      ...COMMON_HEADERS,
      'Content-Type': contentType,
      ...extraHeaders,
    },
  });
}

function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (!(error instanceof HttpError)) console.error(error);
  const safeServerCodes = new Set(['PURGE_BACKUP_FAILED', 'PURGE_ROLLED_BACK']);
  const exposeMessage = status !== 500 || (error instanceof HttpError && safeServerCodes.has(error.code));
  return jsonResponse(status, {
    ok: false,
    error: exposeMessage ? error.message : 'Errore interno. Riprova tra poco.',
    ...(error instanceof HttpError && error.code ? { code: error.code } : {}),
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
    data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
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
  let rawInterests = [];
  try { rawInterests = JSON.parse(String(form.get('interests') || '[]')); } catch { rawInterests = []; }
  const giftProfile = normalizeGiftProfile({
    favoriteColor: form.get('favoriteColor'),
    interests: rawInterests,
    giftStyle: form.get('giftStyle'),
    avoid: form.get('avoid'),
  });
  const photo = form.get('photo');
  if (!photo || typeof photo === 'string' || photo.size === 0) return { wish, mood, giftProfile, photo: null };
  if (photo.size > MAX_PHOTO_BYTES) {
    throw new HttpError(413, 'La foto supera 4 MB. Il sito prova a comprimerla automaticamente: riprova o scegline un’altra.');
  }
  const bytes = await photo.arrayBuffer();
  const detected = detectImage(bytes, cleanText(photo.type, 80).toLowerCase());
  if (!detected) throw new HttpError(400, 'Formato immagine non supportato. Usa JPG, PNG, WebP o HEIC.');
  return { wish, mood, giftProfile, photo: { bytes, ...detected } };
}

function demoEnabled(env) {
  if (env.ENABLE_DEMO === 'true') return true;
  if (env.ENABLE_DEMO === 'false') return false;
  return env.CONTEXT === 'dev' || env.NETLIFY_DEV === 'true';
}

function publicGiftProfile(participant) {
  return normalizeGiftProfile(participant?.giftProfile);
}

function recoveryRoomPayload(room) {
  return {
    eventId: room.eventId,
    name: room.name,
    organizer: room.organizer,
    date: room.date || '',
    location: room.location || '',
    budgetCents: Number.isInteger(room.budgetCents) ? room.budgetCents : null,
    participantName: room.participantName,
    profileComplete: Boolean(room.profileComplete),
    revealed: Boolean(room.revealed),
    status: room.status || 'active',
  };
}

function roomState(event) {
  return ['active', 'blocked', 'completed', 'archived', 'trashed'].includes(event?.status)
    ? event.status
    : 'active';
}

function assertSuperAdminEventSnapshot(event, body, { requireUpdatedAt = true } = {}) {
  if (!event) throw new HttpError(404, 'Evento non trovato.');
  const confirmId = cleanText(body?.confirmId, 160);
  const confirmName = cleanText(body?.confirmName, 160);
  const expectedUpdatedAt = cleanText(body?.expectedUpdatedAt, 80);
  if (confirmId !== event.id || confirmName !== event.name) {
    throw new HttpError(409, 'La stanza selezionata non corrisponde più a quella mostrata. Riaprila e riprova.', 'EVENT_SELECTION_MISMATCH');
  }
  if (requireUpdatedAt && (!expectedUpdatedAt || expectedUpdatedAt !== event.updatedAt)) {
    throw new HttpError(409, 'La stanza è stata modificata nel frattempo. Riaprila e riprova.', 'EVENT_CHANGED');
  }
  return expectedUpdatedAt;
}

function roomPolicies(event) {
  return normalizeEventPolicies(event?.policies);
}

function assertRoomReadable(event, { admin = false } = {}) {
  const status = roomState(event);
  if (status === 'trashed') throw new HttpError(404, 'Questa stanza non è disponibile.', 'ROOM_TRASHED');
  if (status === 'archived' && !admin) throw new HttpError(410, 'Questa stanza è stata archiviata.', 'ROOM_ARCHIVED');
  if (status === 'blocked' && !admin) {
    throw new HttpError(423, event.statusReason || 'Questa stanza è stata temporaneamente congelata dal Grande Elfo.', 'ROOM_BLOCKED');
  }
}

function assertRoomWritable(event, action = 'modificare la stanza') {
  const status = roomState(event);
  if (status === 'blocked') throw new HttpError(423, event.statusReason || 'Questa stanza è temporaneamente congelata.', 'ROOM_BLOCKED');
  if (status === 'completed') throw new HttpError(423, `La stanza è conclusa e non puoi ${action}.`, 'ROOM_READ_ONLY');
  if (status === 'archived') throw new HttpError(410, 'La stanza è archiviata e disponibile solo al super-admin.', 'ROOM_ARCHIVED');
  if (status === 'trashed') throw new HttpError(404, 'Questa stanza non è disponibile.', 'ROOM_TRASHED');
}

function assertSiteOperational(settings, action = 'use') {
  if (settings.maintenanceMode) {
    throw new HttpError(503, settings.maintenanceMessage || 'Il laboratorio degli elfi è in manutenzione.', 'MAINTENANCE');
  }
  if (action === 'create' && !settings.allowEventCreation) {
    throw new HttpError(503, 'La creazione di nuove feste è temporaneamente sospesa.', 'CREATION_DISABLED');
  }
  if (action === 'recovery' && !settings.allowRecovery) {
    throw new HttpError(503, 'Il recupero degli inviti è temporaneamente sospeso.', 'RECOVERY_DISABLED');
  }
  if (action === 'photo' && !settings.allowPhotoUploads) {
    throw new HttpError(503, 'Il caricamento delle foto è temporaneamente sospeso.', 'PHOTO_UPLOADS_DISABLED');
  }
  if (action === 'message' && !settings.allowWallMessages) {
    throw new HttpError(503, 'Il muro degli auguri è temporaneamente in pausa.', 'MESSAGES_DISABLED');
  }
}

function secureEqualText(left, right) {
  const first = Buffer.from(String(left || ''));
  const second = Buffer.from(String(right || ''));
  return first.length > 0 && first.length === second.length && crypto.timingSafeEqual(first, second);
}

function adminEventPayload(event, request, env) {
  const base = getBaseUrl(request, env);
  return {
    name: event.name,
    organizer: event.organizer,
    organizerParticipates: Boolean(event.organizerParticipates),
    date: event.date,
    location: event.location,
    budgetCents: Number.isInteger(event.budgetCents) ? event.budgetCents : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    status: roomState(event),
    statusReason: event.statusReason || '',
    policies: roomPolicies(event),
    readOnly: roomState(event) !== 'active',
    ...eventPaths(event, request, env),
    participants: event.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      phone: participant.phone,
      recoveryCode: cleanRecoveryCode(participant.recoveryCode),
      isOrganizer: Boolean(participant.isOrganizer),
      giftProfile: publicGiftProfile(participant),
      invite: normalizedInviteState(participant.invite),
      path: `/join/${participant.token}`,
      url: `${base}/join/${participant.token}`,
      photoUrl: participant.photoUrl,
      wish: participant.wish,
      mood: participant.mood,
      revealedAt: participant.revealedAt,
      profileComplete: Boolean(participant.photoUrl),
    })),
    messages: event.messages.map((message) => ({ ...message })),
  };
}

function superAdminEventPayload(event, request, env) {
  const base = getBaseUrl(request, env);
  const participantById = new Map(event.participants.map((participant) => [participant.id, participant]));
  return {
    id: event.id,
    schemaVersion: event.schemaVersion,
    name: event.name,
    organizer: event.organizer,
    organizerParticipates: Boolean(event.organizerParticipates),
    organizerParticipantId: event.organizerParticipantId || '',
    date: event.date || '',
    location: event.location || '',
    budgetCents: Number.isInteger(event.budgetCents) ? event.budgetCents : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    status: roomState(event),
    statusReason: event.statusReason || '',
    statusUpdatedAt: event.statusUpdatedAt || '',
    previousStatus: event.previousStatus || '',
    trashedAt: event.trashedAt || null,
    purgeAfter: event.purgeAfter || null,
    policies: roomPolicies(event),
    adminToken: event.adminToken,
    publicToken: event.publicToken,
    ...eventPaths(event, request, env),
    participants: event.participants.map((participant) => {
      const assigned = participantById.get(participant.assignedId);
      return {
        id: participant.id,
        name: participant.name,
        phone: participant.phone,
        maskedPhone: maskPhone(participant.phone),
        isOrganizer: Boolean(participant.isOrganizer),
        token: participant.token,
        path: `/join/${participant.token}`,
        url: `${base}/join/${participant.token}`,
        recoveryCode: cleanRecoveryCode(participant.recoveryCode),
        assignedId: participant.assignedId,
        assignedName: assigned?.name || '',
        photoUrl: participant.photoUrl,
        photoToken: participant.photoToken || '',
        wish: participant.wish || '',
        mood: participant.mood || '🎄',
        giftProfile: publicGiftProfile(participant),
        revealedAt: participant.revealedAt || null,
        profileUpdatedAt: participant.profileUpdatedAt || null,
        invite: normalizedInviteState(participant.invite),
      };
    }),
    messages: [...event.messages].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    assignmentHealth: validateAssignments(event),
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function eventCsv(event) {
  const byId = new Map(event.participants.map((participant) => [participant.id, participant]));
  const rows = [
    ['Evento', event.name],
    ['Organizzatore', event.organizer],
    ['Data', event.date || ''],
    ['Luogo', event.location || ''],
    ['Budget centesimi', Number.isInteger(event.budgetCents) ? event.budgetCents : ''],
    ['Stato', roomState(event)],
    [],
    ['Nome', 'Telefono', 'Admin', 'Codice elfo', 'Link token', 'Assegnato a', 'Foto', 'Rivelato il', 'Indizio', 'Colore', 'Passioni', 'Stile regalo', 'Da evitare'],
    ...event.participants.map((participant) => {
      const profile = publicGiftProfile(participant);
      return [
        participant.name,
        participant.phone,
        participant.isOrganizer ? 'Sì' : 'No',
        cleanRecoveryCode(participant.recoveryCode),
        participant.token,
        byId.get(participant.assignedId)?.name || '',
        participant.photoUrl || '',
        participant.revealedAt || '',
        participant.wish || '',
        profile.favoriteColor,
        profile.interests.join(' | '),
        profile.giftStyle,
        profile.avoid,
      ];
    }),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function publicSummary(summary) {
  const { searchText: _searchText, ...safe } = summary;
  return safe;
}

export function createApiHandler({
  dataStore,
  mediaStore,
  env = process.env,
} = {}) {
  const repository = new SecretSantaRepository({ dataStore, mediaStore });

  return async function handleApi(request) {
    try {
      const url = new URL(request.url);
      const pathname = normalizeApiPath(decodeURIComponent(url.pathname));
      const method = request.method.toUpperCase();

      if (method === 'GET' && ['/health', '/api/health'].includes(pathname)) {
        return jsonResponse(200, {
          ok: true,
          service: 'secret-santa-club-netlify-v6.2.0',
          storage: 'netlify-blobs',
          superAdminConfigured: superAdminConfiguration(env).configured,
        });
      }

      if (method === 'GET' && pathname === '/api/system') {
        const settings = await repository.getSystemSettings();
        return jsonResponse(200, {
          ok: true,
          currentBaseUrl: getBaseUrl(request, env),
          configuredBaseUrl: configuredBaseUrl(env),
          lanUrls: [],
          hosting: 'netlify',
          persistentStorage: true,
          demoEnabled: demoEnabled(env),
          maintenanceMode: settings.maintenanceMode,
          maintenanceMessage: settings.maintenanceMessage,
          eventCreationEnabled: settings.allowEventCreation,
          recoveryEnabled: settings.allowRecovery,
          whatsappSharing: {
            mode: 'click-to-chat',
            automatic: false,
            finalConfirmationRequired: true,
          },
        });
      }

      if (method === 'POST' && pathname === '/api/super-admin/login') {
        const config = superAdminConfiguration(env);
        if (!config.configured) {
          throw new HttpError(503, 'Configura prima le variabili SUPERADMIN_* su Netlify.', 'SUPERADMIN_NOT_CONFIGURED');
        }
        const body = await readJson(request);
        const addressHash = privacyHash(clientAddress(request), config.sessionSecret);
        const throttle = await repository.getLoginThrottle(addressHash);
        if (throttle.lockedUntil && new Date(throttle.lockedUntil).getTime() > Date.now()) {
          throw new HttpError(429, 'Troppi tentativi. Riprova tra circa 15 minuti.', 'SUPERADMIN_RATE_LIMIT');
        }
        const username = cleanText(body.username, 80);
        const valid = secureEqualText(username, config.username)
          && verifySuperAdminPassword(String(body.password || ''), config.passwordHash);
        if (!valid) {
          await repository.recordLoginFailure(addressHash);
          await repository.appendAudit({
            action: 'login_failed',
            actor: username || 'sconosciuto',
            detail: `Tentativo non riuscito da impronta ${addressHash.slice(0, 8)}.`,
            outcome: 'failed',
          }).catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 220));
          throw new HttpError(401, 'Username o password non corretti.', 'SUPERADMIN_UNAUTHORIZED');
        }
        await repository.clearLoginThrottle(addressHash);
        const session = createSuperAdminSession(config.username, env);
        await repository.appendAudit({
          action: 'login_success',
          actor: config.username,
          detail: 'Accesso al Control Center.',
        }).catch(() => {});
        return jsonResponse(200, {
          ok: true,
          username: config.username,
          csrfToken: session.payload.csrf,
          expiresAt: new Date(session.payload.exp * 1000).toISOString(),
        }, { 'Set-Cookie': superAdminCookie(session.value, request, session.maxAge) });
      }

      if (method === 'GET' && pathname === '/api/super-admin/session') {
        const session = verifySuperAdminSession(request, env);
        return jsonResponse(200, {
          ok: true,
          username: session.sub,
          csrfToken: session.csrf,
          expiresAt: new Date(session.exp * 1000).toISOString(),
        });
      }

      if (method === 'POST' && pathname === '/api/super-admin/logout') {
        let session = null;
        try { session = verifySuperAdminSession(request, env); } catch { session = null; }
        if (session) {
          requireSuperAdminCsrf(request, session);
          await repository.appendAudit({ action: 'logout', actor: session.sub, detail: 'Disconnessione dal Control Center.' }).catch(() => {});
        }
        return jsonResponse(200, { ok: true }, { 'Set-Cookie': clearSuperAdminCookie(request) });
      }

      if (pathname.startsWith('/api/super-admin/')) {
        const session = verifySuperAdminSession(request, env);
        if (!['GET', 'HEAD'].includes(method)) requireSuperAdminCsrf(request, session);

        if (method === 'GET' && pathname === '/api/super-admin/overview') {
          const refresh = url.searchParams.get('refresh') === 'true';
          const query = cleanText(url.searchParams.get('q'), 120).toLocaleLowerCase('it-IT');
          const status = cleanText(url.searchParams.get('status'), 30).toLowerCase();
          const [summaries, settings, audit] = await Promise.all([
            repository.listEventSummaries({ refresh }),
            repository.getSystemSettings({ consistency: 'strong', useCache: false }),
            repository.listAudit({ limit: 40 }),
          ]);
          const filtered = summaries
            .filter((summary) => !status || status === 'all' || summary.status === status)
            .filter((summary) => !query || String(summary.searchText || '').includes(query))
            .sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)));
          const activeRooms = summaries.filter((summary) => summary.status === 'active');
          const visibleRooms = summaries.filter((summary) => summary.status !== 'trashed');
          return jsonResponse(200, {
            ok: true,
            user: session.sub,
            settings,
            metrics: {
              roomsTotal: visibleRooms.length,
              roomsActive: activeRooms.length,
              roomsBlocked: summaries.filter((summary) => summary.status === 'blocked').length,
              roomsCompleted: summaries.filter((summary) => summary.status === 'completed').length,
              roomsArchived: summaries.filter((summary) => summary.status === 'archived').length,
              roomsTrashed: summaries.filter((summary) => summary.status === 'trashed').length,
              participants: visibleRooms.reduce((sum, summary) => sum + summary.participantCount, 0),
              photos: visibleRooms.reduce((sum, summary) => sum + summary.photoCount, 0),
              profiles: visibleRooms.reduce((sum, summary) => sum + summary.profileCount, 0),
              reveals: visibleRooms.reduce((sum, summary) => sum + summary.revealedCount, 0),
              messages: visibleRooms.reduce((sum, summary) => sum + summary.messageCount, 0),
            },
            rooms: filtered.map(publicSummary),
            audit,
          });
        }

        if (method === 'GET' && pathname === '/api/super-admin/audit') {
          return jsonResponse(200, { ok: true, audit: await repository.listAudit({ limit: url.searchParams.get('limit') }) });
        }

        if (method === 'PATCH' && pathname === '/api/super-admin/settings') {
          const body = await readJson(request);
          const settings = await repository.updateSystemSettings(body);
          await repository.appendAudit({
            action: 'system_settings_updated',
            actor: session.sub,
            detail: 'Aggiornati gli interruttori globali del sito.',
          });
          return jsonResponse(200, { ok: true, settings });
        }

        let match = /^\/api\/super-admin\/events\/([^/]+)\/export$/.exec(pathname);
        if (match && method === 'GET') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const event = await repository.ensureEventReady(eventId);
          if (!event) throw new HttpError(404, 'Evento non trovato.');
          const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
          await repository.appendAudit({
            action: 'event_exported',
            actor: session.sub,
            eventId: event.id,
            eventName: event.name,
            detail: `Esportazione ${format.toUpperCase()}.`,
          }).catch(() => {});
          const safeName = cleanText(event.name, 60).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'secret-santa';
          if (format === 'csv') {
            return textResponse(200, `\uFEFF${eventCsv(event)}`, 'text/csv; charset=utf-8', {
              'Content-Disposition': `attachment; filename="${safeName}.csv"`,
            });
          }
          return textResponse(200, JSON.stringify(event, null, 2), 'application/json; charset=utf-8', {
            'Content-Disposition': `attachment; filename="${safeName}.json"`,
          });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/status$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const status = cleanText(body.status, 30).toLowerCase();
          const reason = cleanText(body.reason, 180);
          const current = await repository.getEventById(eventId, { consistency: 'strong' });
          const expectedUpdatedAt = assertSuperAdminEventSnapshot(current, body);
          const outcome = await repository.setEventStatus(eventId, status, reason, { expectedUpdatedAt });
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: `event_status_${status}`,
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: reason || `Stato impostato su ${status}.`,
          });
          return jsonResponse(200, { ok: true, event: superAdminEventPayload(outcome.event, request, env) });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/restore$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const current = await repository.getEventById(eventId, { consistency: 'strong' });
          const expectedUpdatedAt = assertSuperAdminEventSnapshot(current, body);
          const outcome = await repository.restoreEvent(eventId, { expectedUpdatedAt });
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'event_restored',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Stanza ripristinata come ${outcome.event.status}.`,
          });
          return jsonResponse(200, { ok: true, event: superAdminEventPayload(outcome.event, request, env) });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/duplicate$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const duplicate = await repository.duplicateEvent(eventId);
          if (!duplicate) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'event_duplicated',
            actor: session.sub,
            eventId: duplicate.id,
            eventName: duplicate.name,
            detail: `Creata dalla stanza ${eventId}.`,
          });
          return jsonResponse(201, {
            ok: true,
            eventId: duplicate.id,
            ...eventPaths(duplicate, request, env),
          });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/repair$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const result = await repository.repairEvent(eventId);
          if (!result) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'event_repaired',
            actor: session.sub,
            eventId,
            eventName: result.event.name,
            detail: result.repairedAssignments ? 'Indici e sorteggio riparati.' : 'Indici verificati e riallineati.',
          });
          return jsonResponse(200, {
            ok: true,
            repairedAssignments: result.repairedAssignments,
            assignmentHealth: result.validation,
            event: superAdminEventPayload(result.event, request, env),
          });
        }

        match = /^\/api\/super-admin\/orphans\/([^/]+)$/.exec(pathname);
        if (match && method === 'GET') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const orphan = await repository.getOrphanCatalogEntry(eventId);
          if (orphan.eventPresent) throw new HttpError(409, 'La stanza esiste ancora e non è una voce orfana.', 'EVENT_NOT_ORPHANED');
          if (!orphan.catalog) throw new HttpError(404, 'Voce orfana non trovata.');
          return jsonResponse(200, { ok: true, orphan });
        }
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          if (cleanText(body.confirmId, 160) !== eventId) {
            throw new HttpError(409, 'La voce selezionata non corrisponde più a quella mostrata.', 'EVENT_SELECTION_MISMATCH');
          }
          const result = await repository.removeOrphanCatalogEntry(eventId, cleanText(body.confirmName, 160));
          if (!result.entry) throw new HttpError(404, 'Voce orfana non trovata.');
          await repository.appendAudit({
            action: 'orphan_catalog_removed',
            actor: session.sub,
            eventId,
            eventName: result.entry.name,
            detail: 'Rimossa soltanto la voce orfana dal catalogo; nessun evento esistente è stato cancellato.',
          }).catch(() => {});
          return jsonResponse(200, { ok: true, removed: result.removed });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/purge-preview$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const event = await repository.getEventById(eventId, { consistency: 'strong' });
          assertSuperAdminEventSnapshot(event, body);
          if (roomState(event) !== 'trashed') throw new HttpError(409, 'Sposta prima la stanza nel cestino.');
          const phrase = `ELIMINA ${event.id}`;
          const confirmationToken = createSuperAdminActionToken('purge-event', {
            eventId: event.id,
            eventName: event.name,
            updatedAt: event.updatedAt,
          }, session, env, 300);
          return jsonResponse(200, {
            ok: true,
            confirmationToken,
            phrase,
            event: {
              id: event.id,
              name: event.name,
              updatedAt: event.updatedAt,
              participantCount: event.participants.length,
              photoCount: event.participants.filter((participant) => participant.photoToken).length,
            },
          });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/purge$/.exec(pathname);
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const event = await repository.getEventById(eventId, { consistency: 'strong' });
          if (!event) throw new HttpError(404, 'Evento non trovato.');
          if (roomState(event) !== 'trashed') throw new HttpError(409, 'Sposta prima la stanza nel cestino.');
          const confirmation = verifySuperAdminActionToken(body.confirmationToken, 'purge-event', session, env);
          const expectedPhrase = `ELIMINA ${event.id}`;
          if (
            confirmation.eventId !== event.id
            || confirmation.eventName !== event.name
            || confirmation.updatedAt !== event.updatedAt
            || cleanText(body.confirmPhrase, 240) !== expectedPhrase
          ) {
            throw new HttpError(400, `Conferma non valida. Digita esattamente: ${expectedPhrase}`);
          }
          const deleted = await repository.purgeEvent(eventId, { expectedUpdatedAt: confirmation.updatedAt });
          await repository.appendAudit({
            action: 'event_purged',
            actor: session.sub,
            eventId,
            eventName: deleted.event.name,
            detail: `Eliminazione definitiva dopo backup ${deleted.backup.key}; ${deleted.backup.photoCount} foto copiate.`,
          }).catch(() => {});
          return jsonResponse(200, { ok: true, backup: deleted.backup });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/participants\/([^/]+)\/recovery-code$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const participantId = assertOpaqueToken(match[2], 'Partecipante');
          const outcome = await repository.regenerateRecoveryCode(eventId, participantId);
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'participant_recovery_regenerated',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Nuovo codice per ${outcome.result.participantName}.`,
          });
          return jsonResponse(200, { ok: true, recoveryCode: outcome.result.recoveryCode });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/participants\/([^/]+)\/link$/.exec(pathname);
        if (match && method === 'POST') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const participantId = assertOpaqueToken(match[2], 'Partecipante');
          const outcome = await repository.regenerateParticipantToken(eventId, participantId);
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'participant_link_regenerated',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Nuovo link per ${outcome.result.participantName}.`,
          });
          return jsonResponse(200, {
            ok: true,
            token: outcome.result.token,
            path: `/join/${outcome.result.token}`,
            url: `${getBaseUrl(request, env)}/join/${outcome.result.token}`,
          });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/participants\/([^/]+)\/photo$/.exec(pathname);
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const participantId = assertOpaqueToken(match[2], 'Partecipante');
          const outcome = await repository.removeParticipantPhoto(eventId, participantId);
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'participant_photo_removed',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Foto rimossa per ${outcome.result.participantName}.`,
          });
          return jsonResponse(200, { ok: true });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/participants\/([^/]+)$/.exec(pathname);
        if (match && method === 'PATCH') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const participantId = assertOpaqueToken(match[2], 'Partecipante');
          const body = await readJson(request);
          const outcome = await repository.updateParticipant(eventId, participantId, body);
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'participant_updated',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Aggiornato ${outcome.result.participantName}.`,
          });
          return jsonResponse(200, { ok: true, participant: outcome.result });
        }
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const participantId = assertOpaqueToken(match[2], 'Partecipante');
          const outcome = await repository.deleteParticipant(eventId, participantId);
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'participant_deleted',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: `Rimosso ${outcome.result.participantName} e rifatto il sorteggio.`,
          });
          return jsonResponse(200, { ok: true });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)\/messages\/([^/]+)$/.exec(pathname);
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const messageId = assertOpaqueToken(match[2], 'Messaggio');
          const outcome = await repository.mutateEvent(eventId, (event) => {
            const before = event.messages.length;
            event.messages = event.messages.filter((message) => message.id !== messageId);
            return { deleted: before !== event.messages.length };
          });
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'message_deleted',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: outcome.result.deleted ? 'Messaggio rimosso.' : 'Messaggio già assente.',
          });
          return jsonResponse(200, { ok: true, deleted: outcome.result.deleted });
        }

        match = /^\/api\/super-admin\/events\/([^/]+)$/.exec(pathname);
        if (match && method === 'GET') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const event = await repository.ensureEventReady(eventId);
          if (!event) throw new HttpError(404, 'Evento non trovato.');
          return jsonResponse(200, { ok: true, event: superAdminEventPayload(event, request, env) });
        }
        if (match && method === 'PATCH') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const outcome = await repository.mutateEvent(eventId, (event) => {
            const name = cleanText(body.name, 80);
            const organizer = cleanText(body.organizer, 60);
            if (Object.hasOwn(body, 'name')) {
              if (name.length < 2) throw new HttpError(400, 'Inserisci un nome valido per la stanza.');
              event.name = name;
            }
            if (Object.hasOwn(body, 'organizer')) {
              if (organizer.length < 2) throw new HttpError(400, 'Inserisci un nome valido per l’organizzatore.');
              event.organizer = organizer;
              const organizerParticipant = event.participants.find((participant) => participant.isOrganizer);
              if (organizerParticipant) organizerParticipant.name = organizer;
            }
            if (Object.hasOwn(body, 'date')) event.date = validateDate(body.date);
            if (Object.hasOwn(body, 'location')) event.location = cleanText(body.location, 100);
            if (Object.hasOwn(body, 'budget')) event.budgetCents = parseBudgetCents(body.budget);
            if (body.policies && typeof body.policies === 'object') {
              event.policies = normalizeEventPolicies({ ...event.policies, ...body.policies });
            }
            return { updated: true };
          }, { syncRecovery: true });
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'event_updated',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: 'Aggiornati dettagli o permessi della stanza.',
          });
          return jsonResponse(200, { ok: true, event: superAdminEventPayload(outcome.event, request, env) });
        }
        if (match && method === 'DELETE') {
          const eventId = assertOpaqueToken(match[1], 'Evento');
          const body = await readJson(request);
          const current = await repository.getEventById(eventId, { consistency: 'strong' });
          const expectedUpdatedAt = assertSuperAdminEventSnapshot(current, body);
          const outcome = await repository.setEventStatus(eventId, 'trashed', cleanText(body.reason, 180), { expectedUpdatedAt });
          if (!outcome) throw new HttpError(404, 'Evento non trovato.');
          await repository.appendAudit({
            action: 'event_trashed',
            actor: session.sub,
            eventId,
            eventName: outcome.event.name,
            detail: body.reason || 'Spostata nel cestino per 30 giorni.',
          });
          return jsonResponse(200, { ok: true, event: superAdminEventPayload(outcome.event, request, env) });
        }

        throw new HttpError(404, 'Risorsa super-admin non trovata.');
      }

      if (/^\/api\/(admin|participant|public)\//.test(pathname)) {
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings);
      }

      if (method === 'POST' && pathname === '/api/events') {
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings, 'create');
        const event = buildEvent(await readJson(request));
        await repository.createEvent(event);
        return jsonResponse(201, { ok: true, eventId: event.id, ...eventPaths(event, request, env) });
      }

      if (method === 'POST' && pathname === '/api/recovery/lookup') {
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings, 'recovery');
        const body = await readJson(request);
        const phone = normalizeE164(body.phone);
        if (!phone) throw new HttpError(400, 'Inserisci un numero di telefono valido con prefisso internazionale.');
        const rooms = await repository.findRecoveryRoomSummariesByPhone(phone);
        return jsonResponse(200, {
          ok: true,
          rooms: rooms
            .map(recoveryRoomPayload)
            .sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))),
        });
      }

      if (method === 'POST' && pathname === '/api/recovery/unlock') {
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings, 'recovery');
        const body = await readJson(request);
        const phone = normalizeE164(body.phone);
        const eventId = assertOpaqueToken(body.eventId, 'Festa');
        const code = cleanRecoveryCode(body.recoveryCode);
        if (!phone || code.length < 8) {
          await new Promise((resolve) => setTimeout(resolve, 180));
          throw new HttpError(403, 'Numero o codice elfo non corretti.');
        }
        const found = await repository.getRecoveryAccess({ phone, eventId, code });
        if (!found) {
          await new Promise((resolve) => setTimeout(resolve, 180));
          throw new HttpError(403, 'Numero o codice elfo non corretti.');
        }
        assertRoomReadable(found.event);
        if (!roomPolicies(found.event).allowRecovery) throw new HttpError(423, 'Il recupero è disattivato per questa stanza.');
        const target = found.participant.revealedAt
          ? found.event.participants.find((item) => item.id === found.participant.assignedId)
          : null;
        return jsonResponse(200, {
          ok: true,
          room: {
            ...recoveryRoomPayload({
              ...found.event,
              eventId: found.event.id,
              participantId: found.participant.id,
              participantName: found.participant.name,
              profileComplete: Boolean(found.participant.photoUrl),
              revealed: Boolean(found.participant.revealedAt),
            }),
            publicPath: `/party/${found.event.publicToken}`,
            participantPath: `/join/${found.participant.token}`,
            targetName: target?.name || null,
            targetProfile: target ? {
              name: target.name,
              photoUrl: target.photoUrl,
              wish: target.wish,
              mood: target.mood,
              giftProfile: publicGiftProfile(target),
            } : null,
          },
        });
      }

      if (method === 'POST' && pathname === '/api/demo') {
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings, 'create');
        if (!demoEnabled(env)) throw new HttpError(404, 'Demo non disponibile.');
        const event = buildEvent({
          name: 'Il Natale degli Elfi',
          organizerParticipates: true,
          organizerName: 'Martina',
          organizerPhone: '',
          date: nextCelebrationDate(),
          location: 'Casa di Babbo Natale',
          participants: ['Luca', 'Giulia', 'Marco', 'Sofia', 'Davide'].map((name) => ({ name })),
        });
        await repository.createEvent(event);
        return jsonResponse(201, { ok: true, eventId: event.id, ...eventPaths(event, request, env) });
      }

      let match = /^\/api\/admin\/([^/]+)\/messages\/([^/]+)$/.exec(pathname);
      if (match && method === 'DELETE') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const messageId = assertOpaqueToken(match[2], 'Messaggio');
        const current = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!current) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(current, 'eliminare messaggi');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const before = event.messages.length;
          event.messages = event.messages.filter((message) => message.id !== messageId);
          return { deleted: before !== event.messages.length };
        });
        return jsonResponse(200, { ok: true, deleted: outcome.result.deleted });
      }

      match = /^\/api\/admin\/([^/]+)\/participants\/([^/]+)$/.exec(pathname);
      if (match && method === 'PATCH') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const participantId = assertOpaqueToken(match[2], 'Partecipante');
        const body = await readJson(request);
        const phone = normalizeE164(body.phone);
        if (!phone) throw new HttpError(400, 'Inserisci un numero WhatsApp valido con prefisso internazionale.');
        const currentEvent = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!currentEvent) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(currentEvent, 'modificare i partecipanti');
        const currentParticipant = currentEvent.participants.find((item) => item.id === participantId);
        if (!currentParticipant) throw new HttpError(404, 'Partecipante non trovato.');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const participant = event.participants.find((item) => item.id === participantId);
          if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
          const changed = normalizeE164(participant.phone) !== phone;
          participant.phone = phone;
          if (changed) participant.invite = normalizedInviteState();
          return { phone: participant.phone, invite: normalizedInviteState(participant.invite) };
        }, { syncRecovery: true });
        return jsonResponse(200, { ok: true, ...outcome.result });
      }

      match = /^\/api\/admin\/([^/]+)\/invites\/([^/]+)\/opened$/.exec(pathname);
      if (match && method === 'POST') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const participantId = assertOpaqueToken(match[2], 'Partecipante');
        const current = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!current) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(current, 'aggiornare gli inviti');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const participant = event.participants.find((item) => item.id === participantId);
          if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
          if (!normalizeE164(participant.phone)) {
            throw new HttpError(400, `Manca un numero WhatsApp valido per ${participant.name}.`);
          }
          const previous = normalizedInviteState(participant.invite);
          const now = new Date().toISOString();
          participant.invite = {
            status: 'opened',
            openedAt: previous.openedAt || now,
            updatedAt: now,
            openCount: previous.openCount + 1,
          };
          return { invite: participant.invite };
        });
        return jsonResponse(200, { ok: true, invite: normalizedInviteState(outcome.result.invite) });
      }

      match = /^\/api\/admin\/([^/]+)\/invites\/([^/]+)\/reset$/.exec(pathname);
      if (match && method === 'POST') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const participantId = assertOpaqueToken(match[2], 'Partecipante');
        const current = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!current) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(current, 'aggiornare gli inviti');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const participant = event.participants.find((item) => item.id === participantId);
          if (!participant) throw new HttpError(404, 'Partecipante non trovato.');
          participant.invite = normalizedInviteState();
          return { invite: participant.invite };
        });
        return jsonResponse(200, { ok: true, invite: normalizedInviteState(outcome.result.invite) });
      }

      match = /^\/api\/admin\/([^/]+)\/redraw$/.exec(pathname);
      if (match && method === 'POST') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const current = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!current) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(current, 'rifare il sorteggio');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          if (event.participants.some((participant) => participant.revealedAt)) {
            throw new HttpError(409, 'Il sorteggio non può essere rifatto: almeno una persona ha già scoperto il nome.');
          }
          assignSingleCycle(event.participants);
          return { redrawn: true };
        });
        return jsonResponse(200, { ok: true, assignmentHealth: validateAssignments(outcome.event) });
      }

      match = /^\/api\/admin\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const event = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!event) throw new HttpError(404, 'Evento non trovato.');
        assertRoomReadable(event, { admin: true });
        return jsonResponse(200, { ok: true, event: adminEventPayload(event, request, env) });
      }

      if (match && method === 'PATCH') {
        const adminToken = assertOpaqueToken(match[1], 'Link admin');
        const body = await readJson(request);
        const current = await repository.ensureEventRecoveryByAdminToken(adminToken);
        if (!current) throw new HttpError(404, 'Evento non trovato.');
        assertRoomWritable(current, 'modificare i dettagli');
        const outcome = await repository.mutateEventByAdminToken(adminToken, (event) => {
          const name = cleanText(body.name, 80);
          const organizer = cleanText(body.organizer, 60);
          if (name) event.name = name;
          if (organizer) {
            const organizerParticipant = event.participants.find((participant) => participant.isOrganizer);
            if (organizerParticipant) {
              const duplicate = event.participants.some((participant) => (
                participant.id !== organizerParticipant.id
                && participant.name.toLocaleLowerCase('it-IT') === organizer.toLocaleLowerCase('it-IT')
              ));
              if (duplicate) throw new HttpError(400, `Il nome “${organizer}” è già usato da un partecipante.`);
              organizerParticipant.name = organizer;
            }
            event.organizer = organizer;
          }
          event.date = validateDate(body.date) || event.date;
          event.location = cleanText(body.location, 100);
          if (Object.hasOwn(body, 'budget')) event.budgetCents = parseBudgetCents(body.budget);
          return { updated: true };
        }, { syncRecovery: true });
        return jsonResponse(200, { ok: true, event: adminEventPayload(outcome.event, request, env) });
      }

      match = /^\/api\/participant\/([^/]+)\/profile$/.exec(pathname);
      if (match && method === 'POST') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings);
        await repository.ensureEventRecoveryByParticipantToken(participantToken);
        const found = await repository.getParticipantByToken(participantToken);
        if (!found) throw new HttpError(404, 'Invito non valido.');
        assertRoomReadable(found.event);
        assertRoomWritable(found.event, 'modificare il profilo');
        const policies = roomPolicies(found.event);
        if (!policies.allowParticipantEdits) throw new HttpError(423, 'Le modifiche ai profili sono disattivate per questa stanza.');
        const form = await parseProfileForm(request);
        if (form.photo) assertSiteOperational(settings, 'photo');
        if (form.photo && !policies.allowPhotoUploads) throw new HttpError(423, 'Il caricamento delle foto è disattivato per questa stanza.');
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
            participant.giftProfile = form.giftProfile;
            participant.profileUpdatedAt = new Date().toISOString();
            return { oldPhotoToken, photoUrl: participant.photoUrl, giftProfile: participant.giftProfile };
          }, { syncRecovery: true });
          if (!outcome) throw new HttpError(404, 'Invito non valido.');
        } catch (error) {
          if (uploaded) await repository.deletePhoto(uploaded.photoToken).catch(() => {});
          throw error;
        }
        if (uploaded && outcome.result.oldPhotoToken && outcome.result.oldPhotoToken !== uploaded.photoToken) {
          await repository.deletePhoto(outcome.result.oldPhotoToken).catch(() => {});
        }
        return jsonResponse(200, { ok: true, photoUrl: outcome.result.photoUrl, giftProfile: outcome.result.giftProfile });
      }

      match = /^\/api\/participant\/([^/]+)\/reveal$/.exec(pathname);
      if (match && method === 'POST') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings);
        await repository.ensureEventRecoveryByParticipantToken(participantToken);
        const found = await repository.getParticipantByToken(participantToken);
        if (!found) throw new HttpError(404, 'Invito non valido.');
        assertRoomReadable(found.event);
        assertRoomWritable(found.event, 'aprire il pacchetto');
        if (!roomPolicies(found.event).allowReveal) throw new HttpError(423, 'La rivelazione è temporaneamente disattivata per questa stanza.');
        const outcome = await repository.mutateParticipantByToken(participantToken, ({ event, participant }) => {
          if (!participant.photoUrl) throw new HttpError(400, 'Aggiungi prima una foto per aprire il pacchetto.');
          if (!participant.revealedAt) participant.revealedAt = new Date().toISOString();
          const target = event.participants.find((item) => item.id === participant.assignedId);
          return {
            targetName: target?.name || 'Mistero',
            targetProfile: target ? {
              name: target.name,
              photoUrl: target.photoUrl,
              wish: target.wish,
              mood: target.mood,
              giftProfile: publicGiftProfile(target),
            } : null,
          };
        }, { syncRecovery: true });
        return jsonResponse(200, { ok: true, targetName: outcome.result.targetName, targetProfile: outcome.result.targetProfile });
      }

      match = /^\/api\/participant\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const participantToken = assertOpaqueToken(match[1], 'Invito');
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings);
        await repository.ensureEventRecoveryByParticipantToken(participantToken);
        const found = await repository.getParticipantByToken(participantToken);
        if (!found) throw new HttpError(404, 'Invito non valido o scaduto.');
        assertRoomReadable(found.event);
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
            budgetCents: Number.isInteger(found.event.budgetCents) ? found.event.budgetCents : null,
            publicPath: `/party/${found.event.publicToken}`,
            status: roomState(found.event),
            readOnly: roomState(found.event) !== 'active',
            policies: roomPolicies(found.event),
          },
          participant: {
            name: found.participant.name,
            photoUrl: found.participant.photoUrl,
            wish: found.participant.wish,
            mood: found.participant.mood,
            giftProfile: publicGiftProfile(found.participant),
            revealed: Boolean(found.participant.revealedAt),
            revealedAt: found.participant.revealedAt,
            targetName: target?.name || null,
            targetProfile: target ? {
              name: target.name,
              photoUrl: target.photoUrl,
              wish: target.wish,
              mood: target.mood,
              giftProfile: publicGiftProfile(target),
            } : null,
          },
        });
      }

      match = /^\/api\/public\/([^/]+)\/messages$/.exec(pathname);
      if (match && method === 'POST') {
        const publicToken = assertOpaqueToken(match[1], 'Festa');
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings, 'message');
        const current = await repository.ensureEventRecoveryByPublicToken(publicToken);
        if (!current) throw new HttpError(404, 'Festa non trovata.');
        assertRoomReadable(current);
        assertRoomWritable(current, 'pubblicare messaggi');
        if (!roomPolicies(current).allowMessages) throw new HttpError(423, 'Il muro degli auguri è disattivato per questa stanza.');
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
        return jsonResponse(201, { ok: true, message: outcome.result.entry });
      }

      match = /^\/api\/public\/([^/]+)$/.exec(pathname);
      if (match && method === 'GET') {
        const publicToken = assertOpaqueToken(match[1], 'Festa');
        const settings = await repository.getSystemSettings();
        assertSiteOperational(settings);
        const event = await repository.ensureEventRecoveryByPublicToken(publicToken);
        if (!event) throw new HttpError(404, 'Festa non trovata.');
        assertRoomReadable(event);
        return jsonResponse(200, {
          ok: true,
          event: {
            name: event.name,
            organizer: event.organizer,
            organizerParticipates: Boolean(event.organizerParticipates),
            date: event.date,
            location: event.location,
            budgetCents: Number.isInteger(event.budgetCents) ? event.budgetCents : null,
            updatedAt: event.updatedAt || event.createdAt || '',
            status: roomState(event),
            readOnly: roomState(event) !== 'active',
            policies: roomPolicies(event),
            participantCount: event.participants.length,
            revealedCount: event.participants.filter((participant) => participant.revealedAt).length,
            participants: event.participants.map((participant) => ({
              id: participant.id,
              name: participant.name,
              isOrganizer: Boolean(participant.isOrganizer),
              photoUrl: participant.photoUrl,
              wish: participant.wish,
              mood: participant.mood,
              giftProfile: publicGiftProfile(participant),
              revealed: Boolean(participant.revealedAt),
            })),
            messages: [...event.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
          },
        }, PUBLIC_CACHE_HEADERS);
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
        consistency: 'eventual',
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
