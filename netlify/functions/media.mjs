import { getStore } from '@netlify/blobs';
import { createMediaHandler } from '../../src/api-app.mjs';

const mediaStore = getStore({
  name: 'secret-santa-media-v2',
  region: process.env.BLOBS_REGION || 'eu-central-1',
  consistency: 'strong',
});
const handler = createMediaHandler({ mediaStore });

export default handler;

