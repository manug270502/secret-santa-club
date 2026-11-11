document.addEventListener('DOMContentLoaded', () => {
  const { qs, api, toast } = window.ChristmasUI;
  const rows = qs('#participantRows');
  const count = qs('#participantCount');
  const addButton = qs('#addParticipant');
  const form = qs('#eventForm');
  const createButton = qs('#createButton');
  const demoButton = qs('#demoButton');
  const organizerToggle = qs('#organizerParticipates');
  const organizerFields = qs('#organizerParticipantFields');
  const recoverForm = qs('#recoverPhoneForm');
  let participants = [];

  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const minimumExternalParticipants = () => (organizerToggle.checked ? 2 : 3);

  function updateCount() {
    const total = participants.length + (organizerToggle.checked ? 1 : 0);
    count.textContent = `${total} ${total === 1 ? 'elfo totale' : 'elfi totali'}`;
  }

  function addParticipant(name = '', phone = '') {
    participants.push({ id: makeId(), name, phone });
    renderParticipants();
  }

  function renderParticipants() {
    rows.replaceChildren();
    const minimum = minimumExternalParticipants();
    participants.forEach((participant, index) => {
      const row = document.createElement('div');
      row.className = 'participant-row';
      row.dataset.id = participant.id;

      const number = document.createElement('span');
      number.className = 'row-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const nameWrap = document.createElement('label');
      nameWrap.className = 'participant-input participant-name-input';
      const nameLabel = document.createElement('span');
      nameLabel.textContent = 'Nome';
      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 60;
      name.required = true;
      name.placeholder = 'Nome e cognome';
      name.value = participant.name;
      name.autocomplete = 'off';
      name.setAttribute('aria-label', `Nome partecipante ${index + 1}`);
      name.addEventListener('input', () => { participant.name = name.value; });
      nameWrap.append(nameLabel, name);

      const phoneWrap = document.createElement('label');
      phoneWrap.className = 'participant-input participant-phone-input';
      const phoneLabel = document.createElement('span');
      phoneLabel.textContent = 'WhatsApp';
      const phone = document.createElement('input');
      phone.type = 'tel';
      phone.maxLength = 30;
      phone.required = true;
      phone.placeholder = '+39 333 123 4567';
      phone.value = participant.phone;
      phone.autocomplete = 'off';
      phone.className = 'participant-phone';
      phone.setAttribute('aria-label', `Telefono WhatsApp partecipante ${index + 1}`);
      phone.addEventListener('input', () => { participant.phone = phone.value; });
      phoneWrap.append(phoneLabel, phone);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-row';
      remove.textContent = '×';
      remove.title = `Rimuovi ${participant.name || `partecipante ${index + 1}`}`;
      remove.setAttribute('aria-label', remove.title);
      remove.disabled = participants.length <= minimum;
      remove.addEventListener('click', () => {
        participants = participants.filter((item) => item.id !== participant.id);
        renderParticipants();
      });

      row.append(number, nameWrap, phoneWrap, remove);
      rows.appendChild(row);
    });
    updateCount();
  }

  function updateOrganizerChoice() {
    const participates = organizerToggle.checked;
    organizerFields.hidden = !participates;
    form.elements.organizerName.required = participates;
    form.elements.organizerPhone.required = participates;
    while (participants.length < minimumExternalParticipants()) {
      participants.push({ id: makeId(), name: '', phone: '' });
    }
    renderParticipants();
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

  organizerToggle.addEventListener('change', updateOrganizerChoice);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      toast('Completa i campi obbligatori.', 'error');
      return;
    }

    const validParticipants = participants.map((item) => ({
      name: item.name.trim(),
      phone: item.phone.trim(),
    }));
    if (validParticipants.some((item) => !item.name || !item.phone)) {
      toast('Inserisci nome e numero WhatsApp di tutti i partecipanti.', 'error');
      return;
    }

    const allNames = validParticipants.map((item) => item.name.toLocaleLowerCase('it-IT'));
    if (organizerToggle.checked) allNames.push(form.elements.organizerName.value.trim().toLocaleLowerCase('it-IT'));
    if (new Set(allNames).size !== allNames.length) {
      toast('Ogni partecipante deve avere un nome diverso.', 'error');
      return;
    }

    if (!qs('#privacyCheck').checked) {
      toast('Conferma il consenso per la festa e gli inviti WhatsApp.', 'error');
      return;
    }

    createButton.disabled = true;
    createButton.querySelector('span').textContent = 'Sto mescolando i nomi…';
    try {
      const payload = {
        name: form.elements.name.value,
        organizerParticipates: organizerToggle.checked,
        organizerName: organizerToggle.checked ? form.elements.organizerName.value : '',
        organizerPhone: organizerToggle.checked ? form.elements.organizerPhone.value : '',
        date: form.elements.date.value,
        budget: form.elements.budget.value,
        location: form.elements.location.value,
        requirePhones: true,
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

  recoverForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!recoverForm.checkValidity()) {
      recoverForm.reportValidity();
      return;
    }
    const phone = recoverForm.elements.phone.value.trim();
    sessionStorage.setItem('secret-santa-recovery-phone', phone);
    window.location.assign('/my-events');
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
  for (let index = 0; index < minimumExternalParticipants(); index += 1) addParticipant();
  updateOrganizerChoice();
});
