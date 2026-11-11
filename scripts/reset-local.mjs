import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.rm(path.join(root, '.local-data'), { recursive: true, force: true });
console.log('✓ Dati locali eliminati. I dati pubblicati su Netlify non sono stati toccati.');
