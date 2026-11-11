document.addEventListener('DOMContentLoaded', () => {
  const { qs, api, toast } = window.ChristmasUI;
  const rows = qs('#participantRows');
  const count = qs('#participantCount');
  const addButton = qs('#addParticipant');
  const form = qs('#eventForm');
  const createButton = qs('#createButton');
  const demoButton = qs('#demoButton');
  let participants = [];

  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  function addParticipant(name = '', phone = '') {
    participants.push({ id: makeId(), name, phone });
    renderParticipants();
  }

  function renderParticipants() {
    rows.replaceChildren();
    participants.forEach((participant, index) => {
      const row = document.createElement('div');
      row.className = 'participant-row';
      row.dataset.id = participant.id;

      const number = document.createElement('span');
      number.className = 'row-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 60;
      name.required = true;
      name.placeholder = 'Nome e cognome';
      name.value = participant.name;
      name.setAttribute('aria-label', `Nome partecipante ${index + 1}`);
      name.addEventListener('input', () => { participant.name = name.value; });

      const phone = document.createElement('input');
      phone.type = 'tel';
      phone.maxLength = 30;
      phone.placeholder = '+39 333 123 4567 (opz.)';
      phone.value = participant.phone;
      phone.className = 'participant-phone';
      phone.setAttribute('aria-label', `Telefono partecipante ${index + 1}`);
      phone.addEventListener('input', () => { participant.phone = phone.value; });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-row';
      remove.textContent = '×';
      remove.title = `Rimuovi ${participant.name || `partecipante ${index + 1}`}`;
      remove.disabled = participants.length <= 3;
      remove.addEventListener('click', () => {
        participants = participants.filter((item) => item.id !== participant.id);
        renderParticipants();
      });

      row.append(number, name, phone, remove);
      rows.appendChild(row);
    });
    count.textContent = `${participants.length} ${participants.length === 1 ? 'elfo' : 'elfi'}`;
  }

  function setDefaultDate() {
    const input = form.elements.date;
    const today = new Date();
    let year = today.getFullYear();
    const candidate = new Date(year, 11, 20, 20, 0, 0);
    if (candidate.getTime() < today.getTime()) year += 1;
    input.value = `${year}-12-20`;
  }

  addButton.addEventListener('click', () => {
    addParticipant();
    rows.lastElementChild?.querySelector('input')?.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const validParticipants = participants.map((item) => ({
      name: item.name.trim(),
      phone: item.phone.trim(),
    }));
    if (validParticipants.some((item) => !item.name)) {
      toast('Inserisci il nome di tutti i partecipanti.', 'error');
      rows.querySelector('input:invalid, input[value=""]')?.focus();
      return;
    }
    if (!qs('#privacyCheck').checked) {
      toast('Conferma l’uso dei dati per la festa privata.', 'error');
      return;
    }

    createButton.disabled = true;
    createButton.querySelector('span').textContent = 'Sto mescolando i nomi…';
    try {
      const payload = {
        name: form.elements.name.value,
        organizer: form.elements.organizer.value,
        date: form.elements.date.value,
        location: form.elements.location.value,
        participants: validParticipants,
      };
      const result = await api('/api/events', { method: 'POST', body: payload });
      window.location.assign(result.adminPath || result.adminUrl);
    } catch (error) {
      toast(error.message, 'error');
      createButton.disabled = false;
      createButton.querySelector('span').textContent = 'Sorteggia e crea gli inviti';
    }
  });

  demoButton.addEventListener('click', async () => {
    demoButton.disabled = true;
    demoButton.textContent = 'Preparo la demo…';
    try {
      const result = await api('/api/demo', { method: 'POST' });
      window.location.assign(result.adminPath || result.adminUrl);
    } catch (error) {
      toast(error.message, 'error');
      demoButton.disabled = false;
      demoButton.textContent = 'Apri una demo';
    }
  });

  api('/api/system')
    .then((result) => { if (!result.demoEnabled) demoButton.hidden = true; })
    .catch(() => {});

  setDefaultDate();
  ['Martina', 'Luca', 'Giulia', 'Marco'].forEach((name) => addParticipant(name));
});
