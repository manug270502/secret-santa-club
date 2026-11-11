import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createApiHandler, createMediaHandler } from '../src/api-app.mjs';
import { MemoryBlobStore } from './memory-store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup(env = {}) {
  const dataStore = new MemoryBlobStore();
  const mediaStore = new MemoryBlobStore();
  const api = createApiHandler({
    dataStore,
    mediaStore,
    env: { CONTEXT: 'dev', ...env },
  });
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
      organizer: 'Admin',
      date: '2026-12-20',
      location: 'Casa',
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
  const ids = new Set(storedEvent.participants.map((participant) => participant.id));
  const assignments = new Set(storedEvent.participants.map((participant) => participant.assignedId));
  assert.deepEqual(assignments, ids);
  storedEvent.participants.forEach((participant) => assert.notEqual(participant.id, participant.assignedId));

  const publicBefore = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicBefore.payload.event.revealedCount, 0);
  const publicSerialized = JSON.stringify(publicBefore.payload);
  assert.equal(publicSerialized.includes('assignedId'), false);
  assert.equal(publicSerialized.includes('token'), false);

  const participantToken = tokenFrom(admin.payload.event.participants[0].path);
  const participantBefore = await call(api, `/api/participant/${participantToken}`);
  assert.equal(participantBefore.payload.participant.targetName, null);

  const tooSoon = await call(api, `/api/participant/${participantToken}/reveal`, { method: 'POST' });
  assert.equal(tooSoon.response.status, 400);

  const form = new FormData();
  form.append('wish', 'Un libro e del buon caffè');
  form.append('mood', '🎁');
  form.append('photo', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00])], { type: 'image/jpeg' }), 'foto.jpg');
  const profile = await call(api, `/api/participant/${participantToken}/profile`, { method: 'POST', body: form });
  assert.equal(profile.response.status, 200);
  assert.match(profile.payload.photoUrl, /^\/media\/[A-Za-z0-9_-]+$/);

  const image = await call(media, profile.payload.photoUrl);
  assert.equal(image.response.status, 200);
  assert.equal(image.response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await image.response.arrayBuffer())].slice(0, 3), [0xff, 0xd8, 0xff]);

  const reveal = await call(api, `/api/participant/${participantToken}/reveal`, { method: 'POST' });
  assert.equal(reveal.response.status, 200);
  assert.ok(reveal.payload.targetName);
  assert.notEqual(reveal.payload.targetName, participantBefore.payload.participant.name);

  const participantAfter = await call(api, `/api/participant/${participantToken}`);
  assert.equal(participantAfter.payload.participant.revealed, true);
  assert.equal(participantAfter.payload.participant.targetName, reveal.payload.targetName);

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
  for (const participant of publicAfter.payload.event.participants) {
    assert.equal(Object.hasOwn(participant, 'assignedId'), false);
    assert.equal(Object.hasOwn(participant, 'targetName'), false);
    assert.equal(Object.hasOwn(participant, 'token'), false);
  }
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
    body: JSON.stringify({ name: 'Test', organizer: 'Admin', participants: ['A', 'B'] }),
  });
  assert.equal(tooFew.response.status, 400);

  const duplicate = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', organizer: 'Admin', participants: ['Anna', 'anna', 'Carla'] }),
  });
  assert.equal(duplicate.response.status, 400);

  const demo = await call(api, '/api/demo', { method: 'POST' });
  assert.equal(demo.response.status, 404);

  const created = await createParty(api);
  assert.match(created.payload.adminUrl, /^https:\/\/natale\.example\/admin\//);
});

test('configurazione statica contiene route Netlify e frontend WhatsApp senza copia manuale', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /from = "\/api\/\*"/);
  assert.match(toml, /from = "\/media\/\*"/);
  assert.match(toml, /from = "\/admin\/\*"/);
  assert.match(toml, /to = "\/admin\.html"/);

  const adminJs = fs.readFileSync(path.join(ROOT, 'public/js/admin.js'), 'utf8');
  assert.match(adminJs, /Apri WhatsApp/);
  assert.match(adminJs, /inviteText\(participant, link\)/);
  assert.match(adminJs, /UI\.whatsappUrl/);

  for (const file of ['index.html', 'admin.html', 'participant.html', 'dashboard.html']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'public', file)), true, `${file} deve esistere`);
  }
});


test('i link WhatsApp normalizzano i numeri italiani e includono il testo senza copia manuale', () => {
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
  assert.match(makeUrl('3201112233', message), /^https:\/\/wa\.me\/393201112233\?text=/);
  assert.match(decodeURIComponent(makeUrl('', message)), /https:\/\/secret-santa\.netlify\.app\/join\/abc12345/);
});
