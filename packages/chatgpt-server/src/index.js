import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { createChatGPTHandler } from './auth.ts';
import { serveChatGPT } from './firebase-adapter.ts';

const app = initializeApp();
// Keep OAuth tokens in a database with its own deny-all browser security rules.
const database = getFirestore(app, 'writers-board-chatgpt');
const connections = database.collection('connections');
const oauthConfig = defineSecret('CHATGPT_OAUTH_CONFIG');

const store = {
  async read(key) {
    const snapshot = await connections.doc(key).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async transact(key, change) {
    const reference = connections.doc(key);
    return database.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const { next, result } = change(snapshot.exists ? snapshot.data() : undefined);
      if (next) transaction.set(reference, { ...next, deleteAfter: new Date(next.expiresAt) });
      else transaction.delete(reference);
      return result;
    });
  },
};

let handler;
let configuration;
export const chatgpt = onRequest({
  region: 'us-central1', timeoutSeconds: 60, memory: '256MiB',
  invoker: 'public', cors: false, secrets: [oauthConfig],
}, async (request, response) => {
  try {
    if (!handler) {
      const value = JSON.parse(oauthConfig.value());
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.appOrigin !== 'string') throw new Error('Invalid configuration');
      configuration = value;
      handler = createChatGPTHandler(configuration, { store });
    }
    await serveChatGPT(request, response, handler, configuration.appOrigin);
  } catch {
    // JSON parser errors can contain secret fragments; never log or expose them.
    response.set('Cache-Control', 'private, no-store').status(503).json({ error: { message: 'The hosted ChatGPT connection needs its approved OpenAI client configuration.' } });
  }
});
