document.addEventListener('DOMContentLoaded', () => {
  const UI = window.ChristmasUI;
  const searchPanel = UI.qs('#recoverySearchPanel');
  const searchForm = UI.qs('#recoverySearchForm');
  const loading = UI.qs('#recoveryLoading');
  const results = UI.qs('#recoveryResults');
  const empty = UI.qs('#recoveryEmpty');
  const roomList = UI.qs('#recoveryRoomList');
  let currentPhone = '';

  function setView(view) {
    searchPanel.hidden = view !== 'search';
    loading.hidden = view !== 'loading';
    results.hidden = view !== 'results';
    empty.hidden = view !== 'empty';
  }

  function maskPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 6) return value;
    return `+${digits.slice(0, 2)} ••• ••• ${digits.slice(-4)}`;
  }

  function addMetaChip(container, text, icon) {
    if (!text) return;
    const chip = document.createElement('span');
    chip.className = 'recovery-meta-chip';
    chip.textContent = `${icon} ${text}`;
    container.appendChild(chip);
  }

  function buildSecretPanel(room, unlocked) {
    const panel = document.createElement('div');
    panel.className = 'recovery-unlocked-panel';

    const actions = document.createElement('div');
    actions.className = 'recovery-room-actions';
    const personal = document.createElement('a');
    personal.className = 'button button-primary';
    personal.href = unlocked.participantPath;
    personal.textContent = unlocked.revealed ? 'Apri il tuo invito' : 'Apri il pacchetto';
    const common = document.createElement('a');
    common.className = 'button button-ghost';
    common.href = unlocked.publicPath;
    common.textContent = 'Entra nella stanza';
    actions.append(personal, common);

    const secret = document.createElement('div');
    secret.className = `recovery-secret-box ${unlocked.targetName ? '' : 'locked'}`.trim();
    const copy = document.createElement('div');
    const label = document.createElement('small');
    label.textContent = 'Tu farai il regalo a';
    const value = document.createElement('strong');
    if (unlocked.targetName) {
      value.textContent = '••••••••';
      value.dataset.hiddenValue = 'true';
      value.dataset.targetName = unlocked.targetName;
    } else {
      value.textContent = 'Pacchetto ancora chiuso';
    }
    copy.append(label, value);
    secret.appendChild(copy);

    if (unlocked.targetName) {
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'secret-eye-button';
      reveal.textContent = '👁';
      reveal.title = 'Mostra o nascondi il nome';
      reveal.setAttribute('aria-label', 'Mostra il nome estratto');
      reveal.setAttribute('aria-pressed', 'false');
      reveal.addEventListener('click', () => {
        const hidden = value.dataset.hiddenValue === 'true';
        value.textContent = hidden ? value.dataset.targetName : '••••••••';
        value.dataset.hiddenValue = hidden ? 'false' : 'true';
        reveal.textContent = hidden ? '🙈' : '👁';
        reveal.setAttribute('aria-pressed', String(hidden));
        reveal.setAttribute('aria-label', hidden ? 'Nascondi il nome estratto' : 'Mostra il nome estratto');
      });
      secret.appendChild(reveal);
    } else {
      const note = document.createElement('p');
      note.textContent = 'Completa il profilo e apri il pacchetto dal tuo invito personale.';
      secret.appendChild(note);
    }

    panel.append(secret, actions);
    return panel;
  }

  function buildRoomCard(room) {
    const card = document.createElement('article');
    card.className = 'recovery-room-card';

    const top = document.createElement('div');
    top.className = 'recovery-room-top';
    const icon = document.createElement('span');
    icon.className = 'recovery-room-icon';
    icon.textContent = room.revealed ? '🎁' : '🎄';
    const heading = document.createElement('div');
    const kicker = document.createElement('small');
    kicker.textContent = `INVITO DI ${room.participantName.toUpperCase()}`;
    const title = document.createElement('h3');
    title.textContent = room.name;
    const organizer = document.createElement('p');
    organizer.textContent = `Organizzato da ${room.organizer}`;
    heading.append(kicker, title, organizer);
    top.append(icon, heading);

    const meta = document.createElement('div');
    meta.className = 'recovery-room-meta';
    addMetaChip(meta, room.date ? UI.formatDate(room.date) : 'Data da decidere', '📅');
    addMetaChip(meta, room.location, '📍');
    addMetaChip(meta, UI.formatBudget(room.budgetCents), '💶');

    const unlockForm = document.createElement('form');
    unlockForm.className = 'recovery-unlock-form';
    unlockForm.noValidate = true;
    const label = document.createElement('label');
    label.className = 'field';
    const labelText = document.createElement('span');
    labelText.textContent = 'Codice elfo personale';
    const inputRow = document.createElement('div');
    inputRow.className = 'password-input-row';
    const input = document.createElement('input');
    input.type = 'password';
    input.name = 'recoveryCode';
    input.autocomplete = 'one-time-code';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = 16;
    input.placeholder = 'Es. N7K4P2XR';
    input.required = true;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.textContent = '👁';
    toggle.title = 'Mostra o nascondi il codice';
    toggle.setAttribute('aria-label', 'Mostra il codice elfo');
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? '🙈' : '👁';
      toggle.setAttribute('aria-label', show ? 'Nascondi il codice elfo' : 'Mostra il codice elfo');
    });
    inputRow.append(input, toggle);
    label.append(labelText, inputRow);

    const submit = document.createElement('button');
    submit.className = 'button button-secondary';
    submit.type = 'submit';
    submit.textContent = 'Sblocca invito';
    const hint = document.createElement('small');
    hint.className = 'recovery-code-hint';
    hint.textContent = 'Lo trovi nel messaggio WhatsApp dell’invito. L’admin può comunicartelo di nuovo.';
    unlockForm.append(label, submit, hint);

    unlockForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Controllo…';
      try {
        const response = await UI.api('/api/recovery/unlock', {
          method: 'POST',
          body: { phone: currentPhone, eventId: room.eventId, recoveryCode: input.value },
        });
        unlockForm.replaceWith(buildSecretPanel(room, response.room));
        UI.toast(`Invito “${room.name}” sbloccato.`);
      } catch (error) {
        UI.toast(error.message, 'error');
        input.select();
      } finally {
        submit.disabled = false;
        submit.textContent = 'Sblocca invito';
      }
    });

    card.append(top, meta, unlockForm);
    return card;
  }

  function renderRooms(rooms) {
    roomList.replaceChildren();
    rooms.forEach((room) => roomList.appendChild(buildRoomCard(room)));
    UI.qs('#recoveryResultsTitle').textContent = `${rooms.length} ${rooms.length === 1 ? 'festa trovata' : 'feste trovate'}`;
    UI.qs('#recoveryPhoneLabel').textContent = `Numero cercato: ${maskPhone(currentPhone)}`;
  }

  async function lookup(phone) {
    currentPhone = String(phone || '').trim();
    if (!currentPhone) return;
    sessionStorage.setItem('secret-santa-recovery-phone', currentPhone);
    setView('loading');
    try {
      const response = await UI.api('/api/recovery/lookup', { method: 'POST', body: { phone: currentPhone } });
      if (!response.rooms.length) {
        setView('empty');
        return;
      }
      renderRooms(response.rooms);
      setView('results');
    } catch (error) {
      setView('search');
      UI.toast(error.message, 'error');
    }
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!searchForm.checkValidity()) {
      searchForm.reportValidity();
      return;
    }
    lookup(searchForm.elements.phone.value);
  });

  UI.qs('#changeRecoveryPhone').addEventListener('click', () => {
    setView('search');
    searchForm.elements.phone.value = currentPhone;
    searchForm.elements.phone.focus();
  });
  UI.qs('#retryRecovery').addEventListener('click', () => {
    setView('search');
    searchForm.elements.phone.value = '';
    searchForm.elements.phone.focus();
  });

  const stored = sessionStorage.getItem('secret-santa-recovery-phone') || '';
  if (stored) {
    searchForm.elements.phone.value = stored;
    lookup(stored);
  } else {
    setView('search');
  }
});
