import { z } from 'zod';
import { firebaseIdentity, readAttestedConfig, type ClientConfig, type Identity } from './attested-identity';
import { FASHION_PHOTO_MAX_BYTES, FASHION_PHOTO_MAX_SIDE } from './fashion-photo';
import { MUSE_IMAGE_MAX_BYTES, MUSE_IMAGE_TIMEOUT_MS, type MuseImageResult } from './muse-image';
import { rasterDimensions } from './standalone-media';

export const FUNDED_IMAGE_LIMITS = { guestLifetime: 2, globalDaily: 20, globalLifetime: 100, concurrency: 1 } as const;
// Image edits can outlast Hosting's 60-second rewrite timeout. Keep the origin fixed;
// the image service enforces Auth, App Check and a production-origin CORS allowlist.
export const FUNDED_IMAGE_ENDPOINT = 'https://us-central1-nonhumanintelligence.cloudfunctions.net/motFundedImages/api/muse/images/edit';
const unavailable = () => Error('The free image preview is unavailable. You can choose to use your own key.');
const statusSchema = z.object({ available: z.boolean(), transport: z.literal('firebase-attested-image'), readiness: z.literal('configured-only'), limits: z.object({ guestLifetime: z.literal(2), globalDaily: z.literal(20), globalLifetime: z.literal(100), concurrency: z.literal(1) }).strict(), expiresAt: z.iso.datetime().optional(), reason: z.string().max(500).optional() }).strict();
export type FundedImageStatus = z.infer<typeof statusSchema>;
const resultSchema = z.object({ status: z.literal('ok'), data: z.array(z.object({ b64_json: z.string().min(1).max(Math.ceil(MUSE_IMAGE_MAX_BYTES * 4 / 3) + 4) }).strict()).length(1), output_format: z.literal('png'), model: z.literal('muse-image-1.0'), createdAt: z.iso.datetime(), elapsedMs: z.number().int().nonnegative().max(3_600_000), width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) }).strict();
interface Dependencies { fetcher?: typeof fetch; identity?: (config: ClientConfig) => Promise<Identity>; decode?: (blob: Blob) => Promise<{ width: number; height: number }>; }
async function boundedJson(response: Response, maximum: number): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > maximum) { void response.body?.cancel(); throw unavailable(); }
  const reader = response.body?.getReader(); if (!reader) throw unavailable();
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maximum) throw unavailable(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw unavailable(); }
}
function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('Stopped. Nothing was added.')); signal.addEventListener('abort', abort, { once: true });
    void pending.then(value => { signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
export function createFundedImageClient(deps: Dependencies = {}) {
  const fetcher = deps.fetcher ?? fetch; let identity: Promise<Identity> | undefined;
  async function status(signal: AbortSignal): Promise<FundedImageStatus> {
    try {
      const response = await fetcher('/api/muse/images/status', { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw unavailable();
      const value = statusSchema.parse(await boundedJson(response, 4096)); signal.throwIfAborted();
      return value.expiresAt && Date.parse(value.expiresAt) <= Date.now() ? { ...value, available: false, reason: 'The free hackathon image preview has ended.' } : value;
    } catch { signal.throwIfAborted(); return { available: false, transport: 'firebase-attested-image', readiness: 'configured-only', limits: FUNDED_IMAGE_LIMITS, reason: unavailable().message }; }
  }
  return { status, async generate(request: { style: 'fashion' | 'city'; source: Blob; photoConsent: boolean; signal: AbortSignal }): Promise<MuseImageResult> {
    if (request.photoConsent !== true) throw Error('Agree to send this prepared photo through MoT to Meta before generating.');
    request.signal.throwIfAborted();
    if (!['fashion', 'city'].includes(request.style) || request.source.type !== 'image/jpeg' || request.source.size > FASHION_PHOTO_MAX_BYTES) throw Error('Choose a prepared JPEG photo within 4 MiB.');
    const source = new Uint8Array(await request.source.arrayBuffer());
    const dimensions = rasterDimensions(source, 'image/jpeg');
    if (!dimensions.width || !dimensions.height || dimensions.width > FASHION_PHOTO_MAX_SIDE || dimensions.height > FASHION_PHOTO_MAX_SIDE) throw Error('Prepare the selected photo before sending it.');
    request.signal.throwIfAborted();
    let binary = ''; for (let i = 0; i < source.length; i += 16384) binary += String.fromCharCode(...source.subarray(i, i + 16384));
    const body = JSON.stringify({ requestId: crypto.randomUUID(), style: request.style, photoBase64: btoa(binary), consent: true });
    if (new TextEncoder().encode(body).length > 6 * 1024 * 1024) throw Error('The prepared photo is too large for the free preview.');
    const abort = new AbortController(), stop = () => abort.abort(); let timedOut = false;
    request.signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, MUSE_IMAGE_TIMEOUT_MS);
    try {
      const ready = await status(abort.signal); if (!ready.available) throw Error(ready.reason || unavailable().message);
      const config = await readAttestedConfig(fetcher, abort.signal).catch(() => { throw unavailable(); }); abort.signal.throwIfAborted();
      if (!identity) identity = (deps.identity ?? (value => firebaseIdentity(value, fetcher)))(config).catch(error => { identity = undefined; throw error; });
      const session = await abortable(identity, abort.signal);
      const [idToken, appCheckToken] = await abortable(Promise.all([session.idToken(), session.appCheckToken()]), abort.signal);
      abort.signal.throwIfAborted(); if (ready.expiresAt && Date.parse(ready.expiresAt) <= Date.now()) throw unavailable();
      const response = await fetcher(FUNDED_IMAGE_ENDPOINT, { method: 'POST', signal: abort.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json', 'x-mot-request': '1', authorization: `Bearer ${idToken}`, 'x-firebase-appcheck': appCheckToken }, body });
      if (!response.ok) {
        const error = z.object({ status: z.enum(['error', 'unavailable']), code: z.string().max(80), reason: z.string().min(1).max(500) }).safeParse(await boundedJson(response, 4096));
        throw Error(error.success ? error.data.reason : 'The free image request did not complete. A sent request may consume an attempt.');
      }
      const parsed = resultSchema.safeParse(await boundedJson(response, Math.ceil(MUSE_IMAGE_MAX_BYTES * 4 / 3) + 4096));
      if (!parsed.success) throw Error('The free preview returned an unreadable image. Nothing was added.');
      const result = parsed.data; abort.signal.throwIfAborted();
      if (result.width * result.height > 16_777_216) throw Error('The returned image exceeds the board limit.');
      const b64 = result.data[0]!.b64_json; if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw Error('The free preview returned invalid image data.');
      const raw = atob(b64), bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
      if (bytes.length > MUSE_IMAGE_MAX_BYTES) throw Error('The returned image is too large.');
      const declared = rasterDimensions(bytes, 'image/png');
      if (declared.width !== result.width || declared.height !== result.height) throw Error('The returned image dimensions do not match.');
      const blob = new Blob([bytes], { type: 'image/png' });
      const size = await (deps.decode ?? (async value => { const bitmap = await createImageBitmap(value); try { return { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close(); } }))(blob);
      abort.signal.throwIfAborted(); if (size.width !== declared.width || size.height !== declared.height) throw Error('The returned image could not be verified.');
      return { blob, mime: 'image/png', width: result.width, height: result.height, model: result.model, elapsedMs: result.elapsedMs, createdAt: result.createdAt };
    } catch (error) {
      if (request.signal.aborted) throw Error('Stopped. A sent request may consume a free attempt. Nothing was added.');
      if (timedOut) throw Error('The free image request timed out. An attempt may have been used; a retry is a new attempt.');
      throw error;
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', stop); }
  } };
}
