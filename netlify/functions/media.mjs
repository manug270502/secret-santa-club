import { getStore } from '@netlify/blobs';
import { createMediaHandler } from '../../src/api-app.mjs';

const STORE_REGION = 'eu-central-1';
let cachedRegion = '';
let cachedHandler = null;

function getMediaHandler() {
  const region = process.env.BLOBS_REGION || STORE_REGION;
  if (cachedHandler && cachedRegion === region) return cachedHandler;
  const mediaStore = getStore({
    name: 'secret-santa-media-v2',
    region,
    consistency: 'eventual',
  });
  cachedRegion = region;
  cachedHandler = createMediaHandler({ mediaStore });
  return cachedHandler;
}

export default async function handler(request) {
  return getMediaHandler()(request);
}
