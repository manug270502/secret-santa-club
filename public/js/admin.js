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
  const sendAllButton = UI.qs('#sendAllInvites');
  const refreshStatusesButton = UI.qs('#refreshInviteStatuses');
  let state = { event: null, system: null, base: window.location.origin };

  const cleanBase = (value) => String(value || '').trim().replace(/\/$/, '');
  const pathUrl = (path) => `${cleanBase(state.base)}${path}`;
  const activeInviteStatuses = new Set(['accepted', 'scheduled', 'queued', 'sending', 'sent', 'delivered', 'read']);

  function automationConfigured() {
    return Boolean(state.system?.whatsappAutomation?.configured);
  }

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
    return `🎅 Ciao ${participant.name}!\n\nSei invitato/a a “${state.event.name}”${dateText}.\n\n🎁 Apri il tuo link personale:\n${link}\n\n📸 Carica o scatta una foto e scopri a chi dovrai fare il regalo.\n\n🔒 Il link è personale: non inoltrarlo. Buon Secret Santa! 🎄`;
  }

  function inviteStatus(invite = {}) {
    const map = {
      not_sent: ['Da inviare', 'idle'],
      accepted: ['Accettato da Twilio', 'pending'],
      queued: ['In coda', 'pending'],
      sending: ['In invio', 'pending'],
      sent: ['Inviato', 'sent'],
      delivered: ['Consegnato', 'delivered'],
      read: ['Letto', 'read'],
      failed: ['Invio fallito', 'failed'],
      undelivered: ['Non consegnato', 'failed'],
      canceled: ['Annullato', 'failed'],
      scheduled: ['Programmato', 'pending'],
    };
    return map[invite.status] || map.not_sent;
  }

  function renderAutomationStatus() {
    const box = UI.qs('#automationStatus');
    const config = state.system?.whatsappAutomation || {};
    box.className = 'automation-status';
    box.replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'automation-status-icon';
    const body = document.createElement('div');
    const title = document.createElement('strong');
    const text = document.createElement('p');

    if (config.configured) {
      box.classList.add('ready');
      icon.textContent = '⚡';
      title.textContent = 'Invio automatico Twilio attivo';
      text.textContent = config.mode === 'template'
        ? 'Gli inviti partono direttamente dal sito con il template WhatsApp configurato.'
        : 'Modalità free-form di test attiva: usala solo con Sandbox o conversazioni già aperte.';
    } else {
      box.classList.add('warning');
      icon.textContent = '⚙️';
      title.textContent = 'Twilio non è ancora configurato';
      const missing = Array.isArray(config.missing) && config.missing.length
        ? ` Mancano: ${config.missing.join(', ')}.`
        : '';
      text.textContent = `Aggiungi le variabili ambiente su Netlify e pubblica un nuovo deploy.${missing} Nel frattempo resta disponibile l’apertura manuale di WhatsApp.`;
    }
    body.append(title, text);
    box.append(icon, body);
    sendAllButton.disabled = !config.configured;
    refreshStatusesButton.disabled = !config.configured;
  }

  async function sendInvite(participant, force = false) {
    const result = await UI.api(`/api/admin/${adminToken}/invites/${participant.id}/send`, {
      method: 'POST',
      body: { force },
    });
    participant.invite = result.invite;
    return result.invite;
  }

  async function refreshInvite(participant) {
    const result = await UI.api(`/api/admin/${adminToken}/invites/${participant.id}/refresh`, { method: 'POST' });
    participant.invite = result.invite;
    return result.invite;
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

      const [inviteLabel, inviteClass] = inviteStatus(participant.invite);
      const inviteState = document.createElement('small');
      inviteState.className = `invite-delivery-state ${inviteClass}`;
      inviteState.textContent = participant.phone ? `WhatsApp: ${inviteLabel}` : 'Numero WhatsApp mancante';
      if (participant.invite?.errorMessage) inviteState.title = participant.invite.errorMessage;
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
          UI.toast(`Numero di ${participant.name} aggiornato. L’invito è pronto per un nuovo invio.`);
        } catch (error) {
          UI.toast(error.message, 'error');
          phoneButton.disabled = false;
        }
      });
      actions.appendChild(phoneButton);

      if (automationConfigured()) {
        if (participant.invite?.messageSid) {
          const refreshButton = document.createElement('button');
          refreshButton.type = 'button';
          refreshButton.className = 'icon-button invite-refresh-button';
          refreshButton.textContent = '↻';
          refreshButton.title = `Aggiorna la consegna per ${participant.name}`;
          refreshButton.addEventListener('click', async () => {
            refreshButton.disabled = true;
            try {
              await refreshInvite(participant);
              renderParticipants();
              UI.toast(`Stato di ${participant.name} aggiornato.`);
            } catch (error) {
              UI.toast(error.message, 'error');
            } finally {
              refreshButton.disabled = false;
            }
          });
          actions.appendChild(refreshButton);
        }

        const sendButton = document.createElement('button');
        sendButton.type = 'button';
        sendButton.className = 'button invite-send-button';
        const sentBefore = activeInviteStatuses.has(participant.invite?.status);
        const retryable = new Set(['failed', 'undelivered', 'canceled']).has(participant.invite?.status);
        sendButton.textContent = sentBefore ? 'Reinvia' : retryable ? 'Riprova' : 'Invia ora';
        sendButton.disabled = !participant.phone;
        sendButton.title = participant.phone
          ? `Invia automaticamente l’invito WhatsApp a ${participant.name}`
          : 'Aggiungi prima un numero WhatsApp';
        sendButton.addEventListener('click', async () => {
          const force = activeInviteStatuses.has(participant.invite?.status);
          if (force && !window.confirm(`Vuoi reinviare l’invito a ${participant.name}?`)) return;
          sendButton.disabled = true;
          const original = sendButton.textContent;
          sendButton.textContent = 'Invio…';
          try {
            await sendInvite(participant, force);
            renderParticipants();
            UI.toast(`Invito di ${participant.name} affidato a Twilio.`);
          } catch (error) {
            await refreshData().catch(() => {});
            UI.toast(error.message, 'error');
            sendButton.disabled = false;
            sendButton.textContent = original;
          }
        });
        actions.appendChild(sendButton);
      } else {
        const whatsApp = document.createElement('a');
        whatsApp.className = 'button whatsapp-share-button';
        whatsApp.title = participant.phone
          ? `Apri la chat WhatsApp di ${participant.name} con il messaggio già pronto`
          : `Apri WhatsApp e scegli il destinatario per ${participant.name}`;
        whatsApp.href = UI.whatsappUrl(participant.phone, inviteText(participant, link));
        whatsApp.target = '_blank';
        whatsApp.rel = 'noopener';
        whatsApp.innerHTML = '<span>💬</span><b>Apri WhatsApp</b>';
        actions.appendChild(whatsApp);
      }

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
    renderAutomationStatus();
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

  sendAllButton.addEventListener('click', async () => {
    const pending = state.event.participants.filter((participant) =>
      participant.phone && !activeInviteStatuses.has(participant.invite?.status));
    if (!pending.length) {
      UI.toast('Non ci sono nuovi inviti da inviare. Usa “Reinvia” sulla singola persona se serve.');
      return;
    }
    if (!window.confirm(`Inviare automaticamente ${pending.length} inviti WhatsApp tramite Twilio?`)) return;

    sendAllButton.disabled = true;
    refreshStatusesButton.disabled = true;
    const original = sendAllButton.textContent;
    let completed = 0;
    let failed = 0;
    for (const participant of pending) {
      sendAllButton.textContent = `Invio ${completed + failed + 1}/${pending.length}…`;
      try {
        await sendInvite(participant, false);
        completed += 1;
      } catch (_error) {
        failed += 1;
      }
      renderParticipants();
    }
    sendAllButton.textContent = original;
    sendAllButton.disabled = !automationConfigured();
    refreshStatusesButton.disabled = !automationConfigured();
    if (failed) UI.toast(`${completed} inviti avviati, ${failed} non riusciti. Controlla le righe evidenziate.`, 'error');
    else UI.toast(`${completed} inviti affidati a Twilio.`);
    await refreshData().catch(() => {});
  });

  refreshStatusesButton.addEventListener('click', async () => {
    const sent = state.event.participants.filter((participant) => participant.invite?.messageSid);
    if (!sent.length) {
      UI.toast('Non ci sono ancora inviti Twilio da controllare.');
      return;
    }
    refreshStatusesButton.disabled = true;
    const original = refreshStatusesButton.textContent;
    let failures = 0;
    for (let index = 0; index < sent.length; index += 1) {
      refreshStatusesButton.textContent = `Controllo ${index + 1}/${sent.length}…`;
      try {
        await refreshInvite(sent[index]);
      } catch (_error) {
        failures += 1;
      }
      renderParticipants();
    }
    refreshStatusesButton.textContent = original;
    refreshStatusesButton.disabled = !automationConfigured();
    UI.toast(failures ? `Stati aggiornati, con ${failures} controlli non riusciti.` : 'Stati di consegna aggiornati.', failures ? 'error' : 'success');
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
