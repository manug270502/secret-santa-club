import { getStore } from '@netlify/blobs';
import { createApiHandler } from '../../src/api-app.mjs';

const STORE_REGION = 'eu-central-1';
let cachedRegion = '';
let cachedHandler = null;

function getApiHandler() {
  const region = process.env.BLOBS_REGION || STORE_REGION;
  if (cachedHandler && cachedRegion === region) return cachedHandler;

  // Most ordinary reads can use the faster eventual path. Repository methods
  // explicitly request strong consistency for writes, authentication and
  // immediate post-write reads.
  const dataStore = getStore({
    name: 'secret-santa-data-v2',
    region,
    consistency: 'eventual',
  });
  const mediaStore = getStore({
    name: 'secret-santa-media-v2',
    region,
    consistency: 'eventual',
  });

  cachedRegion = region;
  cachedHandler = createApiHandler({ dataStore, mediaStore, env: process.env });
  return cachedHandler;
}

export default async function handler(request) {
  return getApiHandler()(request);
}
