import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'netlify.toml',
  'netlify/functions/api.mjs',
  'netlify/functions/media.mjs',
  'src/api-app.mjs',
  'src/domain.mjs',
  'src/repository.mjs',
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
  '.env.example',
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

const syntaxFiles = [
  'server-local.mjs',
  'netlify/functions/api.mjs',
  'netlify/functions/media.mjs',
  'src/api-app.mjs',
  'src/domain.mjs',
  'src/file-blob-store.mjs',
  'src/repository.mjs',
  'public/js/common.js',
  'public/js/home.js',
  'public/js/admin.js',
  'public/js/participant.js',
  'public/js/dashboard.js',
];

for (const relative of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`Errore di sintassi in ${relative}:\n${result.stderr || result.stdout}`);
    process.exit(result.status || 1);
  }
}

console.log('✓ Struttura Netlify verificata: frontend, Functions, Blob e inviti WhatsApp click-to-chat pronti.');
console.log(`✓ Sintassi verificata per ${syntaxFiles.length} file JavaScript.`);
