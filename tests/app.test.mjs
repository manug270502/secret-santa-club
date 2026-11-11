import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createApiHandler, createMediaHandler } from '../src/api-app.mjs';
import { normalizeE164, normalizedInviteState } from '../src/domain.mjs';
import { MemoryBlobStore } from './memory-store.mjs';
import { hashSuperAdminPassword } from '../src/super-admin-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup(env = {}) {
  const dataStore = new MemoryBlobStore();
  const mediaStore = new MemoryBlobStore();
  const api = createApiHandler({ dataStore, mediaStore, env: { CONTEXT: 'dev', ...env } });
  const media = createMediaHandler({ mediaStore });
  return { dataStore, mediaStore, api, media };
}

async function call(handler, pathname, options = {}) {
  const request = new Request(`https://secret-santa-test.netlify.app${pathname}`, options);
  const response = await handler(request, {});
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : null;
  return { response, payload };
}

async function createParty(api) {
  return call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale Test',
      organizerParticipates: false,
      date: '2026-12-20',
      location: 'Casa',
      budget: '25,50',
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '+39 333 1111111' },
        { name: 'Bruno', phone: '+39 333 2222222' },
        { name: 'Carla', phone: '+39 333 3333333' },
        { name: 'Diego', phone: '+39 333 4444444' },
      ],
    }),
  });
}

function tokenFrom(pathname) {
  return pathname.split('/').filter(Boolean).pop();
}

test('flusso completo Netlify: creazione, privacy, foto Blob, reveal e dashboard', async () => {
  const { dataStore, api, media } = setup();
  const health = await call(api, '/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.service, 'secret-santa-club-netlify-v6');
  assert.equal(health.payload.storage, 'netlify-blobs');

  const creation = await createParty(api);
  assert.equal(creation.response.status, 201);
  assert.match(creation.payload.adminPath, /^\/admin\//);
  assert.match(creation.payload.publicPath, /^\/party\//);
  assert.match(creation.payload.adminUrl, /^https:\/\/secret-santa-test\.netlify\.app\/admin\//);

  const adminToken = tokenFrom(creation.payload.adminPath);
  const publicToken = tokenFrom(creation.payload.publicPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  assert.equal(admin.response.status, 200);
  assert.equal(admin.payload.event.participants.length, 4);
  assert.equal(JSON.stringify(admin.payload).includes('assignedId'), false);
  assert.equal(JSON.stringify(admin.payload).includes('photoToken'), false);

  const eventKey = dataStore.keys().find((key) => key.startsWith('event/'));
  const storedEvent = dataStore.raw(eventKey);
  assert.equal(storedEvent.schemaVersion, 6);
  assert.equal(storedEvent.budgetCents, 2550);
  storedEvent.participants.forEach((participant) => assert.match(participant.recoveryCode, /^[A-HJ-NP-Z2-9]{8}$/));
  const ids = new Set(storedEvent.participants.map((participant) => participant.id));
  const assignments = new Set(storedEvent.participants.map((participant) => participant.assignedId));
  assert.deepEqual(assignments, ids);
  storedEvent.participants.forEach((participant) => assert.notEqual(participant.id, participant.assignedId));

  const publicBefore = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicBefore.payload.event.revealedCount, 0);
  const publicSerialized = JSON.stringify(publicBefore.payload);
  assert.equal(publicSerialized.includes('assignedId'), false);
  assert.equal(publicSerialized.includes('phone'), false);
  assert.equal(publicSerialized.includes('invite'), false);

  const participantToken = tokenFrom(admin.payload.event.participants[0].path);
  const participantBefore = await call(api, `/api/participant/${participantToken}`);
  assert.equal(participantBefore.payload.participant.targetName, null);

  const tooSoon = await call(api, `/api/participant/${participantToken}/reveal`, { method: 'POST' });
  assert.equal(tooSoon.response.status, 400);

  const form = new FormData();
  form.append('wish', 'Un libro e del buon caffe');
  form.append('mood', '🎁');
  form.append('favoriteColor', 'blu');
  form.append('giftStyle', 'utile');
  form.append('interests', JSON.stringify(['libri', 'tecnologia']));
  form.append('avoid', 'Profumi troppo forti');
  form.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])], { type: 'image/jpeg' }), 'foto.jpg');
  const profile = await call(api, `/api/participant/${participantToken}/profile`, { method: 'POST', body: form });
  assert.equal(profile.response.status, 200);
  assert.match(profile.payload.photoUrl, /^\/media\/[A-Za-z0-9_-]+$/);
  assert.deepEqual(profile.payload.giftProfile, {
    favoriteColor: 'blu',
    interests: ['libri', 'tecnologia'],
    giftStyle: 'utile',
    avoid: 'Profumi troppo forti',
  });

  const image = await call(media, profile.payload.photoUrl);
  assert.equal(image.response.status, 200);
  assert.equal(image.response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await image.response.arrayBuffer())].slice(0, 3), [0xff, 0xd8, 0xff]);

  const reveal = await call(api, `/api/participant/${participantToken}/reveal`, { method: 'POST' });
  assert.equal(reveal.response.status, 200);
  assert.ok(reveal.payload.targetName);
  assert.notEqual(reveal.payload.targetName, participantBefore.payload.participant.name);

  const redraw = await call(api, `/api/admin/${adminToken}/redraw`, { method: 'POST' });
  assert.equal(redraw.response.status, 409);

  const message = await call(api, `/api/public/${publicToken}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: 'Anna', message: 'Che la magia inizi!', emoji: '✨' }),
  });
  assert.equal(message.response.status, 201);

  const publicAfter = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicAfter.payload.event.revealedCount, 1);
  assert.equal(publicAfter.payload.event.messages.length, 1);
  assert.equal(publicAfter.payload.event.budgetCents, 2550);
  assert.equal(publicAfter.payload.event.participants[0].giftProfile.favoriteColor, 'blu');
});

test('scritture concorrenti non perdono i messaggi grazie agli ETag', async () => {
  const { api } = setup();
  const creation = await createParty(api);
  const publicToken = tokenFrom(creation.payload.publicPath);
  const requests = Array.from({ length: 12 }, (_, index) => call(api, `/api/public/${publicToken}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: `Elfo ${index}`, message: `Messaggio numero ${index}`, emoji: '🎄' }),
  }));
  const results = await Promise.all(requests);
  results.forEach(({ response }) => assert.equal(response.status, 201));
  const party = await call(api, `/api/public/${publicToken}`);
  assert.equal(party.payload.event.messages.length, 12);
});

