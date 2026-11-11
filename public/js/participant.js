document.addEventListener('DOMContentLoaded', async () => {
  const UI = window.ChristmasUI;
  const participantToken = UI.tokenFromPath('join');
  const loading = UI.qs('#joinLoading');
  const profileView = UI.qs('#profileView');
  const resultView = UI.qs('#resultView');
  const form = UI.qs('#profileForm');
  const photoInput = UI.qs('#photoInput');
  const photoImage = UI.qs('#photoImage');
  const photoInitial = UI.qs('#photoInitial');
  const cameraPanel = UI.qs('#cameraPanel');
  const cameraVideo = UI.qs('#cameraVideo');
  const cameraCanvas = UI.qs('#cameraCanvas');
  const wishInput = UI.qs('#wishInput');
  let state = null;
  let selectedPhoto = null;
  let cameraStream = null;
  let selectedMood = '🎄';
  let previewObjectUrl = '';

  function setPreview(source, objectUrl = false) {
    if (!source) return;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = objectUrl ? source : '';
    photoImage.src = source;
    photoImage.hidden = false;
    photoInitial.hidden = true;
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
  }

  function syncMood(mood) {
    selectedMood = mood || '🎄';
    UI.qsa('.mood-button').forEach((button) => button.classList.toggle('active', button.dataset.mood === selectedMood));
  }

  function showProfile() {
    loading.hidden = true;
    resultView.hidden = true;
    profileView.hidden = false;
  }

  function showResult(targetName, celebrate = false) {
    stopCamera();
    loading.hidden = true;
    profileView.hidden = true;
    resultView.hidden = false;
    UI.qs('#targetName').textContent = targetName || 'Mistero';
    UI.qs('#partyLink').href = state.event.publicPath;
    if (celebrate) {
      UI.confetti();
      UI.playBell();
    }
  }

  function renderState() {
    const participant = state.participant;
    UI.qs('#joinEventLabel').textContent = state.event.name.toUpperCase();
    UI.qs('#participantName').textContent = participant.name;
    photoInitial.textContent = UI.initials(participant.name);
    wishInput.value = participant.wish || '';
    UI.qs('#wishCount').textContent = wishInput.value.length;
    syncMood(participant.mood);
    if (participant.photoUrl) setPreview(participant.photoUrl);
    if (participant.revealed) showResult(participant.targetName, false);
    else showProfile();
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw(context, width, height) { context.drawImage(bitmap, 0, 0, width, height); },
          close() { bitmap.close?.(); },
        };
      } catch (_error) {}
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await image.decode();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        draw(context, width, height) { context.drawImage(image, 0, 0, width, height); },
        close() {},
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  async function optimizePhoto(file) {
    if (!String(file.type || '').startsWith('image/')) throw new Error('Seleziona un file immagine.');
    let decoded;
    try {
      decoded = await decodeImage(file);
    } catch (_error) {
      if (file.size <= 3.8 * 1024 * 1024) return file;
      throw new Error('Questa foto non può essere compressa dal browser. Scegline una più piccola o scattane una dal sito.');
    }

    try {
      const attempts = [
        { max: 1400, quality: .84 },
        { max: 1200, quality: .76 },
        { max: 1000, quality: .68 },
      ];
      let best = null;
      for (const attempt of attempts) {
        const scale = Math.min(1, attempt.max / Math.max(decoded.width, decoded.height));
        const width = Math.max(1, Math.round(decoded.width * scale));
        const height = Math.max(1, Math.round(decoded.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        decoded.draw(context, width, height);
        const blob = await canvasBlob(canvas, attempt.quality);
        if (!blob) continue;
        best = blob;
        if (blob.size <= 2.2 * 1024 * 1024) break;
      }
      if (!best) throw new Error('Non sono riuscito a preparare la foto.');
      if (file.size < best.size && file.size <= 3.8 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return file;
      }
      if (best.size > 3.8 * 1024 * 1024) throw new Error('La foto è ancora troppo grande. Scegline una più leggera.');
      return new File([best], 'foto-secret-santa.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      decoded.close();
    }
  }

  try {
    state = await UI.api(`/api/participant/${participantToken}`);
    renderState();
  } catch (error) {
    loading.innerHTML = '';
    const icon = document.createElement('div');
    icon.className = 'gift-loader';
    icon.textContent = '🧊';
    const title = document.createElement('h1');
    title.textContent = 'Questo pacchetto non si apre';
    const text = document.createElement('p');
    text.textContent = error.message;
    loading.append(icon, title, text);
    return;
  }

  UI.qsa('.mood-button').forEach((button) => {
    button.addEventListener('click', () => syncMood(button.dataset.mood));
  });

  wishInput.addEventListener('input', () => {
    UI.qs('#wishCount').textContent = wishInput.value.length;
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    selectedPhoto = null;
    photoInput.disabled = true;
    try {
      UI.toast('Ottimizzo la foto per il caricamento…');
      selectedPhoto = await optimizePhoto(file);
      setPreview(URL.createObjectURL(selectedPhoto), true);
      const sizeMb = selectedPhoto.size / (1024 * 1024);
      UI.toast(`Foto pronta (${sizeMb.toFixed(1)} MB).`);
    } catch (error) {
      photoInput.value = '';
      UI.toast(error.message, 'error');
    } finally {
      photoInput.disabled = false;
    }
  });

  UI.qs('#cameraButton').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      UI.toast('La fotocamera diretta non è disponibile qui. Usa “Carica foto” per aprire la fotocamera del telefono.', 'error');
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      cameraVideo.srcObject = cameraStream;
      cameraPanel.hidden = false;
      cameraPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_error) {
      UI.toast('Non riesco ad accedere alla fotocamera. Controlla i permessi oppure usa “Carica foto”.', 'error');
    }
  });

  UI.qs('#closeCamera').addEventListener('click', stopCamera);

  UI.qs('#captureButton').addEventListener('click', () => {
    const width = cameraVideo.videoWidth || 720;
    const height = cameraVideo.videoHeight || 720;
    const size = Math.min(width, height);
    cameraCanvas.width = 900;
    cameraCanvas.height = 900;
    const context = cameraCanvas.getContext('2d');
    context.save();
    context.translate(900, 0);
    context.scale(-1, 1);
    context.drawImage(
      cameraVideo,
      (width - size) / 2,
      (height - size) / 2,
      size,
      size,
      0,
      0,
      900,
      900
    );
    context.restore();
    cameraCanvas.toBlob((blob) => {
      if (!blob) return;
      selectedPhoto = new File([blob], 'selfie-secret-santa.jpg', { type: 'image/jpeg' });
      setPreview(URL.createObjectURL(blob), true);
      stopCamera();
      UI.toast('Foto scattata! Ora puoi aprire il pacchetto.');
    }, 'image/jpeg', .86);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedPhoto && !state.participant.photoUrl) {
      UI.toast('Aggiungi una foto prima di aprire il pacchetto.', 'error');
      return;
    }
    const button = UI.qs('#revealButton');
    button.disabled = true;
    button.querySelector('span').textContent = 'Le renne stanno controllando…';
    try {
      const data = new FormData();
      if (selectedPhoto) data.append('photo', selectedPhoto);
      data.append('wish', wishInput.value);
      data.append('mood', selectedMood);
      const profile = await UI.api(`/api/participant/${participantToken}/profile`, { method: 'POST', body: data });
      state.participant.photoUrl = profile.photoUrl;
      state.participant.wish = wishInput.value;
      state.participant.mood = selectedMood;
      selectedPhoto = null;
      const reveal = await UI.api(`/api/participant/${participantToken}/reveal`, { method: 'POST' });
      state.participant.revealed = true;
      state.participant.targetName = reveal.targetName;
      showResult(reveal.targetName, true);
    } catch (error) {
      UI.toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = state?.participant?.revealed ? 'Salva aggiornamenti' : 'Salva e apri il pacchetto';
    }
  });

  UI.qs('#editProfileButton').addEventListener('click', () => {
    UI.qs('#revealButton').querySelector('span').textContent = 'Salva aggiornamenti';
    showProfile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('beforeunload', () => {
    stopCamera();
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  });
});
