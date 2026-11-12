document.addEventListener('DOMContentLoaded', () => {
  const UI = window.ChristmasUI;
  const loginView = UI.qs('#superAdminLogin');
  const appView = UI.qs('#superAdminApp');
  const loginForm = UI.qs('#superAdminLoginForm');
  const loginError = UI.qs('#superAdminLoginError');
  const roomDialog = UI.qs('#roomDialog');
  const roomTableBody = UI.qs('#roomTableBody');
  const roomSearch = UI.qs('#roomSearch');
  const roomStatusFilter = UI.qs('#roomStatusFilter');
  const state = {
    csrfToken: '',
    username: '',
    overview: null,
    currentRoom: null,
    searchTimer: null,
    startedAt: 0,
    roomOpenRequestId: 0,
    roomAbortController: null,
  };

  const statusLabels = {
    active: 'Attiva',
    blocked: 'Bloccata',
    completed: 'Conclusa',
    archived: 'Archiviata',
    trashed: 'Cestino',
  };

  const actionLabels = {
    login_success: 'Accesso riuscito',
    login_failed: 'Accesso fallito',
    logout: 'Disconnessione',
    event_updated: 'Stanza aggiornata',
    event_duplicated: 'Stanza duplicata',
    event_repaired: 'Indici riparati',
    event_trashed: 'Stanza nel cestino',
    event_restored: 'Stanza ripristinata',
    event_purged: 'Stanza eliminata',
    event_exported: 'Dati esportati',
    participant_updated: 'Partecipante aggiornato',
    participant_deleted: 'Partecipante eliminato',
    participant_recovery_regenerated: 'Codice rigenerato',
    participant_link_regenerated: 'Link rigenerato',
    participant_photo_removed: 'Foto rimossa',
    message_deleted: 'Messaggio eliminato',
    system_settings_updated: 'Impostazioni globali aggiornate',
    event_status_active: 'Stanza riattivata',
    event_status_blocked: 'Stanza bloccata',
    event_status_completed: 'Stanza conclusa',
    event_status_archived: 'Stanza archiviata',
    event_status_trashed: 'Stanza spostata nel cestino',
    orphan_catalog_removed: 'Voce orfana rimossa',
  };

  function clearRoomSelection() {
    state.currentRoom = null;
    roomDialog.removeAttribute('data-room-id');
    roomDialog.removeAttribute('data-room-name');
    roomDialog.removeAttribute('data-room-updated-at');
  }

  function closeRoomDialog() {
    if (roomDialog?.open) roomDialog.close();
    else clearRoomSelection();
  }

  function currentRoomSnapshot() {
    const room = state.currentRoom;
    if (!room || !roomDialog.open || roomDialog.dataset.roomId !== room.id) return null;
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      updatedAt: room.updatedAt,
    };
  }

  function showLogin(message = '') {
    state.roomOpenRequestId += 1;
    state.roomAbortController?.abort();
    state.roomAbortController = null;
    loginView.hidden = false;
    appView.hidden = true;
    loginError.textContent = message;
    closeRoomDialog();
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    UI.qs('#superAdminUser').textContent = state.username || 'Super admin';
  }

  async function request(path, options = {}) {
    const config = { ...options, headers: { ...(options.headers || {}) } };
    if (config.body && !(config.body instanceof FormData) && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    if (!['GET', 'HEAD'].includes(String(config.method || 'GET').toUpperCase()) && state.csrfToken) {
      config.headers['X-CSRF-Token'] = state.csrfToken;
    }
    const response = await fetch(path, config);
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(payload?.error || `Richiesta non riuscita (${response.status}).`);
      error.status = response.status;
      error.code = payload?.code || '';
      if (response.status === 401) showLogin('La sessione è scaduta. Accedi di nuovo.');
      throw error;
    }
    return payload;
  }

  function setBusy(button, busy, label = '') {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label || 'Operazione…';
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    }
  }

  function statusPill(status) {
    const pill = document.createElement('span');
    pill.className = `status-pill ${status || 'active'}`;
    pill.textContent = statusLabels[status] || status || 'Attiva';
    return pill;
  }

  function formatShortDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function formatEventDate(value) {
    return value ? UI.formatDate(value) : 'data da decidere';
  }

  function metric(id, value) {
    UI.qs(`#${id}`).textContent = new Intl.NumberFormat('it-IT').format(Number(value) || 0);
  }

  function renderMetrics(metrics) {
    metric('metricRooms', metrics.roomsTotal);
    metric('metricParticipants', metrics.participants);
    metric('metricPhotos', metrics.photos);
    metric('metricProfiles', metrics.profiles);
    metric('metricReveals', metrics.reveals);
    metric('metricMessages', metrics.messages);
    UI.qs('#metricRoomsDetail').textContent = `${metrics.roomsActive} attive · ${metrics.roomsBlocked} bloccate`;
  }

  function renderSystemSettings(settings) {
    const form = UI.qs('#systemSettingsForm');
    ['allowEventCreation', 'allowRecovery', 'allowPhotoUploads', 'allowWallMessages', 'maintenanceMode']
      .forEach((name) => { form.elements[name].checked = Boolean(settings[name]); });
    form.elements.maintenanceMessage.value = settings.maintenanceMessage || '';
    const pill = UI.qs('#systemModePill');
    pill.className = `status-pill ${settings.maintenanceMode ? 'blocked' : 'active'}`;
    pill.textContent = settings.maintenanceMode ? 'Manutenzione' : 'Operativo';
  }

  function renderDistribution(metrics) {
    const container = UI.qs('#statusDistribution');
    container.replaceChildren();
    const rows = [
      ['active', metrics.roomsActive],
      ['blocked', metrics.roomsBlocked],
      ['completed', metrics.roomsCompleted],
      ['archived', metrics.roomsArchived],
      ['trashed', metrics.roomsTrashed],
    ];
    const total = Math.max(1, rows.reduce((sum, [, value]) => sum + Number(value || 0), 0));
    rows.forEach(([status, value]) => {
      const row = document.createElement('div');
      row.className = 'distribution-row';
      const label = document.createElement('div');
      label.append(statusPill(status));
      const count = document.createElement('strong');
      count.textContent = value;
      label.appendChild(count);
      const track = document.createElement('span');
      track.className = 'distribution-track';
      const fill = document.createElement('i');
      fill.className = status;
      fill.style.width = `${Math.round((Number(value || 0) / total) * 100)}%`;
      track.appendChild(fill);
      row.append(label, track);
      container.appendChild(row);
    });
  }

  function progressPercent(room) {
    if (!room.participantCount) return 0;
    return Math.round((room.profileCount / room.participantCount) * 100);
  }

  function renderRooms(rooms) {
    roomTableBody.replaceChildren();
    UI.qs('#roomResultCount').textContent = `${rooms.length} ${rooms.length === 1 ? 'stanza trovata' : 'stanze trovate'}`;
    UI.qs('#roomEmpty').hidden = rooms.length > 0;
    rooms.forEach((room) => {
      const row = document.createElement('tr');
      row.dataset.roomId = room.id;

      const roomCell = document.createElement('td');
      const roomTitle = document.createElement('button');
      roomTitle.className = 'room-name-button';
      roomTitle.type = 'button';
      roomTitle.textContent = room.name;
      roomTitle.addEventListener('click', () => openRoom(room.id));
      const roomMeta = document.createElement('small');
      roomMeta.textContent = `${room.organizer} · ${formatEventDate(room.date)}${room.location ? ` · ${room.location}` : ''}`;
      roomCell.append(roomTitle, roomMeta);

      const statusCell = document.createElement('td');
      statusCell.appendChild(statusPill(room.status));
      if (room.statusReason) {
        const reason = document.createElement('small');
        reason.textContent = room.statusReason;
        statusCell.appendChild(reason);
      }

      const participantCell = document.createElement('td');
      const participantStrong = document.createElement('strong');
      participantStrong.textContent = room.participantCount;
      const participantSmall = document.createElement('small');
      participantSmall.textContent = `${room.photoCount} foto · ${room.revealedCount} reveal`;
      participantCell.append(participantStrong, participantSmall);

      const completionCell = document.createElement('td');
      const progress = document.createElement('div');
      progress.className = 'room-completion';
      const label = document.createElement('span');
      label.textContent = `${room.profileCount}/${room.participantCount} profili`;
      const bar = document.createElement('i');
      const fill = document.createElement('b');
      fill.style.width = `${progressPercent(room)}%`;
      bar.appendChild(fill);
      progress.append(label, bar);
      completionCell.appendChild(progress);

      const updatedCell = document.createElement('td');
      updatedCell.textContent = formatShortDate(room.updatedAt || room.createdAt);

      const actionCell = document.createElement('td');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'button button-small button-ghost-dark';
      open.textContent = 'Gestisci';
      open.addEventListener('click', () => openRoom(room.id));
      actionCell.appendChild(open);

      row.append(roomCell, statusCell, participantCell, completionCell, updatedCell, actionCell);
      roomTableBody.appendChild(row);
    });
  }

  function renderAudit(entries) {
    const list = UI.qs('#auditList');
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Il registro è ancora vuoto.';
      list.appendChild(empty);
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement('article');
      row.className = `audit-row ${entry.outcome === 'failed' ? 'failed' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'audit-icon';
      icon.textContent = entry.outcome === 'failed' ? '!' : '✓';
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = actionLabels[entry.action] || entry.action || 'Operazione';
      const detail = document.createElement('p');
      detail.textContent = [entry.eventName, entry.detail].filter(Boolean).join(' · ');
      const meta = document.createElement('small');
      meta.textContent = `${formatShortDate(entry.createdAt)} · ${entry.actor || 'super-admin'}`;
      body.append(title, detail, meta);
      row.append(icon, body);
      list.appendChild(row);
    });
  }

  async function loadOverview({ refreshCatalog = false, silent = false } = {}) {
    const button = UI.qs('#superAdminRefresh');
    if (!silent) setBusy(button, true, 'Aggiorno…');
    const start = performance.now();
    try {
      const query = new URLSearchParams();
      if (roomSearch.value.trim()) query.set('q', roomSearch.value.trim());
      if (roomStatusFilter.value && roomStatusFilter.value !== 'all') query.set('status', roomStatusFilter.value);
      if (refreshCatalog) query.set('refresh', 'true');
      const result = await request(`/api/super-admin/overview?${query.toString()}`);
      state.overview = result;
      renderMetrics(result.metrics);
      renderSystemSettings(result.settings);
      renderDistribution(result.metrics);
      renderRooms(result.rooms);
      renderAudit(result.audit);
      const elapsed = Math.round(performance.now() - start);
      UI.qs('#healthLabel').textContent = 'Online';
      UI.qs('#healthDetail').textContent = `${result.rooms.length} record caricati in ${elapsed} ms`;
    } catch (error) {
      if (error.status !== 401) {
        UI.qs('#healthLabel').textContent = 'Errore';
        UI.qs('#healthDetail').textContent = error.message;
        UI.toast(error.message, 'error');
      }
    } finally {
      if (!silent) setBusy(button, false);
    }
  }

  function setSecret(element, value, masked = true) {
    element.dataset.secretValue = value || '—';
    element.dataset.revealed = masked ? 'false' : 'true';
    element.textContent = masked ? '••••••••••••' : (value || '—');
    element.classList.toggle('masked-secret', masked);
  }

  function toggleSecret(element, button) {
    const reveal = element.dataset.revealed !== 'true';
    element.dataset.revealed = reveal ? 'true' : 'false';
    element.textContent = reveal ? (element.dataset.secretValue || '—') : '••••••••••••';
    element.classList.toggle('masked-secret', !reveal);
    button.textContent = reveal ? '🙈' : '👁';
    button.setAttribute('aria-label', reveal ? 'Nascondi dato' : 'Mostra dato');
  }

  function roomProfileSummary(participant) {
    const bits = [];
    const profile = participant.giftProfile || {};
    if (profile.favoriteColor) bits.push(UI.giftLabel('colors', profile.favoriteColor));
    if (profile.interests?.length) bits.push(profile.interests.map((item) => UI.giftLabel('interests', item)).join(', '));
    if (profile.giftStyle) bits.push(UI.giftLabel('styles', profile.giftStyle));
    if (participant.wish) bits.push(`“${participant.wish}”`);
    return bits.join(' · ') || 'Preferenze non ancora compilate';
  }

  function createSecretRow(labelText, value, className = '') {
    const row = document.createElement('div');
    row.className = `participant-secret-row ${className}`.trim();
    const label = document.createElement('span');
    label.textContent = labelText;
    const code = document.createElement('code');
    setSecret(code, value, true);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eye-button';
    button.textContent = '👁';
    button.setAttribute('aria-label', `Mostra ${labelText.toLowerCase()}`);
    button.addEventListener('click', () => toggleSecret(code, button));
    row.append(label, code, button);
    return row;
  }

  function renderParticipants(room) {
    const list = UI.qs('#superParticipantList');
    list.replaceChildren();
    room.participants.forEach((participant) => {
      const card = document.createElement('article');
      card.className = 'super-participant-card';

      const header = document.createElement('header');
      const avatar = document.createElement('span');
      UI.mountAvatar(avatar, participant, 'avatar-large');
      const identity = document.createElement('div');
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
      const status = document.createElement('small');
      status.textContent = `${participant.photoUrl ? 'Foto presente' : 'Senza foto'} · ${participant.revealedAt ? 'Abbinamento visto' : 'Pacchetto chiuso'}`;
      identity.append(nameLine, status);
      header.append(avatar, identity);

      const profile = document.createElement('p');
      profile.className = 'participant-profile-summary';
      profile.textContent = roomProfileSummary(participant);

      const secrets = document.createElement('div');
      secrets.className = 'participant-secrets';
      secrets.append(
        createSecretRow('Telefono', participant.phone || '—'),
        createSecretRow('Codice elfo', participant.recoveryCode || '—'),
        createSecretRow('Token invito', participant.token || '—'),
        createSecretRow('Regalo per', participant.assignedName || 'Assegnazione non valida', 'assignment-secret'),
      );

      const actions = document.createElement('div');
      actions.className = 'participant-admin-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'button button-small button-ghost-dark';
      edit.textContent = 'Modifica';
      edit.addEventListener('click', () => editParticipant(participant));
      const code = document.createElement('button');
      code.type = 'button';
      code.className = 'button button-small button-ghost-dark';
      code.textContent = 'Nuovo codice';
      code.addEventListener('click', () => regenerateRecoveryCode(participant, code));
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'button button-small button-ghost-dark';
      link.textContent = 'Nuovo link';
      link.addEventListener('click', () => regenerateLink(participant, link));
      actions.append(edit, code, link);
      if (participant.photoUrl) {
        const photo = document.createElement('button');
        photo.type = 'button';
        photo.className = 'button button-small button-ghost-dark';
        photo.textContent = 'Rimuovi foto';
        photo.addEventListener('click', () => removePhoto(participant, photo));
        actions.appendChild(photo);
      }
      if (!participant.isOrganizer) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button button-small button-danger-soft';
        remove.textContent = 'Elimina';
        remove.addEventListener('click', () => deleteParticipant(participant, remove));
        actions.appendChild(remove);
      }
      card.append(header, profile, secrets, actions);
      list.appendChild(card);
    });
  }

  function renderAssignments(room) {
    const health = UI.qs('#assignmentHealth');
    health.className = `assignment-health ${room.assignmentHealth.valid ? 'healthy' : 'broken'}`;
    health.replaceChildren();
    const icon = document.createElement('span');
    icon.textContent = room.assignmentHealth.valid ? '✓' : '!';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = room.assignmentHealth.valid ? 'Sorteggio coerente' : 'Il sorteggio richiede attenzione';
    const detail = document.createElement('p');
    detail.textContent = room.assignmentHealth.valid
      ? 'Ogni partecipante ha un destinatario unico e nessuno ha pescato sé stesso.'
      : 'Usa “Ripara indici” per tentare una correzione sicura prima delle rivelazioni.';
    copy.append(title, detail);
    health.append(icon, copy);

    const list = UI.qs('#assignmentList');
    list.replaceChildren();
    room.participants.forEach((participant) => {
      const row = document.createElement('div');
      row.className = 'assignment-row';
      const giver = document.createElement('strong');
      giver.textContent = participant.name;
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      const receiver = document.createElement('code');
      setSecret(receiver, participant.assignedName || 'Assegnazione non valida', true);
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'eye-button';
      eye.textContent = '👁';
      eye.addEventListener('click', () => toggleSecret(receiver, eye));
      row.append(giver, arrow, receiver, eye);
      list.appendChild(row);
    });
  }

  function renderMessages(room) {
    const list = UI.qs('#superMessageList');
    list.replaceChildren();
    if (!room.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Il muro degli auguri è vuoto.';
      list.appendChild(empty);
      return;
    }
    room.messages.forEach((message) => {
      const row = document.createElement('article');
      row.className = 'super-message-row';
      const emoji = document.createElement('span');
      emoji.textContent = message.emoji || '✨';
      const body = document.createElement('div');
      const text = document.createElement('strong');
      text.textContent = `${message.author}: ${message.message}`;
      const time = document.createElement('small');
      time.textContent = formatShortDate(message.createdAt);
      body.append(text, time);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.title = 'Elimina messaggio';
      remove.addEventListener('click', () => deleteMessage(message, remove));
      row.append(emoji, body, remove);
      list.appendChild(row);
    });
  }

  function fillRoomForm(room) {
    const form = UI.qs('#roomEditForm');
    form.elements.name.value = room.name;
    form.elements.organizer.value = room.organizer;
    form.elements.date.value = room.date || '';
    form.elements.budget.value = Number.isInteger(room.budgetCents)
      ? String(room.budgetCents / 100).replace('.', ',')
      : '';
    form.elements.location.value = room.location || '';
    ['allowMessages', 'allowPhotoUploads', 'allowRecovery', 'allowParticipantEdits', 'allowReveal']
      .forEach((name) => { form.elements[name].checked = Boolean(room.policies[name]); });
  }

  function renderRoom(room) {
    state.currentRoom = room;
    roomDialog.dataset.roomId = room.id;
    roomDialog.dataset.roomName = room.name;
    roomDialog.dataset.roomUpdatedAt = room.updatedAt || '';
    UI.qs('#roomDialogTitle').textContent = room.name;
    UI.qs('#roomDialogMeta').textContent = `${room.organizer} · ${formatEventDate(room.date)}${room.location ? ` · ${room.location}` : ''} · ${room.participants.length} partecipanti`;
    const status = UI.qs('#roomDialogStatus');
    status.className = `status-pill ${room.status}`;
    status.textContent = statusLabels[room.status] || room.status;
    UI.qs('#roomOpenAdmin').href = room.adminUrl;
    UI.qs('#roomOpenPublic').href = room.publicUrl;
    UI.qs('#roomExportCsv').href = `/api/super-admin/events/${room.id}/export?format=csv`;
    UI.qs('#roomExportJson').href = `/api/super-admin/events/${room.id}/export?format=json`;
    UI.qs('#roomStatusSelect').value = room.status;
    UI.qs('#roomStatusReason').value = room.statusReason || '';
    UI.qs('#restoreRoom').hidden = room.status !== 'trashed';
    UI.qs('#purgeRoom').hidden = room.status !== 'trashed';
    UI.qs('#applyRoomStatus').hidden = room.status === 'trashed';
    fillRoomForm(room);
    UI.qs('#roomEventId').textContent = room.id;
    setSecret(UI.qs('#roomAdminToken'), room.adminToken, true);
    setSecret(UI.qs('#roomPublicToken'), room.publicToken, true);
    renderParticipants(room);
    renderAssignments(room);
    renderMessages(room);
  }

  async function openRoom(roomId) {
    const requestId = ++state.roomOpenRequestId;
    state.roomAbortController?.abort();
    const controller = new AbortController();
    state.roomAbortController = controller;
    clearRoomSelection();
    try {
      const result = await request(`/api/super-admin/events/${roomId}`, { signal: controller.signal });
      if (requestId !== state.roomOpenRequestId || controller.signal.aborted) return;
      renderRoom(result.event);
      roomDialog.showModal();
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted || requestId !== state.roomOpenRequestId) return;
      if (error.status === 404) {
        try {
          const result = await request(`/api/super-admin/orphans/${roomId}`);
          const orphan = result.orphan;
          const room = orphan.catalog;
          const backupLine = orphan.backups?.length
            ? `Sono presenti ${orphan.backups.length} backup tecnici associati.`
            : 'Non risultano backup tecnici associati.';
          const remove = window.confirm([
            `La stanza “${room.name}” non ha più un record dati.`,
            `ID: ${roomId}`,
            backupLine,
            '',
            'È rimasta soltanto una voce fantasma nel catalogo.',
            'Premi OK per rimuovere esclusivamente questa voce dall’elenco.',
          ].join('\n'));
          if (!remove) return;
          await request(`/api/super-admin/orphans/${roomId}`, {
            method: 'DELETE',
            body: { confirmId: roomId, confirmName: room.name },
          });
          await loadOverview({ silent: true });
          UI.toast('Voce orfana rimossa dal catalogo.');
          return;
        } catch (orphanError) {
          if (orphanError.status !== 401) UI.toast(orphanError.message, 'error');
          return;
        }
      }
      if (error.status !== 401) UI.toast(error.message, 'error');
    } finally {
      if (state.roomAbortController === controller) state.roomAbortController = null;
    }
  }

  async function reloadCurrentRoom() {
    if (!state.currentRoom) return;
    const result = await request(`/api/super-admin/events/${state.currentRoom.id}`);
    renderRoom(result.event);
  }

  async function editParticipant(participant) {
    const name = window.prompt('Nome del partecipante', participant.name);
    if (name === null) return;
    const phone = window.prompt('Numero con prefisso internazionale', participant.phone || '+39 ');
    if (phone === null) return;
    try {
      await request(`/api/super-admin/events/${state.currentRoom.id}/participants/${participant.id}`, {
        method: 'PATCH',
        body: { name, phone },
      });
      await Promise.all([reloadCurrentRoom(), loadOverview({ silent: true })]);
      UI.toast('Partecipante aggiornato.');
    } catch (error) { UI.toast(error.message, 'error'); }
  }

  async function regenerateRecoveryCode(participant, button) {
    if (!window.confirm(`Rigenerare il codice elfo di ${participant.name}? Quello precedente smetterà di funzionare.`)) return;
    setBusy(button, true, 'Genero…');
    try {
      const result = await request(`/api/super-admin/events/${state.currentRoom.id}/participants/${participant.id}/recovery-code`, { method: 'POST' });
      await reloadCurrentRoom();
      await UI.copyText(result.recoveryCode, `Nuovo codice di ${participant.name} copiato.`);
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  }

  async function regenerateLink(participant, button) {
    if (!window.confirm(`Generare un nuovo link per ${participant.name}? Il link precedente verrà disattivato.`)) return;
    setBusy(button, true, 'Genero…');
    try {
      const result = await request(`/api/super-admin/events/${state.currentRoom.id}/participants/${participant.id}/link`, { method: 'POST' });
      await reloadCurrentRoom();
      await UI.copyText(result.url, `Nuovo link di ${participant.name} copiato.`);
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  }

  async function removePhoto(participant, button) {
    if (!window.confirm(`Rimuovere la foto di ${participant.name}?`)) return;
    setBusy(button, true, 'Rimuovo…');
    try {
      await request(`/api/super-admin/events/${state.currentRoom.id}/participants/${participant.id}/photo`, { method: 'DELETE' });
      await Promise.all([reloadCurrentRoom(), loadOverview({ silent: true })]);
      UI.toast('Foto rimossa.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  }

  async function deleteParticipant(participant, button) {
    if (!window.confirm(`Eliminare ${participant.name}? È possibile solo prima di qualsiasi rivelazione e il sorteggio verrà rifatto.`)) return;
    setBusy(button, true, 'Elimino…');
    try {
      await request(`/api/super-admin/events/${state.currentRoom.id}/participants/${participant.id}`, { method: 'DELETE' });
      await Promise.all([reloadCurrentRoom(), loadOverview({ silent: true })]);
      UI.toast('Partecipante eliminato e sorteggio aggiornato.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  }

  async function deleteMessage(message, button) {
    if (!window.confirm('Eliminare questo messaggio dal muro?')) return;
    setBusy(button, true, '…');
    try {
      await request(`/api/super-admin/events/${state.currentRoom.id}/messages/${message.id}`, { method: 'DELETE' });
      await reloadCurrentRoom();
      await loadOverview({ silent: true });
      UI.toast('Messaggio eliminato.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const button = loginForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Verifica in corso…');
    try {
      const result = await request('/api/super-admin/login', {
        method: 'POST',
        body: {
          username: loginForm.elements.username.value,
          password: loginForm.elements.password.value,
        },
      });
      state.csrfToken = result.csrfToken;
      state.username = result.username;
      loginForm.reset();
      showApp();
      await loadOverview();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });

  UI.qs('#loginPasswordToggle').addEventListener('click', (event) => {
    const input = loginForm.elements.password;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    event.currentTarget.textContent = visible ? '👁' : '🙈';
  });

  UI.qs('#superAdminLogout').addEventListener('click', async () => {
    try { await request('/api/super-admin/logout', { method: 'POST' }); } catch { /* Cookie is still cleared by a fresh login. */ }
    state.csrfToken = '';
    state.username = '';
    state.currentRoom = null;
    showLogin('Sessione chiusa.');
  });

  UI.qs('#superAdminRefresh').addEventListener('click', () => loadOverview());
  UI.qs('#rebuildCatalog').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, 'Ricostruisco…');
    try {
      await loadOverview({ refreshCatalog: true, silent: true });
      UI.toast('Indice delle stanze ricostruito.');
    } finally { setBusy(event.currentTarget, false); }
  });
  UI.qs('#refreshAudit').addEventListener('click', async () => {
    try {
      const result = await request('/api/super-admin/audit?limit=80');
      renderAudit(result.audit);
    } catch (error) { UI.toast(error.message, 'error'); }
  });

  roomSearch.addEventListener('input', () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => loadOverview({ silent: true }), 320);
  });
  roomStatusFilter.addEventListener('change', () => loadOverview({ silent: true }));

  UI.qs('#systemSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Salvo…');
    try {
      const result = await request('/api/super-admin/settings', {
        method: 'PATCH',
        body: {
          allowEventCreation: form.elements.allowEventCreation.checked,
          allowRecovery: form.elements.allowRecovery.checked,
          allowPhotoUploads: form.elements.allowPhotoUploads.checked,
          allowWallMessages: form.elements.allowWallMessages.checked,
          maintenanceMode: form.elements.maintenanceMode.checked,
          maintenanceMessage: form.elements.maintenanceMessage.value,
        },
      });
      renderSystemSettings(result.settings);
      UI.toast('Impostazioni globali salvate.');
      await loadOverview({ silent: true });
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#roomDialogClose').addEventListener('click', closeRoomDialog);
  roomDialog.addEventListener('click', (event) => {
    if (event.target === roomDialog) closeRoomDialog();
  });
  roomDialog.addEventListener('close', clearRoomSelection);

  UI.qsa('[data-room-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      UI.qsa('[data-room-tab]').forEach((item) => item.classList.toggle('active', item === button));
      UI.qsa('[data-room-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.roomPanel === button.dataset.roomTab));
    });
  });

  UI.qsa('[data-reveal-target]').forEach((button) => {
    button.addEventListener('click', () => toggleSecret(UI.qs(`#${button.dataset.revealTarget}`), button));
  });

  UI.qs('#roomEditForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Salvo…');
    try {
      const result = await request(`/api/super-admin/events/${state.currentRoom.id}`, {
        method: 'PATCH',
        body: {
          name: form.elements.name.value,
          organizer: form.elements.organizer.value,
          date: form.elements.date.value,
          budget: form.elements.budget.value,
          location: form.elements.location.value,
          policies: {
            allowMessages: form.elements.allowMessages.checked,
            allowPhotoUploads: form.elements.allowPhotoUploads.checked,
            allowRecovery: form.elements.allowRecovery.checked,
            allowParticipantEdits: form.elements.allowParticipantEdits.checked,
            allowReveal: form.elements.allowReveal.checked,
          },
        },
      });
      renderRoom(result.event);
      await loadOverview({ silent: true });
      UI.toast('Dettagli della stanza salvati.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#applyRoomStatus').addEventListener('click', async (event) => {
    const target = currentRoomSnapshot();
    if (!target) return UI.toast('Riapri la stanza prima di modificarne lo stato.', 'error');
    const button = event.currentTarget;
    const status = UI.qs('#roomStatusSelect').value;
    const reason = UI.qs('#roomStatusReason').value;
    const warning = status === 'trashed'
      ? 'Dopo questa operazione la stanza dovrà essere riaperta dal cestino prima di poterla eliminare definitivamente.'
      : 'La modifica verrà applicata soltanto a questa stanza.';
    if (!window.confirm([
      `Stanza: ${target.name}`,
      `ID: ${target.id}`,
      '',
      `Impostarla come “${statusLabels[status]}”?`,
      warning,
    ].join('\n'))) return;
    if (!currentRoomSnapshot() || currentRoomSnapshot().id !== target.id) {
      return UI.toast('La stanza selezionata è cambiata. Operazione annullata.', 'error');
    }
    setBusy(button, true, 'Applico…');
    try {
      const result = await request(`/api/super-admin/events/${target.id}/status`, {
        method: 'POST',
        body: {
          status,
          reason,
          confirmId: target.id,
          confirmName: target.name,
          expectedUpdatedAt: target.updatedAt,
        },
      });
      if (status === 'trashed') closeRoomDialog();
      else renderRoom(result.event);
      await loadOverview({ silent: true });
      UI.toast(status === 'trashed'
        ? 'Stanza spostata nel cestino. Riaprila dal catalogo per eliminarla definitivamente.'
        : `Stanza impostata come ${statusLabels[status].toLowerCase()}.`);
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#restoreRoom').addEventListener('click', async (event) => {
    const target = currentRoomSnapshot();
    if (!target || target.status !== 'trashed') return UI.toast('Riapri la stanza dal cestino.', 'error');
    if (!window.confirm(`Ripristinare “${target.name}”?\nID: ${target.id}`)) return;
    const button = event.currentTarget;
    setBusy(button, true, 'Ripristino…');
    try {
      const result = await request(`/api/super-admin/events/${target.id}/restore`, {
        method: 'POST',
        body: {
          confirmId: target.id,
          confirmName: target.name,
          expectedUpdatedAt: target.updatedAt,
        },
      });
      renderRoom(result.event);
      await loadOverview({ silent: true });
      UI.toast('Stanza ripristinata.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#purgeRoom').addEventListener('click', async (event) => {
    const target = currentRoomSnapshot();
    if (!target || target.status !== 'trashed') return UI.toast('Riapri la stanza dal cestino prima di eliminarla.', 'error');
    const button = event.currentTarget;
    setBusy(button, true, 'Preparo conferma…');
    try {
      const preview = await request(`/api/super-admin/events/${target.id}/purge-preview`, {
        method: 'POST',
        body: {
          confirmId: target.id,
          confirmName: target.name,
          expectedUpdatedAt: target.updatedAt,
        },
      });
      const typed = window.prompt([
        'ELIMINAZIONE DEFINITIVA',
        '',
        `Stanza: ${preview.event.name}`,
        `ID: ${preview.event.id}`,
        `Partecipanti: ${preview.event.participantCount}`,
        `Foto: ${preview.event.photoCount}`,
        '',
        'Prima della cancellazione verrà creato e verificato un backup dei dati e delle foto.',
        'Digita esattamente:',
        preview.phrase,
      ].join('\n'));
      if (typed === null) return;
      const latest = currentRoomSnapshot();
      if (!latest || latest.id !== preview.event.id || latest.updatedAt !== preview.event.updatedAt) {
        return UI.toast('La stanza selezionata è cambiata. Eliminazione annullata.', 'error');
      }
      setBusy(button, true, 'Backup e eliminazione…');
      const result = await request(`/api/super-admin/events/${target.id}/purge`, {
        method: 'DELETE',
        body: {
          confirmationToken: preview.confirmationToken,
          confirmPhrase: typed,
        },
      });
      closeRoomDialog();
      await loadOverview({ refreshCatalog: true, silent: true });
      UI.toast(`Stanza eliminata. Backup verificato: ${result.backup.photoCount} foto copiate.`);
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#roomDuplicate').addEventListener('click', async (event) => {
    if (!window.confirm('Duplicare questa stanza con nuovi link, nuovi codici e nuovo sorteggio?')) return;
    const button = event.currentTarget;
    setBusy(button, true, 'Duplico…');
    try {
      const result = await request(`/api/super-admin/events/${state.currentRoom.id}/duplicate`, { method: 'POST' });
      await loadOverview({ refreshCatalog: true, silent: true });
      await UI.copyText(result.adminUrl, 'Nuovo link admin copiato.');
      UI.toast('Stanza duplicata. Il nuovo link admin è negli appunti.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  UI.qs('#roomRepair').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, 'Verifico…');
    try {
      const result = await request(`/api/super-admin/events/${state.currentRoom.id}/repair`, { method: 'POST' });
      renderRoom(result.event);
      await loadOverview({ silent: true });
      UI.toast(result.repairedAssignments ? 'Indici e sorteggio riparati.' : 'Indici verificati e riallineati.');
    } catch (error) { UI.toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });

  async function bootstrap() {
    try {
      const result = await request('/api/super-admin/session');
      state.csrfToken = result.csrfToken;
      state.username = result.username;
      showApp();
      await loadOverview();
    } catch (error) {
      showLogin(error.code === 'SUPERADMIN_NOT_CONFIGURED'
        ? 'Il Control Center non è ancora configurato su Netlify. Segui la guida v6.'
        : 'Inserisci le credenziali super-admin.');
    }
  }

  bootstrap();
});