test('validazione, demo produzione e percorso Function riscritto', async () => {
  const { api } = setup({ CONTEXT: 'production', ENABLE_DEMO: 'false', PUBLIC_BASE_URL: 'https://natale.example/' });
  const tooFew = await call(api, '/.netlify/functions/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', organizerParticipates: false, participants: ['A', 'B'] }),
  });
  assert.equal(tooFew.response.status, 400);

  const duplicate = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', organizerParticipates: false, participants: ['Anna', 'anna', 'Carla'] }),
  });
  assert.equal(duplicate.response.status, 400);

  const demo = await call(api, '/api/demo', { method: 'POST' });
  assert.equal(demo.response.status, 404);

  const created = await createParty(api);
  assert.match(created.payload.adminUrl, /^https:\/\/natale\.example\/admin\//);
  const system = await call(api, '/api/system');
  assert.deepEqual(system.payload.whatsappSharing, {
    mode: 'click-to-chat',
    automatic: false,
    finalConfirmationRequired: true,
  });
});

test('configurazione statica usa Netlify e non contiene invio WhatsApp automatico', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /from = "\/api\/\*"/);
  assert.match(toml, /from = "\/media\/\*"/);
  assert.match(toml, /from = "\/admin\/\*"/);
  assert.match(toml, /to = "\/admin\.html"/);
  assert.match(toml, /from = "\/super-admin"/);
  assert.match(toml, /to = "\/super-admin\.html"/);

  const adminJs = fs.readFileSync(path.join(ROOT, 'public/js/admin.js'), 'utf8');
  assert.match(adminJs, /openNextInvite/);
  assert.match(adminJs, /\/invites\/\$\{participant\.id\}\/opened/);
  assert.match(adminJs, /\/invites\/\$\{participant\.id\}\/reset/);
  assert.match(adminJs, /UI\.whatsappUrl/);
  assert.doesNotMatch(adminJs, /twilio/i);
  const legacyStub = fs.readFileSync(path.join(ROOT, 'src/twilio-whatsapp.mjs'), 'utf8');
  assert.doesNotMatch(legacyStub, /api\.twilio\.com|sendInvite|getMessageStatus/);

  assert.match(toml, /from = "\/my-events"/);

  for (const file of ['index.html', 'admin.html', 'my-events.html', 'participant.html', 'dashboard.html', 'super-admin.html']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'public', file)), true, `${file} deve esistere`);
  }
});

