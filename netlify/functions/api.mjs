import { getStore } from '@netlify/blobs';
import { createApiHandler } from '../../src/api-app.mjs';

const storeOptions = { region: process.env.BLOBS_REGION || 'eu-central-1', consistency: 'strong' };
const dataStore = getStore({ name: 'secret-santa-data-v2', ...storeOptions });
const mediaStore = getStore({ name: 'secret-santa-media-v2', ...storeOptions });
const handler = createApiHandler({ dataStore, mediaStore, env: process.env });

export default handler;

