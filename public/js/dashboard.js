document.addEventListener('DOMContentLoaded', async () => {
  const UI = window.ChristmasUI;
  const partyToken = UI.tokenFromPath('party');
  const app = UI.qs('#dashboardApp');
  const loading = UI.qs('#dashboardLoading');
  const peopleGrid = UI.qs('#peopleGrid');
  const giftProfileRail = UI.qs('#giftProfileRail');
  const messageWall = UI.qs('#messageWall');
  const wallForm = UI.qs('#wallForm');
  let eventData = null;
  let countdownTimer = null;
  let lastUpdatedAt = '';
  let loadInFlight = null;

  const prompts = [
    'Chi comprerebbe il regalo all’ultimo secondo?',
    'Chi indosserebbe un maglione con le luci vere?',
    'Chi riuscirebbe a mangiare più panettone?',
    'Chi farebbe il pacchetto più creativo?',
    'Chi confonderebbe il proprio regalo con quello di un altro?',
    'Chi inizierebbe ad ascoltare canzoni di Natale a ottobre?',
    'Chi sarebbe il miglior assistente di Babbo Natale?',
    'Chi indovinerebbe subito il proprio Secret Santa?',
  ];
  const missions = [
    'Invia nel gruppo una foto del peggior addobbo che trovi.',
    'Descrivi un film di Natale usando soltanto tre emoji.',
    'Trova una canzone natalizia che nessuno ammette di amare.',
    'Fai una foto a qualcosa di rosso, verde e dorato insieme.',
    'Inventa il nome di una renna e la sua professione segreta.',
    'Scrivi un augurio che sembri il titolo di un film d’azione.',
    'Condividi il tuo snack ufficiale dell’attesa natalizia.',
    'Fai votare al gruppo il maglione natalizio più assurdo.',
  ];
  const bingoItems = [
    'Ho sentito una canzone di Natale',
    'Ho mangiato un dolce natalizio',
    'Ho pensato al regalo',
    'Ho visto lucine esagerate',
    'Ho detto “manca poco”',
    'Ho mandato un meme nel gruppo',
    'Ho indossato qualcosa di rosso',
    'Ho visto un film natalizio',
    'Ho mantenuto il segreto',
  ];


  function renderRoomStatus() {
    const banner = UI.qs('#dashboardRoomStatus');
    const status = eventData.status || 'active';
    const messagesAllowed = !eventData.readOnly && eventData.policies?.allowMessages !== false;
    const showBanner = eventData.readOnly || !messagesAllowed;
    banner.hidden = !showBanner;
    banner.className = `admin-room-status-banner dashboard-room-status-banner ${status}`;
    if (status === 'completed') {
      UI.qs('#dashboardRoomStatusTitle').textContent = 'La festa è conclusa';
      UI.qs('#dashboardRoomStatusText').textContent = 'Foto, preferenze e messaggi restano visibili; il muro è ora in sola lettura.';
    } else {
      UI.qs('#dashboardRoomStatusTitle').textContent = 'Muro degli auguri in pausa';
      UI.qs('#dashboardRoomStatusText').textContent = 'Puoi continuare a esplorare la stanza e i giochi, ma non pubblicare nuovi messaggi.';
    }
    wallForm.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = !messagesAllowed; });
  }

  function renderHeader() {
    document.title = `${eventData.name} — Sala comune`;
    UI.qs('#partyTitle').textContent = eventData.name;
    const bits = [`Organizzato da ${eventData.organizer}`];
    if (eventData.date) bits.push(UI.formatDate(eventData.date));
    if (eventData.location) bits.push(eventData.location);
    if (Number.isInteger(eventData.budgetCents)) bits.push(`Budget ${UI.formatBudget(eventData.budgetCents)}`);
    UI.qs('#partyMeta').textContent = bits.join(' · ');

    const percent = eventData.participantCount
      ? Math.round((eventData.revealedCount / eventData.participantCount) * 100)
      : 0;
    UI.qs('#progressRing').style.setProperty('--progress', `${percent}%`);
    UI.qs('#progressPercent').textContent = `${percent}%`;
    UI.qs('#progressText').textContent = `${eventData.revealedCount} di ${eventData.participantCount}`;
    UI.qs('#readyBadge').textContent = `${eventData.revealedCount} ${eventData.revealedCount === 1 ? 'pronto' : 'pronti'}`;
  }

  function renderPeople() {
    peopleGrid.replaceChildren();
    eventData.participants.forEach((participant) => {
      const card = document.createElement('article');
      card.className = `person-card ${participant.revealed ? 'ready' : ''}`;
      const mood = document.createElement('span');
      mood.className = 'person-mood';
      mood.textContent = participant.mood || '🎄';
      const avatar = document.createElement('span');
      UI.mountAvatar(avatar, participant);
      const name = document.createElement('h3');
      name.textContent = participant.name;
      const status = document.createElement('span');
      status.className = 'person-status';
      status.textContent = participant.revealed ? '✓ PACCHETTO APERTO' : participant.photoUrl ? 'PROFILO PRONTO' : 'IN ATTESA';
      card.append(mood, avatar, name);
      if (participant.isOrganizer) {
        const organizerBadge = document.createElement('span');
        organizerBadge.className = 'person-organizer-badge';
        organizerBadge.textContent = 'ORGANIZZATORE';
        card.appendChild(organizerBadge);
      }
      card.appendChild(status);
      if (participant.wish) {
        const wish = document.createElement('p');
        wish.className = 'person-wish';
        wish.textContent = `“${participant.wish}”`;
        card.appendChild(wish);
      }
      peopleGrid.appendChild(card);
    });
  }

  function appendGiftDetail(container, label, value, className = '') {
    if (!value) return;
    const row = document.createElement('div');
    row.className = `gift-detail ${className}`.trim();
    const key = document.createElement('strong');
    key.textContent = label;
    const text = document.createElement('span');
    text.textContent = value;
    row.append(key, text);
    container.appendChild(row);
  }

  function renderGiftProfiles() {
    giftProfileRail.replaceChildren();
    eventData.participants.forEach((participant) => {
      const card = document.createElement('article');
      card.className = 'gift-profile-card';
      const top = document.createElement('div');
      top.className = 'gift-profile-card-top';
      const avatar = document.createElement('span');
      UI.mountAvatar(avatar, participant, 'gift-profile-avatar');
      const heading = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = participant.name;
      const state = document.createElement('small');
      state.textContent = UI.hasGiftProfile(participant.giftProfile) || participant.wish ? 'SCHEDA REGALO PRONTA' : 'ANCORA TUTTO DA SCOPRIRE';
      heading.append(name, state);
      const mood = document.createElement('span');
      mood.className = 'gift-profile-mood';
      mood.textContent = participant.mood || '🎄';
      top.append(avatar, heading, mood);

      const details = document.createElement('div');
      details.className = 'gift-profile-details';
      const profile = participant.giftProfile || {};
      appendGiftDetail(details, '🎨 Colore', UI.giftLabel('colors', profile.favoriteColor));
      appendGiftDetail(details, '🎁 Preferisce', UI.giftLabel('styles', profile.giftStyle));
      if (profile.interests?.length) {
        const chips = document.createElement('div');
        chips.className = 'gift-interest-chips';
        profile.interests.forEach((interest) => {
          const chip = document.createElement('span');
          chip.textContent = UI.giftLabel('interests', interest);
          chips.appendChild(chip);
        });
        const interestRow = document.createElement('div');
        interestRow.className = 'gift-detail gift-detail-interests';
        const key = document.createElement('strong');
        key.textContent = '✨ Passioni';
        interestRow.append(key, chips);
        details.appendChild(interestRow);
      }
      appendGiftDetail(details, '💭 Indizio', participant.wish, 'gift-detail-wish');
      appendGiftDetail(details, '🚫 Da evitare', profile.avoid, 'gift-detail-avoid');
      if (!details.children.length) {
        const empty = document.createElement('p');
        empty.className = 'gift-profile-empty';
        empty.textContent = 'Nessun indizio ancora. Potrebbe amare le sorprese… o essersi dimenticato di compilare la scheda.';
        details.appendChild(empty);
      }
      card.append(top, details);
      giftProfileRail.appendChild(card);
    });
  }

  function renderMessages() {
    messageWall.replaceChildren();
    if (!eventData.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'wall-empty';
      empty.textContent = 'Il muro è ancora libero. Lascia il primo messaggio della festa ✨';
      messageWall.appendChild(empty);
      return;
    }
    eventData.messages.slice(0, 12).forEach((message, index) => {
      const note = document.createElement('article');
      note.className = 'wall-note';
      note.style.setProperty('--rotation', `${((index % 5) - 2) * 1.1}deg`);
      const emoji = document.createElement('span');
      emoji.className = 'note-emoji';
      emoji.textContent = message.emoji;
      const text = document.createElement('p');
      text.textContent = message.message;
      const footer = document.createElement('footer');
      const author = document.createElement('b');
      author.textContent = message.author;
      const time = document.createElement('span');
      time.textContent = UI.relativeTime(message.createdAt);
      footer.append(author, time);
      note.append(emoji, text, footer);
      messageWall.appendChild(note);
    });
  }

  function updateCountdown() {
    const values = {
      days: UI.qs('#countDays'),
      hours: UI.qs('#countHours'),
      minutes: UI.qs('#countMinutes'),
    };
    if (!eventData?.date) {
      values.days.textContent = '—';
      values.hours.textContent = '—';
      values.minutes.textContent = '—';
      return;
    }
    const target = new Date(`${eventData.date}T20:00:00`).getTime();
    const diff = Math.max(0, target - Date.now());
    const totalMinutes = Math.floor(diff / 60000);
    values.days.textContent = Math.floor(totalMinutes / 1440);
    values.hours.textContent = String(Math.floor((totalMinutes % 1440) / 60)).padStart(2, '0');
    values.minutes.textContent = String(totalMinutes % 60).padStart(2, '0');
  }

  function renderAll() {
    renderRoomStatus();
    renderHeader();
    renderPeople();
    renderGiftProfiles();
    renderMessages();
    updateCountdown();
  }

  async function load(initial = false) {
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      try {
        const result = await UI.api(`/api/public/${partyToken}`);
        const next = result.event;
        const needsRender = initial || !lastUpdatedAt || next.updatedAt !== lastUpdatedAt;
        eventData = next;
        lastUpdatedAt = next.updatedAt || '';
        if (needsRender) renderAll();
        else updateCountdown();
        if (initial) {
          loading.hidden = true;
          app.hidden = false;
          clearInterval(countdownTimer);
          countdownTimer = window.setInterval(updateCountdown, 30000);
        }
      } catch (error) {
        if (initial) {
          loading.innerHTML = '';
          const icon = document.createElement('div');
          icon.className = 'gift-loader';
          icon.textContent = '🧊';
          const title = document.createElement('h1');
          title.textContent = 'La sala è chiusa';
          const text = document.createElement('p');
          text.textContent = error.message;
          loading.append(icon, title, text);
        }
      } finally {
        loadInFlight = null;
      }
    })();
    return loadInFlight;
  }

  function renderBingo() {
    const grid = UI.qs('#bingoGrid');
    const key = `secret-santa-bingo-${partyToken}`;
    let completed = [];
    try { completed = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_error) { completed = []; }
    grid.replaceChildren();
    bingoItems.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `bingo-cell ${completed.includes(index) ? 'done' : ''}`;
      button.textContent = completed.includes(index) ? `✓ ${label}` : label;
      button.addEventListener('click', () => {
        if (completed.includes(index)) completed = completed.filter((item) => item !== index);
        else completed.push(index);
        localStorage.setItem(key, JSON.stringify(completed));
        renderBingo();
        if (completed.length === 9) {
          UI.toast('Bingo completo! Gloria natalizia sbloccata.');
          UI.playBell();
        }
      });
      grid.appendChild(button);
    });
    UI.qs('#bingoScore').textContent = `${completed.length}/9 completate`;
  }

  UI.qs('#resetBingo').addEventListener('click', () => {
    localStorage.removeItem(`secret-santa-bingo-${partyToken}`);
    renderBingo();
  });

  function setPrompt() {
    UI.qs('#gamePrompt').textContent = prompts[Math.floor(Math.random() * prompts.length)];
    UI.qs('#pickedPerson').innerHTML = '<span>?</span><b>Tocca “Pesca”</b>';
  }

  UI.qs('#newPromptButton').addEventListener('click', setPrompt);
  UI.qs('#pickPersonButton').addEventListener('click', () => {
    if (!eventData?.participants?.length) return;
    const output = UI.qs('#pickedPerson');
    const button = UI.qs('#pickPersonButton');
    button.disabled = true;
    let ticks = 0;
    const timer = window.setInterval(() => {
      const participant = eventData.participants[Math.floor(Math.random() * eventData.participants.length)];
      output.replaceChildren();
      const avatar = document.createElement('span');
      avatar.textContent = UI.initials(participant.name);
      const name = document.createElement('b');
      name.textContent = participant.name;
      output.append(avatar, name);
      ticks += 1;
      if (ticks >= 13) {
        clearInterval(timer);
        button.disabled = Boolean(eventData?.readOnly || eventData?.policies?.allowMessages === false);
        UI.playBell();
      }
    }, 75);
  });

  UI.qs('#missionButton').addEventListener('click', () => {
    const target = UI.qs('#missionText');
    target.style.opacity = '0';
    target.style.transform = 'translateY(5px)';
    window.setTimeout(() => {
      target.textContent = missions[Math.floor(Math.random() * missions.length)];
      target.style.opacity = '1';
      target.style.transform = 'none';
    }, 180);
  });

  wallForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    if (eventData?.readOnly || eventData?.policies?.allowMessages === false) {
      UI.toast('Il muro degli auguri è in sola lettura.', 'error');
      return;
    }
    const button = wallForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await UI.api(`/api/public/${partyToken}/messages`, {
        method: 'POST',
        body: {
          author: wallForm.elements.author.value,
          emoji: wallForm.elements.emoji.value,
          message: wallForm.elements.message.value,
        },
      });
      wallForm.elements.message.value = '';
      UI.toast('Messaggio appeso al muro.');
      await load(false);
    } catch (error) {
      UI.toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  UI.qs('#soundButton').addEventListener('click', () => {
    UI.playBell();
    UI.toast('Campanelle attivate 🔔');
  });

  UI.qs('#lightsButton').addEventListener('click', () => {
    document.body.classList.toggle('magic-lights');
    UI.qs('#lightsButton').textContent = document.body.classList.contains('magic-lights') ? '✨ Luci accese' : '✨ Più magia';
  });

  UI.qs('#sharePartyButton').addEventListener('click', async () => {
    const shareData = { title: eventData?.name || 'Secret Santa', text: 'Entra nella nostra sala comune di Secret Santa!', url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (_error) {}
    } else {
      UI.copyText(window.location.href, 'Link della sala copiato.');
    }
  });

  renderBingo();
  setPrompt();
  await load(true);
  window.setInterval(() => { if (!document.hidden) load(false); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
});