test('il link WhatsApp normalizza i numeri italiani e mantiene il link personale', () => {
  const source = fs.readFileSync(path.join(ROOT, 'public/js/common.js'), 'utf8');
  const windowObject = {
    setTimeout: () => 0,
    matchMedia: () => ({ matches: true }),
  };
  const context = {
    window: windowObject,
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({ style: {}, appendChild: () => {}, remove: () => {} }),
    },
    navigator: {},
    console,
    setTimeout: () => 0,
    URL,
    Intl,
    Date,
    Math,
  };
  vm.runInNewContext(source, context, { filename: 'common.js' });
  const makeUrl = context.window.ChristmasUI.whatsappUrl;
  const message = 'Apri il tuo link: https://secret-santa.netlify.app/join/abc12345';
  assert.match(makeUrl('+39 333 123 4567', message), /^https:\/\/wa\.me\/393331234567\?text=/);
  assert.match(makeUrl('0039 347 765 4321', message), /^https:\/\/wa\.me\/393477654321\?text=/);
  assert.match(makeUrl('333 123 4567', message), /^https:\/\/wa\.me\/393331234567\?text=/);
  assert.match(decodeURIComponent(makeUrl('+39 333 123 4567', message)), /secret-santa\.netlify\.app\/join\/abc12345/);
});

