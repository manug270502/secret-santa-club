import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createApiHandler, createMediaHandler } from '../src/api-app.mjs';
import { MemoryBlobStore } from './memory-store.mjs';
import { createTwilioWhatsAppClient, normalizeE164 } from '../src/twilio-whatsapp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup(env = {}, twilioClient = undefined) {
  const dataStore = new MemoryBlobStore();
  const mediaStore = new MemoryBlobStore();
  const api = createApiHandler({
    dataStore,
    mediaStore,
    env: { CONTEXT: 'dev', ...env },
    ...(twilioClient ? { twilioClient } : {}),
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

test('configurazione statica contiene route Netlify, invio Twilio e fallback manuale', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /from = "\/api\/\*"/);
  assert.match(toml, /from = "\/media\/\*"/);
  assert.match(toml, /from = "\/admin\/\*"/);
  assert.match(toml, /to = "\/admin\.html"/);

  const adminJs = fs.readFileSync(path.join(ROOT, 'public/js/admin.js'), 'utf8');
  assert.match(adminJs, /sendAllInvites/);
  assert.match(adminJs, /\/invites\/\$\{participant\.id\}\/send/);
  assert.match(adminJs, /\/participants\/\$\{participant\.id\}/);
  assert.match(adminJs, /Invia automaticamente/);
  assert.match(adminJs, /UI\.whatsappUrl/); // fallback solo se Twilio non e configurato

  for (const file of ['index.html', 'admin.html', 'participant.html', 'dashboard.html']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'public', file)), true, `${file} deve esistere`);
  }
});


