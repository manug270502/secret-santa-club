(() => {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  async function api(url, options = {}) {
    const config = { ...options };
    config.headers = { ...(options.headers || {}) };
    if (config.body && !(config.body instanceof FormData) && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(url, config);
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      throw new Error(payload?.error || `Richiesta non riuscita (${response.status}).`);
    }
    return payload;
  }

  function toast(message, type = 'success') {
    const region = qs('#toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(8px)';
      window.setTimeout(() => item.remove(), 250);
    }, 3200);
  }

  async function copyText(text, successMessage = 'Copiato negli appunti.') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    toast(successMessage);
  }

  function tokenFromPath(segment) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const index = parts.indexOf(segment);
    return index >= 0 ? parts[index + 1] || '' : '';
  }

  function formatDate(value, options = {}) {
    if (!value) return 'data da decidere';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...options,
    }).format(date);
  }

  function relativeTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diff / 60000));
    if (minutes < 60) return `${minutes} min fa`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h fa`;
    const days = Math.floor(hours / 24);
    return `${days} g fa`;
  }

  function daysUntil(value) {
    if (!value) return null;
    const target = new Date(`${value}T20:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  }

  function mountAvatar(element, participant, className = '') {
    element.className = `avatar ${className}`.trim();
    element.replaceChildren();
    if (participant.photoUrl) {
      const image = document.createElement('img');
      image.src = participant.photoUrl;
      image.alt = `Foto di ${participant.name}`;
      image.loading = 'lazy';
      element.appendChild(image);
    } else {
      element.textContent = initials(participant.name);
    }
  }

  function whatsappUrl(phone, text) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (/^3\d{9}$/.test(digits)) digits = `39${digits}`;
    const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(text)}`;
  }

  function addSnow() {
    const layer = qs('[data-snow]');
    if (!layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const count = window.innerWidth < 700 ? 26 : 48;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) {
      const flake = document.createElement('span');
      flake.style.setProperty('--left', `${Math.random() * 100}%`);
      flake.style.setProperty('--size', `${2 + Math.random() * 7}px`);
      flake.style.setProperty('--opacity', `${0.22 + Math.random() * 0.6}`);
      flake.style.setProperty('--duration', `${8 + Math.random() * 13}s`);
      flake.style.setProperty('--delay', `${-Math.random() * 18}s`);
      flake.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
      flake.style.setProperty('--blur', `${Math.random() * 1.4}px`);
      fragment.appendChild(flake);
    }
    layer.appendChild(fragment);
  }

  function confetti() {
    const layer = qs('#confettiLayer');
    if (!layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#c5334a', '#f0bd4d', '#2f7358', '#ffffff', '#ef9f4d'];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 90; index += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.setProperty('--confetti', colors[index % colors.length]);
      piece.style.setProperty('--duration', `${2.2 + Math.random() * 2.2}s`);
      piece.style.setProperty('--delay', `${Math.random() * .7}s`);
      piece.style.setProperty('--x', `${-100 + Math.random() * 200}px`);
      fragment.appendChild(piece);
    }
    layer.replaceChildren(fragment);
    window.setTimeout(() => layer.replaceChildren(), 5200);
  }

  function playBell() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    [880, 1174.66, 1396.91].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * .1);
      gain.gain.linearRampToValueAtTime(.11, now + index * .1 + .02);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .1 + .75);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * .1);
      oscillator.stop(now + index * .1 + .8);
    });
    window.setTimeout(() => context.close(), 1400);
  }

  window.ChristmasUI = {
    qs,
    qsa,
    api,
    toast,
    copyText,
    tokenFromPath,
    formatDate,
    relativeTime,
    daysUntil,
    initials,
    mountAvatar,
    whatsappUrl,
    confetti,
    playBell,
  };

  document.addEventListener('DOMContentLoaded', addSnow);
})();