test('admin partecipante e promemoria click-to-chat persistente', async () => {
  const { api } = setup();
  const creation = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale con Admin',
      organizerParticipates: true,
      organizerName: 'Manuele',
      organizerPhone: '333 000 0000',
      date: '2026-12-20',
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '+39 333 111 1111' },
        { name: 'Bruno', phone: '+39 333 222 2222' },
      ],
    }),
  });
  assert.equal(creation.response.status, 201);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const publicToken = tokenFrom(creation.payload.publicPath);

  const admin = await call(api, `/api/admin/${adminToken}`);
  assert.equal(admin.payload.event.organizerParticipates, true);
  assert.equal(admin.payload.event.participants.length, 3);
  const organizer = admin.payload.event.participants.find((participant) => participant.isOrganizer);
  assert.equal(organizer.name, 'Manuele');
  assert.equal(organizer.phone, '+393330000000');
  assert.equal(organizer.invite.status, 'not_opened');

  const opened = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/opened`, { method: 'POST' });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.payload.invite.status, 'opened');
  assert.equal(opened.payload.invite.openCount, 1);
  assert.ok(opened.payload.invite.openedAt);

  const openedAgain = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/opened`, { method: 'POST' });
  assert.equal(openedAgain.payload.invite.openCount, 2);
  assert.equal(openedAgain.payload.invite.openedAt, opened.payload.invite.openedAt);

  const reset = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/reset`, { method: 'POST' });
  assert.equal(reset.payload.invite.status, 'not_opened');
  assert.equal(reset.payload.invite.openCount, 0);

  await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/opened`, { method: 'POST' });
  const changedPhone = await call(api, `/api/admin/${adminToken}/participants/${organizer.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '347 555 6677' }),
  });
  assert.equal(changedPhone.response.status, 200);
  assert.equal(changedPhone.payload.phone, '+393475556677');
  assert.equal(changedPhone.payload.invite.status, 'not_opened');

  const publicParty = await call(api, `/api/public/${publicToken}`);
  const serialized = JSON.stringify(publicParty.payload);
  assert.equal(serialized.includes('+393475556677'), false);
  assert.equal(serialized.includes('openCount'), false);
  assert.equal(serialized.includes('openedAt'), false);
});

test('la creazione moderna richiede numeri validi e supporta admin non partecipante', async () => {
  const { api } = setup();
  const missingOrganizerPhone = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale',
      organizerParticipates: true,
      organizerName: 'Admin',
      organizerPhone: '',
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '+39 333 1111111' },
        { name: 'Bruno', phone: '+39 333 2222222' },
      ],
    }),
  });
  assert.equal(missingOrganizerPhone.response.status, 400);
  assert.match(missingOrganizerPhone.payload.error, /numero WhatsApp/i);

  const invalidPhone = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale',
      organizerParticipates: false,
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '123' },
        { name: 'Bruno', phone: '+39 333 2222222' },
        { name: 'Carla', phone: '+39 333 3333333' },
      ],
    }),
  });
  assert.equal(invalidPhone.response.status, 400);

  const anonymousAdmin = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale',
      organizerParticipates: false,
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '+39 333 1111111' },
        { name: 'Bruno', phone: '+39 333 2222222' },
        { name: 'Carla', phone: '+39 333 3333333' },
      ],
    }),
  });
  assert.equal(anonymousAdmin.response.status, 201);
  const admin = await call(api, `/api/admin/${tokenFrom(anonymousAdmin.payload.adminPath)}`);
  assert.equal(admin.payload.event.organizerParticipates, false);
  assert.equal(admin.payload.event.participants.some((participant) => participant.isOrganizer), false);
});

test('normalizzazione E.164 e migrazione sicura dei vecchi stati invito', () => {
  assert.equal(normalizeE164('+39 333 123 4567'), '+393331234567');
  assert.equal(normalizeE164('0039 347 765 4321'), '+393477654321');
  assert.equal(normalizeE164('333 123 4567'), '+393331234567');
  assert.equal(normalizeE164('123'), '');

  const migrated = normalizedInviteState({
    status: 'delivered',
    messageSid: 'SM_NON_DEVE_ESSERE_ESPOSTO',
    sentAt: '2026-11-10T10:00:00.000Z',
    attempts: 2,
  });
  assert.deepEqual(migrated, {
    status: 'opened',
    openedAt: '2026-11-10T10:00:00.000Z',
    updatedAt: null,
    openCount: 2,
  });
  assert.equal(Object.hasOwn(migrated, 'messageSid'), false);
});

test('gli override responsive coprono form, admin, partecipante e dashboard mobile', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/styles.css'), 'utf8');
  assert.match(css, /html, body \{[^}]*max-width: 100%/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.participant-row \{\s*grid-template-columns: 34px minmax\(0, 1fr\) 44px/s);
  assert.match(css, /\.share-row \{\s*grid-template-columns: 1fr/s);
  assert.match(css, /\.join-card \{\s*border-radius: 24px/s);
  assert.match(css, /\.people-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /input\[type="date"\][^{]*\{[^}]*min-width: 0[^}]*max-width: 100%/s);
  assert.match(css, /-webkit-appearance: none/);
  assert.match(css, /\.gift-profile-rail/);
  assert.match(css, /scroll-snap-type: x mandatory/);
});


test('recupero inviti per numero: elenco protetto, codice elfo e nome coperto', async () => {
  const { api } = setup();
  const creation = await createParty(api);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  const anna = admin.payload.event.participants.find((participant) => participant.name === 'Anna');
  assert.ok(anna);
  assert.match(anna.recoveryCode, /^[A-HJ-NP-Z2-9]{8}$/);

  const lookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '333 1111111' }),
  });
  assert.equal(lookup.response.status, 200);
  assert.equal(lookup.payload.rooms.length, 1);
  assert.equal(lookup.payload.rooms[0].name, 'Natale Test');
  assert.equal(lookup.payload.rooms[0].participantName, 'Anna');
  assert.equal(lookup.payload.rooms[0].budgetCents, 2550);
  const publicLookup = JSON.stringify(lookup.payload);
  assert.equal(publicLookup.includes('recoveryCode'), false);
  assert.equal(publicLookup.includes('participantPath'), false);
  assert.equal(publicLookup.includes('targetName'), false);
  assert.equal(publicLookup.includes('+393331111111'), false);

  const wrong = await call(api, '/api/recovery/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+39 333 1111111',
      eventId: lookup.payload.rooms[0].eventId,
      recoveryCode: 'AAAAAAAA',
    }),
  });
  assert.equal(wrong.response.status, 403);

  const unlockedBeforeReveal = await call(api, '/api/recovery/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+39 333 1111111',
      eventId: lookup.payload.rooms[0].eventId,
      recoveryCode: anna.recoveryCode.toLowerCase(),
    }),
  });
  assert.equal(unlockedBeforeReveal.response.status, 200);
  assert.equal(unlockedBeforeReveal.payload.room.targetName, null);
  assert.equal(unlockedBeforeReveal.payload.room.revealed, false);
  assert.match(unlockedBeforeReveal.payload.room.participantPath, /^\/join\//);
  assert.match(unlockedBeforeReveal.payload.room.publicPath, /^\/party\//);

  const profile = new FormData();
  profile.append('wish', 'Un romanzo giallo');
  profile.append('mood', '🎄');
  profile.append('favoriteColor', 'verde');
  profile.append('giftStyle', 'sorpresa');
  profile.append('interests', JSON.stringify(['libri', 'viaggi']));
  profile.append('avoid', 'Niente tazze');
  profile.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])], { type: 'image/jpeg' }), 'anna.jpg');
  assert.equal((await call(api, `/api/participant/${tokenFrom(anna.path)}/profile`, { method: 'POST', body: profile })).response.status, 200);
  const reveal = await call(api, `/api/participant/${tokenFrom(anna.path)}/reveal`, { method: 'POST' });
  assert.equal(reveal.response.status, 200);

  const unlockedAfterReveal = await call(api, '/api/recovery/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+39 333 1111111',
      eventId: lookup.payload.rooms[0].eventId,
      recoveryCode: anna.recoveryCode,
    }),
  });
  assert.equal(unlockedAfterReveal.response.status, 200);
  assert.equal(unlockedAfterReveal.payload.room.targetName, reveal.payload.targetName);
  assert.equal(unlockedAfterReveal.payload.room.revealed, true);

  const empty = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 333 9999999' }),
  });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.payload.rooms, []);
});

test('lo stesso numero ritrova più feste e il cambio numero aggiorna l’indice', async () => {
  const { api } = setup();
  const first = await createParty(api);
  const second = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Capodanno degli Elfi',
      organizerParticipates: false,
      date: '2026-12-31',
      requirePhones: true,
      participants: [
        { name: 'Anna', phone: '+39 333 1111111' },
        { name: 'Elena', phone: '+39 333 5555555' },
        { name: 'Fabio', phone: '+39 333 6666666' },
      ],
    }),
  });
  assert.equal(second.response.status, 201);

  let lookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 333 1111111' }),
  });
  assert.equal(lookup.payload.rooms.length, 2);
  assert.deepEqual(new Set(lookup.payload.rooms.map((room) => room.name)), new Set(['Natale Test', 'Capodanno degli Elfi']));

  const adminToken = tokenFrom(first.payload.adminPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  const anna = admin.payload.event.participants.find((participant) => participant.name === 'Anna');
  const changed = await call(api, `/api/admin/${adminToken}/participants/${anna.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 347 1010101' }),
  });
  assert.equal(changed.response.status, 200);

  lookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 333 1111111' }),
  });
  assert.equal(lookup.payload.rooms.length, 1);
  assert.equal(lookup.payload.rooms[0].name, 'Capodanno degli Elfi');

  const newLookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 347 1010101' }),
  });
  assert.equal(newLookup.payload.rooms.length, 1);
  assert.equal(newLookup.payload.rooms[0].name, 'Natale Test');
});

