import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const assetVersion = String(packageJson.version || '').trim();
const required = [
  'netlify.toml',
  'netlify/functions/api.mjs',
  'netlify/functions/media.mjs',
  'src/api-app.mjs',
  'src/domain.mjs',
  'src/repository.mjs',
  'src/super-admin-auth.mjs',
  'public/index.html',
  'public/admin.html',
  'public/my-events.html',
  'public/participant.html',
  'public/dashboard.html',
  'public/super-admin.html',
  'public/js/common.js',
  'public/js/home.js',
  'public/js/admin.js',
  'public/js/my-events.js',
  'public/js/participant.js',
  'public/js/dashboard.js',
  'public/js/super-admin.js',
  'public/css/styles.css',
  'scripts/generate-superadmin-hash.mjs',
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
  'src/super-admin-auth.mjs',
  'scripts/generate-superadmin-hash.mjs',
  'public/js/common.js',
  'public/js/home.js',
  'public/js/admin.js',
  'public/js/my-events.js',
  'public/js/participant.js',
  'public/js/dashboard.js',
  'public/js/super-admin.js',
];

for (const relative of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Errore di sintassi in ${relative}:\n${result.stderr || result.stdout}`);
    process.exit(result.status || 1);
  }
}

const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
for (const expected of ['from = "/super-admin"', 'to = "/super-admin.html"', 'for = "/super-admin"', 'for = "/super-admin.html"']) {
  if (!toml.includes(expected)) {
    console.error(`Configurazione Netlify incompleta: manca ${expected}`);
    process.exit(1);
  }
}

for (const htmlName of ['index.html', 'admin.html', 'my-events.html', 'participant.html', 'dashboard.html', 'super-admin.html']) {
  const html = fs.readFileSync(path.join(root, 'public', htmlName), 'utf8');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    console.error(`Script inline non consentito dalla CSP trovato in public/${htmlName}.`);
    process.exit(1);
  }
  if (!html.includes(`/css/styles.css?v=${assetVersion}`)) {
    console.error(`Versione CSS non allineata a package.json in public/${htmlName}.`);
    process.exit(1);
  }
  const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (scriptSources.some((source) => source.startsWith('/js/') && !source.endsWith(`?v=${assetVersion}`))) {
    console.error(`Versione JavaScript non allineata a package.json in public/${htmlName}.`);
    process.exit(1);
  }
}


const superAdminHtml = fs.readFileSync(path.join(root, 'public/super-admin.html'), 'utf8');
const superAdminJs = fs.readFileSync(path.join(root, 'public/js/super-admin.js'), 'utf8');
const htmlIds = new Set([...superAdminHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const duplicateIds = [...superAdminHtml.matchAll(/\bid="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((id, index, all) => all.indexOf(id) !== index);
if (duplicateIds.length) {
  console.error(`ID HTML duplicati nel Control Center: ${[...new Set(duplicateIds)].join(', ')}`);
  process.exit(1);
}
const referencedIds = [...superAdminJs.matchAll(/UI\.qs\(['"]#([^'"]+)['"]\)/g)].map((match) => match[1]);
const missingIds = referencedIds.filter((id) => !htmlIds.has(id));
if (missingIds.length) {
  console.error(`Elementi HTML mancanti per il Control Center: ${[...new Set(missingIds)].join(', ')}`);
  process.exit(1);
}

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const variable of ['SUPERADMIN_USERNAME', 'SUPERADMIN_PASSWORD_HASH', 'SUPERADMIN_SESSION_SECRET']) {
  if (!envExample.includes(`${variable}=`)) {
    console.error(`Variabile ${variable} mancante da .env.example.`);
    process.exit(1);
  }
}

console.log(`✓ Struttura Netlify v${assetVersion} verificata: Control Center, frontend, Functions, Blobs e route private pronti.`);
console.log(`✓ Sintassi verificata per ${syntaxFiles.length} file JavaScript.`);
console.log('✓ CSP senza script inline, asset versionati e riferimenti DOM del Control Center verificati.');
