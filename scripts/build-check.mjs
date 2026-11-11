import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'netlify.toml',
  'netlify/functions/api.mjs',
  'netlify/functions/media.mjs',
  'public/index.html',
  'public/admin.html',
  'public/participant.html',
  'public/dashboard.html',
  'public/js/common.js',
  'public/js/home.js',
  'public/js/admin.js',
  'public/js/participant.js',
  'public/js/dashboard.js',
  'public/css/styles.css',
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
if (missing.length) {
  console.error(`File mancanti:\n- ${missing.join('\n- ')}`);
  process.exit(1);
}

const forbidden = ['data/store.json', 'uploads'];
const presentForbidden = forbidden.filter((item) => fs.existsSync(path.join(root, item)));
if (presentForbidden.length) {
  console.error(`Persistenza locale non compatibile con Netlify trovata: ${presentForbidden.join(', ')}`);
  process.exit(1);
}

console.log('✓ Struttura Netlify verificata: frontend, Functions e storage Blob pronti.');