test('budget e profili regalo sono validati, normalizzati e pubblicati senza dati privati', async () => {
  const { api } = setup();
  const creation = await createParty(api);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const publicToken = tokenFrom(creation.payload.publicPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  assert.equal(admin.payload.event.budgetCents, 2550);
  const anna = admin.payload.event.participants.find((participant) => participant.name === 'Anna');

  const form = new FormData();
  form.append('wish', 'Qualcosa per viaggiare');
  form.append('mood', '✨');
  form.append('favoriteColor', 'BLU');
  form.append('giftStyle', 'esperienza');
  form.append('interests', JSON.stringify(['viaggi', 'libri', 'viaggi', 'invalid', 'musica', 'sport', 'natura', 'gaming']));
  form.append('avoid', 'Oggetti molto ingombranti');
  const saved = await call(api, `/api/participant/${tokenFrom(anna.path)}/profile`, { method: 'POST', body: form });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.payload.giftProfile, {
    favoriteColor: 'blu',
    interests: ['viaggi', 'libri', 'musica', 'sport', 'natura'],
    giftStyle: 'esperienza',
    avoid: 'Oggetti molto ingombranti',
  });

  const party = await call(api, `/api/public/${publicToken}`);
  const annaPublic = party.payload.event.participants.find((participant) => participant.name === 'Anna');
  assert.deepEqual(annaPublic.giftProfile, saved.payload.giftProfile);
  const serialized = JSON.stringify(party.payload);
  assert.equal(serialized.includes('recoveryCode'), false);
  assert.equal(serialized.includes('participantPath'), false);
  assert.equal(serialized.includes('+393331111111'), false);

  const invalidBudget = await call(api, `/api/admin/${adminToken}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget: '-1' }),
  });
  assert.equal(invalidBudget.response.status, 400);

  const cleared = await call(api, `/api/admin/${adminToken}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget: '' }),
  });
  assert.equal(cleared.response.status, 200);
  const afterClear = await call(api, `/api/admin/${adminToken}`);
  assert.equal(afterClear.payload.event.budgetCents, null);
});

