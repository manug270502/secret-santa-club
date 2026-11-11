document.addEventListener('DOMContentLoaded', async () => {
  const UI = window.ChristmasUI;
  const adminToken = UI.tokenFromPath('admin');
  const app = UI.qs('#adminApp');
  const loading = UI.qs('#adminLoading');
  const shareBase = UI.qs('#shareBase');
  const datalist = UI.qs('#baseSuggestions');
  const participantList = UI.qs('#participantShareList');
  const editModal = UI.qs('#editEventModal');
  const editForm = UI.qs('#editEventForm');
  let state = { event: null, system: null, base: window.location.origin };
  const openedStorageKey = `secret-santa-whatsapp-opened:${adminToken}`;
  let openedInvites = new Set();
  try { openedInvites = new Set(JSON.parse(localStorage.getItem(openedStorageKey) || '[]')); } catch (_error) {}

  function rememberWhatsAppOpened(participantId) {
    openedInvites.add(participantId);
    try { localStorage.setItem(openedStorageKey, JSON.stringify([...openedInvites])); } catch (_error) {}
  }

  const cleanBase = (value) => String(value || '').trim().replace(/\/$/, '');
  const pathUrl = (path) => `${cleanBase(state.base)}${path}`;

  function setLoadingError(message) {
    loading.innerHTML = '';
    const icon = document.createElement('div');
    icon.className = 'gift-loader';
    icon.textContent = '🧊';
    const title = document.createElement('h1');
    title.textContent = 'La regia è rimasta al Polo Nord';
    const text = document.createElement('p');
    text.textContent = message;
    loading.append(icon, title, text);
  }

  function renderMeta() {
    const event = state.event;
    document.title = `${event.name} — Regia Secret Santa`;
    UI.qs('#eventTitle').textContent = event.name;
    const bits = [`Organizzato da ${event.organizer}`];
    if (event.date) bits.push(UI.formatDate(event.date));
    if (event.location) bits.push(event.location);
    UI.qs('#eventMeta').textContent = bits.join(' · ');

    const total = event.participants.length;
    const photos = event.participants.filter((item) => item.photoUrl).length;
    const revealed = event.participants.filter((item) => item.revealedAt).length;
    UI.qs('#participantStat').textContent = total;
    UI.qs('#photoStat').textContent = photos;
    UI.qs('#revealStat').textContent = revealed;
    const days = UI.daysUntil(event.date);
    UI.qs('#dayStat').textContent = days === null ? '—' : days;

    const partyUrl = pathUrl(event.publicPath);
    for (const id of ['openParty', 'openPartyTop']) {
      const link = UI.qs(`#${id}`);
      link.href = partyUrl;
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }

  function inviteText(participant, link) {
    const dateText = state.event.date ? ` il ${UI.formatDate(state.event.date)}` : '';
    return `🎅 Ciao ${participant.name}!\n\nSei invitato/a a “${state.event.name}”${dateText}.\n\n🎁 Apri il tuo link personale:\n${link}\n\n📸 Carica o scatta una foto e scopri a chi dovrai fare il regalo.\n\n🔒 Il link è personale: non inoltrarlo. Buon Secret Santa! 🎄`;
  }

  function renderParticipants() {
    participantList.replaceChildren();
    state.event.participants.forEach((participant) => {
      const row = document.createElement('div');
      row.className = 'share-row';

      const person = document.createElement('div');
      person.className = 'share-person';
      const avatar = document.createElement('span');
      UI.mountAvatar(avatar, participant);
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = participant.name;
      const status = document.createElement('small');
      if (participant.revealedAt) {
        status.textContent = 'Pacchetto aperto';
        status.className = 'status-ready';
      } else if (participant.photoUrl) {
        status.textContent = 'Profilo pronto, pacchetto chiuso';
        status.className = 'status-waiting';
      } else {
        status.textContent = 'Invito non ancora completato';
        status.className = 'status-waiting';
      }
      const inviteState = document.createElement('small');
      inviteState.className = 'invite-open-state';
      if (openedInvites.has(participant.id)) {
        inviteState.textContent = 'WhatsApp già aperto da questo dispositivo';
      } else if (participant.phone) {
        inviteState.textContent = 'Chat WhatsApp pronta';
      } else {
        inviteState.textContent = 'Numero assente: scegli il contatto in WhatsApp';
      }
      copy.append(name, status, inviteState);
      person.append(avatar, copy);

      const link = pathUrl(participant.path);
      const linkField = document.createElement('div');
      linkField.className = 'link-field';
      linkField.textContent = link;
      linkField.title = link;

      const actions = document.createElement('div');
      actions.className = 'share-actions';
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'icon-button';
      copyButton.textContent = '⧉';
      copyButton.title = `Copia il link di ${participant.name}`;
      copyButton.addEventListener('click', () => UI.copyText(link, `Link di ${participant.name} copiato.`));

      const whatsApp = document.createElement('a');
      whatsApp.className = 'button whatsapp-share-button';
      if (openedInvites.has(participant.id)) whatsApp.classList.add('opened');
      whatsApp.dataset.whatsappId = participant.id;
      whatsApp.title = participant.phone
        ? `Apri la chat WhatsApp di ${participant.name} con il messaggio già pronto`
        : `Apri WhatsApp e scegli a chi inviare l'invito di ${participant.name}`;
      whatsApp.href = UI.whatsappUrl(participant.phone, inviteText(participant, link));
      whatsApp.target = '_blank';
      whatsApp.rel = 'noopener';
      const whatsIcon = document.createElement('span');
      whatsIcon.textContent = '💬';
      const whatsLabel = document.createElement('b');
      whatsLabel.textContent = participant.phone ? 'Apri WhatsApp' : 'Scegli contatto';
      whatsApp.append(whatsIcon, whatsLabel);
      whatsApp.addEventListener('click', () => {
        rememberWhatsAppOpened(participant.id);
        whatsApp.classList.add('opened');
        inviteState.textContent = 'WhatsApp aperto: conferma Invio nella chat';
      });

      actions.append(copyButton, whatsApp);
      row.append(person, linkField, actions);
      participantList.appendChild(row);
    });
  }

  function renderMessages() {
    const list = UI.qs('#adminMessageList');
    const messages = state.event.messages || [];
    UI.qs('#messageCount').textContent = `${messages.length} ${messages.length === 1 ? 'messaggio' : 'messaggi'}`;
    list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Il muro è ancora vuoto. Le prime renne stanno prendendo la rincorsa.';
      list.appendChild(empty);
      return;
    }
    [...messages].reverse().slice(0, 30).forEach((message) => {
      const row = document.createElement('div');
      row.className = 'admin-message';
      const emoji = document.createElement('span');
      emoji.textContent = message.emoji;
      const body = document.createElement('div');
      const author = document.createElement('b');
      author.textContent = `${message.author}: ${message.message}`;
      const time = document.createElement('small');
      time.textContent = UI.relativeTime(message.createdAt);
      body.append(author, time);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.title = 'Elimina messaggio';
      remove.addEventListener('click', async () => {
        try {
          await UI.api(`/api/admin/${adminToken}/messages/${message.id}`, { method: 'DELETE' });
          state.event.messages = state.event.messages.filter((item) => item.id !== message.id);
          renderMessages();
          UI.toast('Messaggio rimosso.');
        } catch (error) {
          UI.toast(error.message, 'error');
        }
      });
      row.append(emoji, body, remove);
      list.appendChild(row);
    });
  }

  function render() {
    renderMeta();
    renderParticipants();
    renderMessages();
  }

  function chooseBase(system) {
    datalist.replaceChildren();
    const candidates = [system.configuredBaseUrl, system.currentBaseUrl, ...(system.lanUrls || [])].filter(Boolean);
    [...new Set(candidates.map(cleanBase))].forEach((url) => {
      const option = document.createElement('option');
      option.value = url;
      datalist.appendChild(option);
    });
    if (system.configuredBaseUrl) return cleanBase(system.configuredBaseUrl);
    try {
      const currentHost = new URL(system.currentBaseUrl).hostname;
      if (['localhost', '127.0.0.1', '::1'].includes(currentHost) && system.lanUrls?.length) {
        return cleanBase(system.lanUrls[0]);
      }
    } catch (_error) {}
    return cleanBase(system.currentBaseUrl || window.location.origin);
  }

  async function refreshData() {
    const result = await UI.api(`/api/admin/${adminToken}`);
    state.event = result.event;
    render();
  }

  try {
    const [adminResult, systemResult] = await Promise.all([
      UI.api(`/api/admin/${adminToken}`),
      UI.api('/api/system'),
    ]);
    state.event = adminResult.event;
    state.system = systemResult;
    state.base = chooseBase(systemResult);
    shareBase.value = state.base;
    render();
    loading.hidden = true;
    app.hidden = false;
  } catch (error) {
    setLoadingError(error.message);
    return;
  }

  shareBase.addEventListener('change', () => {
    const value = cleanBase(shareBase.value);
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      state.base = value;
      renderMeta();
      renderParticipants();
      UI.toast('Link da condividere aggiornati.');
    } catch (_error) {
      UI.toast('Inserisci un indirizzo completo, ad esempio http://192.168.1.20:3000.', 'error');
      shareBase.value = state.base;
    }
  });

  UI.qs('#refreshBase').addEventListener('click', () => {
    state.base = window.location.origin;
    shareBase.value = state.base;
    renderMeta();
    renderParticipants();
  });

  UI.qs('#openNextWhatsApp').addEventListener('click', () => {
    const participant = state.event.participants.find((item) => !openedInvites.has(item.id));
    if (!participant) {
      UI.toast('Hai già aperto WhatsApp per tutti i partecipanti. Puoi comunque riaprire ogni chat dalla lista.');
      return;
    }
    const link = pathUrl(participant.path);
    rememberWhatsAppOpened(participant.id);
    renderParticipants();
    window.open(UI.whatsappUrl(participant.phone, inviteText(participant, link)), '_blank', 'noopener');
  });

  UI.qs('#copyParty').addEventListener('click', () => UI.copyText(pathUrl(state.event.publicPath), 'Link della dashboard copiato.'));
  UI.qs('#copyAdminLink').addEventListener('click', () => UI.copyText(window.location.href, 'Link admin copiato: conservalo con cura.'));
  UI.qs('#copyAllButton').addEventListener('click', () => {
    const content = state.event.participants
      .map((participant) => `${participant.name}: ${pathUrl(participant.path)}`)
      .join('\n');
    UI.copyText(content, 'Tutti i link personali sono stati copiati.');
  });

  UI.qs('#editEventButton').addEventListener('click', () => {
    editForm.elements.name.value = state.event.name;
    editForm.elements.organizer.value = state.event.organizer;
    editForm.elements.date.value = state.event.date || '';
    editForm.elements.location.value = state.event.location || '';
    editModal.showModal();
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await UI.api(`/api/admin/${adminToken}`, {
        method: 'PATCH',
        body: {
          name: editForm.elements.name.value,
          organizer: editForm.elements.organizer.value,
          date: editForm.elements.date.value,
          location: editForm.elements.location.value,
        },
      });
      editModal.close();
      await refreshData();
      UI.toast('Dettagli della festa aggiornati.');
    } catch (error) {
      UI.toast(error.message, 'error');
    }
  });

  UI.qs('#redrawButton').addEventListener('click', async () => {
    const confirmed = window.confirm('Vuoi davvero rifare tutti gli abbinamenti? I link personali resteranno uguali.');
    if (!confirmed) return;
    try {
      await UI.api(`/api/admin/${adminToken}/redraw`, { method: 'POST' });
      UI.toast('Nuovo sorteggio completato. Nessuno ha pescato sé stesso.');
      await refreshData();
    } catch (error) {
      UI.toast(error.message, 'error');
    }
  });
});