test('il fallback WhatsApp normalizza i numeri italiani e mantiene il link personale', () => {
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


test('admin partecipante opzionale e invio automatico Twilio con stato consegna', async () => {
  const sends = [];
  const fakeTwilio = {
    publicConfig: () => ({
      configured: true,
      mode: 'template',
      sender: 'messaging-service',
      templateConfigured: true,
      missing: [],
    }),
    async sendInvite(payload) {
      sends.push(payload);
      return {
        sid: `SM${String(sends.length).padStart(32, '0')}`,
        status: 'queued',
        errorCode: '',
        errorMessage: '',
      };
    },
    async getMessageStatus(messageSid) {
      return { sid: messageSid, status: 'delivered', errorCode: '', errorMessage: '' };
    },
  };
  const { api } = setup({}, fakeTwilio);
  const creation = await call(api, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Natale con Admin',
      organizerParticipates: true,
      organizerName: 'Manuele',
      organizerPhone: '+39 333 000 0000',
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
  const system = await call(api, '/api/system');
  assert.equal(system.payload.whatsappAutomation.configured, true);

  const admin = await call(api, `/api/admin/${adminToken}`);
  assert.equal(admin.payload.event.organizerParticipates, true);
  assert.equal(admin.payload.event.participants.length, 3);
  const organizer = admin.payload.event.participants.find((participant) => participant.isOrganizer);
  assert.equal(organizer.name, 'Manuele');
  assert.equal(organizer.invite.status, 'not_sent');

  const sent = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.payload.invite.status, 'queued');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].participantName, 'Manuele');
  assert.match(sends[0].inviteUrl, /^https:\/\/secret-santa-test\.netlify\.app\/join\//);

  const duplicate = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  assert.equal(duplicate.response.status, 409);

  const resent = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });
  assert.equal(resent.response.status, 200);
  assert.equal(sends.length, 2);

  const refreshed = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/refresh`, { method: 'POST' });
  assert.equal(refreshed.response.status, 200);
  assert.equal(refreshed.payload.invite.status, 'delivered');

  const changedPhone = await call(api, `/api/admin/${adminToken}/participants/${organizer.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '347 555 6677' }),
  });
  assert.equal(changedPhone.response.status, 200);
  assert.equal(changedPhone.payload.phone, '+393475556677');
  assert.equal(changedPhone.payload.invite.status, 'not_sent');

  const sentToNewNumber = await call(api, `/api/admin/${adminToken}/invites/${organizer.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  assert.equal(sentToNewNumber.response.status, 200);
  assert.equal(sends.length, 3);
  assert.equal(sends[2].to, '+393475556677');

  const publicParty = await call(api, `/api/public/${publicToken}`);
  assert.equal(publicParty.payload.event.participants.find((item) => item.isOrganizer).name, 'Manuele');
  assert.equal(JSON.stringify(publicParty.payload).includes('messageSid'), false);
  assert.equal(JSON.stringify(publicParty.payload).includes('inviteUrl'), false);
  assert.equal(JSON.stringify(publicParty.payload).includes('+393475556677'), false);
});

test('la creazione moderna richiede i numeri quando gli inviti automatici sono previsti', async () => {
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

test('client Twilio costruisce una richiesta WhatsApp template senza esporre segreti al browser', async () => {
  let captured = null;
  const env = {
    TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`,
    TWILIO_API_KEY: `SK${'2'.repeat(32)}`,
    TWILIO_API_SECRET: 'super-secret',
    TWILIO_MESSAGING_SERVICE_SID: `MG${'3'.repeat(32)}`,
    TWILIO_CONTENT_SID: `HX${'4'.repeat(32)}`,
  };
  const client = createTwilioWhatsAppClient(env, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ sid: `SM${'5'.repeat(32)}`, status: 'queued' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(client.publicConfig().configured, true);
  assert.equal(Object.values(client.publicConfig()).includes('super-secret'), false);
  const result = await client.sendInvite({
    to: '333 123 4567',
    participantName: 'Anna',
    eventName: 'Natale Test',
    dateText: '20 dicembre 2026',
    inviteUrl: 'https://secret-santa.example/join/token12345',
  });
  assert.equal(result.status, 'queued');
  assert.match(captured.url, /Accounts\/AC1+\/Messages\.json$/);
  assert.match(captured.options.headers.Authorization, /^Basic /);
  const form = new URLSearchParams(captured.options.body);
  assert.equal(form.get('To'), 'whatsapp:+393331234567');
  assert.equal(form.get('MessagingServiceSid'), env.TWILIO_MESSAGING_SERVICE_SID);
  assert.equal(form.get('ContentSid'), env.TWILIO_CONTENT_SID);
  assert.equal(form.get('MessageIntent'), 'events');
  const variables = JSON.parse(form.get('ContentVariables'));
  assert.equal(variables['1'], 'Anna');
  assert.equal(variables['4'], 'https://secret-santa.example/join/token12345');
  assert.equal(normalizeE164('0039 347 765 4321'), '+393477654321');
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
});

test('due clic simultanei non producono due invii Twilio', async () => {
  let sendCount = 0;
  let releaseSend;
  let markEntered;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const hold = new Promise((resolve) => { releaseSend = resolve; });
  const fakeTwilio = {
    publicConfig: () => ({ configured: true, mode: 'template', sender: 'messaging-service', templateConfigured: true, missing: [] }),
    async sendInvite() {
      sendCount += 1;
      markEntered();
      await hold;
      return { sid: `SM${'7'.repeat(32)}`, status: 'queued', errorCode: '', errorMessage: '' };
    },
    async getMessageStatus(messageSid) {
      return { sid: messageSid, status: 'queued', errorCode: '', errorMessage: '' };
    },
  };
  const { api } = setup({}, fakeTwilio);
  const creation = await createParty(api);
  const adminToken = tokenFrom(creation.payload.adminPath);
  const admin = await call(api, `/api/admin/${adminToken}`);
  const participant = admin.payload.event.participants[0];

  const firstRequest = call(api, `/api/admin/${adminToken}/invites/${participant.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  await entered;

  const duplicate = await call(api, `/api/admin/${adminToken}/invites/${participant.id}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(sendCount, 1);

  releaseSend();
  const first = await firstRequest;
  assert.equal(first.response.status, 200);
  assert.equal(first.payload.invite.status, 'queued');
  assert.equal(sendCount, 1);
});