test('un evento v4 viene migrato in modo compatibile quando l’admin lo riapre', async () => {
  const { api, dataStore } = setup();
  const creation = await createParty(api);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const eventKey = dataStore.keys().find((key) => key.startsWith('event/'));
  const entry = await dataStore.getWithMetadata(eventKey, { type: 'json' });
  const legacy = entry.data;
  legacy.schemaVersion = 4;
  delete legacy.budgetCents;
  legacy.participants.forEach((participant) => {
    delete participant.recoveryCode;
    delete participant.giftProfile;
  });
  await dataStore.setJSON(eventKey, legacy, { onlyIfMatch: entry.etag, metadata: { type: 'event' } });
  for (const key of dataStore.keys().filter((key) => key.startsWith('index/phone/'))) await dataStore.delete(key);

  const migrated = await call(api, `/api/admin/${adminToken}`);
  assert.equal(migrated.response.status, 200);
  assert.equal(migrated.payload.event.budgetCents, null);
  migrated.payload.event.participants.forEach((participant) => {
    assert.match(participant.recoveryCode, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.deepEqual(participant.giftProfile, { favoriteColor: '', interests: [], giftStyle: '', avoid: '' });
  });
  const stored = dataStore.raw(eventKey);
  assert.equal(stored.schemaVersion, 6);

  const lookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 333 1111111' }),
  });
  assert.equal(lookup.payload.rooms.length, 1);
});


function superAdminEnv() {
  return {
    SUPERADMIN_USERNAME: 'grande-elfo',
    SUPERADMIN_PASSWORD_HASH: hashSuperAdminPassword('UnaPasswordMoltoForte!2026', Buffer.alloc(18, 7)),
    SUPERADMIN_SESSION_SECRET: 'test-session-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
    SUPERADMIN_SESSION_HOURS: '8',
  };
}

async function loginSuperAdmin(api) {
  const login = await call(api, '/api/super-admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'grande-elfo', password: 'UnaPasswordMoltoForte!2026' }),
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie');
  assert.match(cookie, /ss_superadmin=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Secure/i);
  return { cookie: cookie.split(';')[0], csrf: login.payload.csrfToken };
}

function superAdminHeaders(session, extra = {}) {
  return {
    Cookie: session.cookie,
    'X-CSRF-Token': session.csrf,
    ...extra,
  };
}

test('Control Center: login sicuro, catalogo, dettaglio e protezione CSRF', async () => {
  const { api } = setup(superAdminEnv());
  const creation = await createParty(api);
  assert.equal(creation.response.status, 201);

  const unauthorized = await call(api, '/api/super-admin/overview');
  assert.equal(unauthorized.response.status, 401);

  const wrong = await call(api, '/api/super-admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'grande-elfo', password: 'sbagliata-sbagliata' }),
  });
  assert.equal(wrong.response.status, 401);

  const session = await loginSuperAdmin(api);
  const overview = await call(api, '/api/super-admin/overview?refresh=true', {
    headers: { Cookie: session.cookie },
  });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.payload.metrics.roomsTotal, 1);
  assert.equal(overview.payload.metrics.participants, 4);
  assert.equal(overview.payload.rooms.length, 1);
  assert.equal(JSON.stringify(overview.payload.rooms).includes('+39333'), false);
  assert.equal(JSON.stringify(overview.payload.rooms).includes('searchText'), false);

  const eventId = creation.payload.eventId;
  const detail = await call(api, `/api/super-admin/events/${eventId}`, {
    headers: { Cookie: session.cookie },
  });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.event.participants.length, 4);
  assert.ok(detail.payload.event.participants[0].phone);
  assert.ok(detail.payload.event.participants[0].assignedName);
  assert.ok(detail.payload.event.assignmentHealth.valid);

  const missingCsrf = await call(api, `/api/super-admin/events/${eventId}`, {
    method: 'PATCH',
    headers: { Cookie: session.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Polo Nord' }),
  });
  assert.equal(missingCsrf.response.status, 403);

  const updated = await call(api, `/api/super-admin/events/${eventId}`, {
    method: 'PATCH',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ location: 'Polo Nord', budget: '30' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.event.location, 'Polo Nord');
  assert.equal(updated.payload.event.budgetCents, 3000);

  const audit = await call(api, '/api/super-admin/audit?limit=30', {
    headers: { Cookie: session.cookie },
  });
  assert.equal(audit.response.status, 200);
  assert.ok(audit.payload.audit.some((entry) => entry.action === 'event_updated'));
});

