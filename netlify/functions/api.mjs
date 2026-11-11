import { getStore } from '@netlify/blobs';
import { createApiHandler } from '../../src/api-app.mjs';

const STORE_REGION = 'eu-central-1';

export default async function handler(request) {
  const region = process.env.BLOBS_REGION || STORE_REGION;

  // Initialize Blobs inside the invocation so Netlify's runtime context
  // (site ID/token) is already available when getStore() is called.
  const dataStore = getStore({
    name: 'secret-santa-data-v2',
    region,
    consistency: 'strong',
  });
  const mediaStore = getStore({
    name: 'secret-santa-media-v2',
    region,
    consistency: 'strong',
  });

  const apiHandler = createApiHandler({ dataStore, mediaStore, env: process.env });
  return apiHandler(request);
}
