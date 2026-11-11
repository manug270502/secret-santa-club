import { getStore } from '@netlify/blobs';
import { createMediaHandler } from '../../src/api-app.mjs';

const STORE_REGION = 'eu-central-1';

export default async function handler(request) {
  const mediaStore = getStore({
    name: 'secret-santa-media-v2',
    region: process.env.BLOBS_REGION || STORE_REGION,
    consistency: 'strong',
  });

  const mediaHandler = createMediaHandler({ mediaStore });
  return mediaHandler(request);
}