test('Control Center: blocco, conclusione, cestino, ripristino ed eliminazione definitiva', async () => {
  const { api } = setup(superAdminEnv());
  const creation = await createParty(api);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const publicToken = tokenFrom(creation.payload.publicPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  const participantToken = tokenFrom(admin.payload.event.participants[0].path);
  const session = await loginSuperAdmin(api);
  const eventId = creation.payload.eventId;

  const blocked = await call(api, `/api/super-admin/events/${eventId}/status`, {
    method: 'POST',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status: 'blocked', reason: 'Controllo del Grande Elfo' }),
  });
  assert.equal(blocked.response.status, 200);
  assert.equal(blocked.payload.event.status, 'blocked');

  const publicBlocked = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicBlocked.response.status, 423);
  assert.equal(publicBlocked.payload.code, 'ROOM_BLOCKED');
  const participantBlocked = await call(api, `/api/participant/${participantToken}`);
  assert.equal(participantBlocked.response.status, 423);
  const adminBlocked = await call(api, `/api/admin/${adminToken}`);
  assert.equal(adminBlocked.response.status, 200);
  assert.equal(adminBlocked.payload.event.readOnly, true);

  const completed = await call(api, `/api/super-admin/events/${eventId}/status`, {
    method: 'POST',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(completed.response.status, 200);
  const publicCompleted = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicCompleted.response.status, 200);
  assert.equal(publicCompleted.payload.event.readOnly, true);
  const newMessage = await call(api, `/api/public/${publicToken}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: 'Anna', message: 'Non dovrebbe partire', emoji: '✨' }),
  });
  assert.equal(newMessage.response.status, 423);

  const trashed = await call(api, `/api/super-admin/events/${eventId}`, {
    method: 'DELETE',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason: 'Evento duplicato' }),
  });
  assert.equal(trashed.response.status, 200);
  assert.equal(trashed.payload.event.status, 'trashed');
  assert.ok(trashed.payload.event.purgeAfter);

  const lookup = await call(api, '/api/recovery/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+39 333 1111111' }),
  });
  assert.deepEqual(lookup.payload.rooms, []);

  const restored = await call(api, `/api/super-admin/events/${eventId}/restore`, {
    method: 'POST',
    headers: superAdminHeaders(session),
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.payload.event.status, 'completed');

  await call(api, `/api/super-admin/events/${eventId}`, {
    method: 'DELETE',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason: 'Pulizia finale' }),
  });
  const wrongName = await call(api, `/api/super-admin/events/${eventId}/purge`, {
    method: 'DELETE',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ confirmId: eventId, confirmPhrase: 'ELIMINA Nome sbagliato' }),
  });
  assert.equal(wrongName.response.status, 400);
  const purged = await call(api, `/api/super-admin/events/${eventId}/purge`, {
    method: 'DELETE',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ confirmId: eventId, confirmPhrase: 'ELIMINA Natale Test' }),
  });
  assert.equal(purged.response.status, 200);
  assert.equal((await call(api, `/api/admin/${adminToken}`)).response.status, 404);
});

test('impostazioni globali: creazione, manutenzione e foto possono essere sospese separatamente', async () => {
  const { api } = setup(superAdminEnv());
  const creation = await createParty(api);
  const admin = await call(api, `/api/admin/${tokenFrom(creation.payload.adminPath)}`);
  const participantToken = tokenFrom(admin.payload.event.participants[0].path);
  const session = await loginSuperAdmin(api);

  const settings = await call(api, '/api/super-admin/settings', {
    method: 'PATCH',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      allowEventCreation: false,
      allowRecovery: true,
      allowPhotoUploads: false,
      allowWallMessages: true,
      maintenanceMode: false,
    }),
  });
  assert.equal(settings.response.status, 200);

  const deniedCreation = await createParty(api);
  assert.equal(deniedCreation.response.status, 503);
  assert.equal(deniedCreation.payload.code, 'CREATION_DISABLED');

  const textOnly = new FormData();
  textOnly.append('wish', 'Una sciarpa verde');
  textOnly.append('mood', '🎄');
  textOnly.append('favoriteColor', 'verde');
  textOnly.append('giftStyle', 'utile');
  textOnly.append('interests', JSON.stringify(['moda']));
  textOnly.append('avoid', 'Lana ruvida');
  const textSaved = await call(api, `/api/participant/${participantToken}/profile`, { method: 'POST', body: textOnly });
  assert.equal(textSaved.response.status, 200);

  const withPhoto = new FormData();
  withPhoto.append('wish', 'Test');
  withPhoto.append('mood', '🎄');
  withPhoto.append('interests', '[]');
  withPhoto.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'test.jpg');
  const photoDenied = await call(api, `/api/participant/${participantToken}/profile`, { method: 'POST', body: withPhoto });
  assert.equal(photoDenied.response.status, 503);
  assert.equal(photoDenied.payload.code, 'PHOTO_UPLOADS_DISABLED');

  await call(api, '/api/super-admin/settings', {
    method: 'PATCH',
    headers: superAdminHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ maintenanceMode: true, maintenanceMessage: 'Aggiornamento in corso' }),
  });
  const maintenance = await call(api, `/api/admin/${tokenFrom(creation.payload.adminPath)}`);
  assert.equal(maintenance.response.status, 503);
  assert.equal(maintenance.payload.error, 'Aggiornamento in corso');
  assert.equal((await call(api, '/health')).response.status, 200);
  assert.equal((await call(api, '/api/super-admin/overview', { headers: { Cookie: session.cookie } })).response.status, 200);
});

test('catalogo super-admin ricostruisce le stanze preesistenti tramite prefisso Blob', async () => {
  const { api, dataStore } = setup(superAdminEnv());
  const first = await createParty(api);
  const second = await createParty(api);
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  await dataStore.delete('system/event-catalog-v1');
  const session = await loginSuperAdmin(api);
  const overview = await call(api, '/api/super-admin/overview?refresh=true', { headers: { Cookie: session.cookie } });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.payload.rooms.length, 2);
  assert.equal(overview.payload.metrics.roomsTotal, 2);
});

test('Control Center: esportazione, duplicazione e rigenerazione delle credenziali personali', async () => {
  const { api } = setup(superAdminEnv());
  const creation = await createParty(api);
  const session = await loginSuperAdmin(api);
  const eventId = creation.payload.eventId;

  const detail = await call(api, `/api/super-admin/events/${eventId}`, {
    headers: { Cookie: session.cookie },
  });
  const participant = detail.payload.event.participants[0];
  const oldCode = participant.recoveryCode;
  const oldPath = participant.path;

  const csv = await call(api, `/api/super-admin/events/${eventId}/export?format=csv`, {
    headers: { Cookie: session.cookie },
  });
  assert.equal(csv.response.status, 200);
  assert.match(csv.response.headers.get('content-disposition'), /attachment/);
  assert.match(await csv.response.text(), /"Nome","Telefono"/);

  const json = await call(api, `/api/super-admin/events/${eventId}/export?format=json`, {
    headers: { Cookie: session.cookie },
  });
  assert.equal(json.response.status, 200);
  assert.equal(json.payload.name, 'Natale Test');
  assert.equal(json.payload.participants.length, 4);

  const newCode = await call(api, `/api/super-admin/events/${eventId}/participants/${participant.id}/recovery-code`, {
    method: 'POST',
    headers: superAdminHeaders(session),
  });
  assert.equal(newCode.response.status, 200);
  assert.match(newCode.payload.recoveryCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.notEqual(newCode.payload.recoveryCode, oldCode);

  const newLink = await call(api, `/api/super-admin/events/${eventId}/participants/${participant.id}/link`, {
    method: 'POST',
    headers: superAdminHeaders(session),
  });
  assert.equal(newLink.response.status, 200);
  assert.notEqual(newLink.payload.path, oldPath);
  assert.equal((await call(api, `/api/participant/${tokenFrom(oldPath)}`)).response.status, 404);
  assert.equal((await call(api, `/api/participant/${tokenFrom(newLink.payload.path)}`)).response.status, 200);

  const duplicate = await call(api, `/api/super-admin/events/${eventId}/duplicate`, {
    method: 'POST',
    headers: superAdminHeaders(session),
  });
  assert.equal(duplicate.response.status, 201);
  assert.notEqual(duplicate.payload.eventId, eventId);

  const duplicateDetail = await call(api, `/api/super-admin/events/${duplicate.payload.eventId}`, {
    headers: { Cookie: session.cookie },
  });
  assert.equal(duplicateDetail.response.status, 200);
  assert.equal(duplicateDetail.payload.event.name, 'Natale Test (copia)');
  assert.equal(duplicateDetail.payload.event.participants.length, 4);
  assert.equal(duplicateDetail.payload.event.messages.length, 0);
  assert.equal(duplicateDetail.payload.event.participants.some((item) => item.photoUrl || item.revealedAt), false);
  assert.notEqual(duplicateDetail.payload.event.adminToken, detail.payload.event.adminToken);
  assert.notEqual(duplicateDetail.payload.event.publicToken, detail.payload.event.publicToken);
});
