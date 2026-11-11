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
  const openNextButton = UI.qs('#openNextInvite');
  let state = { event: null, system: null, base: window.location.origin };

  const cleanBase = (value) => String(value || '').trim().replace(/\/$/, '');
  const pathUrl = (path) => `${cleanBase(state.base)}${path}`;
  const inviteWasOpened = (participant) => participant.invite?.status === 'opened';

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
    const organizerText = event.organizerParticipates
      ? `Organizzato da ${event.organizer}, che partecipa anche al sorteggio`
      : `Organizzato da ${event.organizer}`;
    const bits = [organizerText];
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
    const locationText = state.event.location ? `\n📍 ${state.event.location}` : '';
    return `🎅 Ciao ${participant.name}!\n\nSei invitato/a a “${state.event.name}”${dateText}.${locationText}\n\n🎁 Apri il tuo link personale:\n${link}\n\n📸 Carica o scatta una foto e scopri a chi dovrai fare il regalo.\n\n🔒 Il link è personale: non inoltrarlo. Buon Secret Santa! 🎄`;
  }

  function renderSharingStatus() {
    const box = UI.qs('#sharingStatus');
    const eligible = state.event.participants.filter((participant) => participant.phone);
    const opened = eligible.filter(inviteWasOpened).length;
    const pending = eligible.length - opened;
    box.className = 'automation-status ready';
    box.replaceChildren();

    const icon = document.createElement('span');
    icon.className = 'automation-status-icon';
    icon.textContent = pending ? '💬' : '✅';
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = pending
      ? `${opened}/${eligible.length} chat WhatsApp aperte`
      : 'Tutte le chat sono state aperte';
    const text = document.createElement('p');
    text.textContent = pending
      ? 'Il sito prepara destinatario, testo e link. Dentro WhatsApp resta soltanto da premere Invia.'
      : 'Controlla di avere premuto Invia in ogni chat: il sito non può leggere lo stato reale del messaggio.';
    body.append(title, text);
    box.append(icon, body);

    openNextButton.disabled = pending === 0;
    openNextButton.textContent = pending ? `Apri il prossimo (${pending})` : 'Inviti completati';
  }

  async function markInviteOpened(participant) {
    const previous = participant.invite || {};
    const now = new Date().toISOString();
    participant.invite = {
      status: 'opened',
      openedAt: previous.openedAt || now,
      updatedAt: now,
      openCount: Number(previous.openCount || 0) + 1,
    };
    renderParticipants();
    renderSharingStatus();
    try {
      const result = await UI.api(`/api/admin/${adminToken}/invites/${participant.id}/opened`, { method: 'POST' });
      participant.invite = result.invite;
      renderParticipants();
      renderSharingStatus();
    } catch (error) {
      UI.toast(`WhatsApp è stato aperto, ma non sono riuscito a salvare la spunta: ${error.message}`, 'error');
    }
  }

  async function resetInviteOpened(participant) {
    try {
      const result = await UI.api(`/api/admin/${adminToken}/invites/${participant.id}/reset`, { method: 'POST' });
      participant.invite = result.invite;
      renderParticipants();
      renderSharingStatus();
      UI.toast(`${participant.name} è di nuovo tra gli inviti da aprire.`);
    } catch (error) {
      UI.toast(error.message, 'error');
    }
  }

  function launchWhatsApp(participant) {
    if (!participant.phone) {
      UI.toast(`Aggiungi prima il numero WhatsApp di ${participant.name}.`, 'error');
      return;
    }
    const link = pathUrl(participant.path);
    const launcher = document.createElement('a');
    launcher.href = UI.whatsappUrl(participant.phone, inviteText(participant, link));
    launcher.target = '_blank';
    launcher.rel = 'noopener noreferrer';
    launcher.hidden = true;
    document.body.appendChild(launcher);
    launcher.click();
    launcher.remove();
    window.setTimeout(() => markInviteOpened(participant), 0);
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
      const nameLine = document.createElement('div');
      nameLine.className = 'participant-name-line';
      const name = document.createElement('strong');
      name.textContent = participant.name;
      nameLine.appendChild(name);
      if (participant.isOrganizer) {
        const badge = document.createElement('span');
        badge.className = 'organizer-badge';
        badge.textContent = 'Admin';
        nameLine.appendChild(badge);
      }

      const profileStatus = document.createElement('small');
      if (participant.revealedAt) {
        profileStatus.textContent = 'Pacchetto aperto';
        profileStatus.className = 'status-ready';
      } else if (participant.photoUrl) {
        profileStatus.textContent = 'Profilo pronto, pacchetto chiuso';
        profileStatus.className = 'status-waiting';
      } else {
        profileStatus.textContent = 'Invito non ancora completato';
        profileStatus.className = 'status-waiting';
      }

      const inviteState = document.createElement('small');
      if (!participant.phone) {
        inviteState.className = 'invite-delivery-state failed';
        inviteState.textContent = 'Numero WhatsApp mancante';
      } else if (inviteWasOpened(participant)) {
        inviteState.className = 'invite-delivery-state delivered';
        const when = participant.invite.openedAt ? ` · ${UI.relativeTime(participant.invite.openedAt)}` : '';
        inviteState.textContent = `Chat WhatsApp aperta${when}`;
        inviteState.title = 'Questa spunta indica che la chat è stata aperta, non che WhatsApp abbia confermato la consegna.';
      } else {
        inviteState.className = 'invite-delivery-state idle';
        inviteState.textContent = 'Da invitare su WhatsApp';
      }
      copy.append(nameLine, profileStatus, inviteState);
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
      actions.appendChild(copyButton);

      const phoneButton = document.createElement('button');
      phoneButton.type = 'button';
      phoneButton.className = 'icon-button invite-phone-button';
      phoneButton.textContent = '✎';
      phoneButton.title = `Modifica il numero WhatsApp di ${participant.name}`;
      phoneButton.addEventListener('click', async () => {
        const value = window.prompt(`Numero WhatsApp di ${participant.name}`, participant.phone || '+39 ');
        if (value === null) return;
        phoneButton.disabled = true;
        try {
          const result = await UI.api(`/api/admin/${adminToken}/participants/${participant.id}`, {
            method: 'PATCH',
            body: { phone: value },
          });
          participant.phone = result.phone;
          participant.invite = result.invite;
          renderParticipants();
          renderSharingStatus();
          UI.toast(`Numero di ${participant.name} aggiornato.`);
        } catch (error) {
          UI.toast(error.message, 'error');
          phoneButton.disabled = false;
        }
      });
      actions.appendChild(phoneButton);

      if (inviteWasOpened(participant)) {
        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'icon-button invite-refresh-button';
        resetButton.textContent = '↺';
        resetButton.title = `Segna ${participant.name} come ancora da invitare`;
        resetButton.addEventListener('click', () => resetInviteOpened(participant));
        actions.appendChild(resetButton);
      }

      const whatsAppButton = document.createElement('a');
      whatsAppButton.className = `button whatsapp-share-button${inviteWasOpened(participant) ? ' opened' : ''}`;
      whatsAppButton.href = participant.phone ? UI.whatsappUrl(participant.phone, inviteText(participant, link)) : '#';
      whatsAppButton.target = '_blank';
      whatsAppButton.rel = 'noopener noreferrer';
      whatsAppButton.title = participant.phone
        ? `Apri la chat WhatsApp di ${participant.name} con il messaggio già pronto`
        : 'Aggiungi prima un numero WhatsApp';
      whatsAppButton.setAttribute('aria-disabled', participant.phone ? 'false' : 'true');
      whatsAppButton.innerHTML = `<span>💬</span><b>${inviteWasOpened(participant) ? 'Apri di nuovo' : 'Apri WhatsApp'}</b>`;
      whatsAppButton.addEventListener('click', (event) => {
        if (!participant.phone) {
          event.preventDefault();
          UI.toast(`Aggiungi prima il numero WhatsApp di ${participant.name}.`, 'error');
          return;
        }
        window.setTimeout(() => markInviteOpened(participant), 0);
      });
      actions.appendChild(whatsAppButton);

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
    renderSharingStatus();
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
    return cleanBase(system.configuredBaseUrl || system.currentBaseUrl || window.location.origin);
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

  UI.qs('#refreshBase').addEventListener('click', () => {
    state.base = cleanBase(state.system?.configuredBaseUrl || window.location.origin);
    shareBase.value = state.base;
    renderMeta();
    renderParticipants();
    UI.toast('Dominio dei link aggiornato.');
  });

  openNextButton.addEventListener('click', () => {
    const next = state.event.participants.find((participant) => participant.phone && !inviteWasOpened(participant));
    if (!next) {
      UI.toast('Hai già aperto tutte le chat. Controlla di avere premuto Invia in WhatsApp.');
      return;
    }
    launchWhatsApp(next);
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
