// BYOK Muse Image generation (MOT-151). The traveler's own Meta key lives only in the
// panel's memory and goes from this browser straight to Meta's fixed images endpoint,
// which answers CORS preflight for any origin (checked 3 Nov 2026). Nothing here stores,
// logs or exports the key, and nothing calls the provider except an explicit Generate.
import { MUSE_IMAGE_ASPECTS, MUSE_IMAGE_MODEL, type MuseImageAspect } from '@mot/core';
import { rasterDimensions } from './standalone-media';
import { FASHION_PHOTO_MAX_BYTES, FASHION_PHOTO_MAX_SIDE } from './fashion-photo';

export const MUSE_IMAGE_ENDPOINT = 'https://api.meta.ai/v1/images/generations';
export const MUSE_IMAGE_EDIT_ENDPOINT = 'https://api.meta.ai/v1/images/edits';
/** Generation with grounding can take minutes; past this the outcome (and any charge) is uncertain. */
export const MUSE_IMAGE_TIMEOUT_MS = 240_000;
export const MUSE_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
export const MUSE_IMAGE_PRICE_NOTE = 'US$0.01 per generated image, as listed by Meta on 3 Nov 2026';
export const MUSE_IMAGE_PRICING_URL = 'https://dev.meta.ai/docs/pricing-rate-limits';

export type MuseImageFailure = 'key' | 'rate' | 'policy' | 'rejected' | 'provider' | 'network' | 'malformed' | 'timeout' | 'cancelled' | 'busy';
export class MuseImageError extends Error {
  /** True when Meta may have generated (and billed) an image we never received. */
  readonly uncertain: boolean;
  readonly kind: MuseImageFailure;
  constructor(kind: MuseImageFailure, message: string, uncertain = false) { super(message); this.name = 'MuseImageError'; this.kind = kind; this.uncertain = uncertain; }
}

export interface MuseImageResult { blob: Blob; width: number; height: number; mime: string; elapsedMs: number; createdAt: string; model: string }
export interface MuseImageRequest { key: string; prompt: string; aspect: MuseImageAspect; signal?: AbortSignal; sourcePhoto?: Blob; styleReference?: Blob; preserveSourceAspect?: boolean }
export interface MuseImageDeps { fetcher?: typeof fetch; decode?: (blob: Blob) => Promise<{ width: number; height: number }>; timeoutMs?: number; now?: () => number }

/** The exact allowlisted body; image search stays on for recognizable landmarks, web search and shell are off. */
export function museImageBody(prompt: string, aspect: MuseImageAspect, sourceDataUrl?: string, sourceSize?: string, styleDataUrl?: string) {
  return {
    model: MUSE_IMAGE_MODEL, prompt, n: 1, size: sourceSize ?? MUSE_IMAGE_ASPECTS[aspect],
    response_format: 'b64_json', output_format: 'png', reasoning_strength: 'high', stream: false,
    tool_enablement: { enable_image_search: !sourceDataUrl, enable_web_search: false, enable_shell: false },
    ...(sourceDataUrl ? { images: [{ image_url: sourceDataUrl }, ...(styleDataUrl ? [{ image_url: styleDataUrl }] : [])] } : {}),
  } as const;
}

const inFlight = new Set<string>();

const decodeBitmap = async (blob: Blob) => { const image = await createImageBitmap(blob); try { return { width: image.width, height: image.height }; } finally { image.close(); } };

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/** Only status and documented error codes are read; provider message text is never shown. */
async function failureFor(response: Response): Promise<MuseImageError> {
  let code = '';
  try { const body = await response.json() as { error?: { code?: unknown } }; code = typeof body?.error?.code === 'string' ? body.error.code : ''; } catch { /* body is not needed */ }
  if (response.status === 401 || response.status === 403) return new MuseImageError('key', 'Meta did not accept this API key. Check it, or create a key in your Meta developer account.');
  if (response.status === 429) return new MuseImageError('rate', 'Meta is rate-limiting this key. Wait a minute before trying again.');
  if (response.status === 400 && code === 'content_policy_violation') return new MuseImageError('policy', 'Meta declined this prompt under its content policy. Change the subject or wording.');
  if (response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422) return new MuseImageError('rejected', `Meta rejected the request (${response.status}${code ? ` · ${code.slice(0, 60)}` : ''}). Nothing was added.`);
  return new MuseImageError('provider', `Meta's image service failed (${response.status}). It may or may not have billed an image.`, response.status >= 500);
}

export async function generateMuseImage(request: MuseImageRequest, deps: MuseImageDeps = {}): Promise<MuseImageResult> {
  const key = request.key.trim(), prompt = request.prompt.trim();
  if (!key) throw new MuseImageError('key', 'Enter your Meta API key for this session.');
  if (!prompt || prompt.length > 4000) throw new MuseImageError('rejected', 'The prompt must be between 1 and 4,000 characters.');
  // One request per key at a time, so a double click cannot be billed twice.
  const slot = key.slice(-12);
  if (inFlight.has(slot)) throw new MuseImageError('busy', 'An image is already being generated. Wait for it or press Stop.');
  inFlight.add(slot);
  const now = deps.now ?? Date.now, started = now(), controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deps.timeoutMs ?? MUSE_IMAGE_TIMEOUT_MS);
  const stop = () => controller.abort();
  request.signal?.addEventListener('abort', stop, { once: true });
  const settled = () => { if (request.signal?.aborted) throw new MuseImageError('cancelled', 'Stopped. Meta may still have generated and billed the image.', true); if (timedOut) throw new MuseImageError('timeout', 'No image after 4 minutes. Meta may still have generated and billed it.', true); };
  try {
    if (request.signal?.aborted) throw new MuseImageError('cancelled', 'Stopped before sending. Nothing was charged.');
    let sourceDataUrl: string | undefined;
    let sourceSize: string | undefined;
    let styleDataUrl: string | undefined;
    if (request.styleReference && !request.sourcePhoto) throw new MuseImageError('rejected', 'Choose a source photo before using a style reference.');
    if (request.sourcePhoto) {
      const photo = request.sourcePhoto;
      if (photo.size > FASHION_PHOTO_MAX_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) throw new MuseImageError('rejected', 'Choose a prepared PNG, JPEG or simple static WebP photo within the 4 MiB limit.');
      const bytes = new Uint8Array(await photo.arrayBuffer());
      let dimensions: { width: number; height: number };
      try { dimensions = rasterDimensions(bytes, photo.type); } catch { throw new MuseImageError('rejected', 'The selected photo has an unsupported image structure.'); }
      if (!dimensions.width || !dimensions.height || dimensions.width > FASHION_PHOTO_MAX_SIDE || dimensions.height > FASHION_PHOTO_MAX_SIDE) throw new MuseImageError('rejected', 'Prepare the selected photo before sending it.');
      if (request.preserveSourceAspect) sourceSize = `${dimensions.width}x${dimensions.height}`;
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      sourceDataUrl = `data:${photo.type};base64,${btoa(binary)}`;
      settled();
    }
    if (request.styleReference) {
      const reference = request.styleReference;
      if (reference.type !== 'image/png' || reference.size > 1024 * 1024) throw new MuseImageError('rejected', 'Use the approved PNG style reference within the 1 MiB limit.');
      const bytes = new Uint8Array(await reference.arrayBuffer());
      try {
        const size = rasterDimensions(bytes, reference.type);
        if (size.width > FASHION_PHOTO_MAX_SIDE || size.height > FASHION_PHOTO_MAX_SIDE) throw Error();
      } catch { throw new MuseImageError('rejected', 'The style reference has an unsupported image structure.'); }
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      styleDataUrl = `data:image/png;base64,${btoa(binary)}`;
      settled();
    }
    let response: Response;
    try {
      response = await (deps.fetcher ?? fetch)(sourceDataUrl ? MUSE_IMAGE_EDIT_ENDPOINT : MUSE_IMAGE_ENDPOINT, {
        method: 'POST', signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(museImageBody(prompt, request.aspect, sourceDataUrl, sourceSize, styleDataUrl)),
      });
    } catch { settled(); throw new MuseImageError('network', 'The request did not complete. Meta may or may not have generated and billed the image.', true); }
    settled();
    if (!response.ok) throw await failureFor(response);
    let json: { data?: { b64_json?: unknown }[]; output_format?: unknown };
    try { json = await response.json(); } catch { settled(); throw new MuseImageError('malformed', 'Meta returned an unreadable response. Nothing was added.', true); }
    settled();
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== 'string' || !b64 || b64.length > Math.ceil(MUSE_IMAGE_MAX_BYTES * 4 / 3) + 4) throw new MuseImageError('malformed', 'Meta returned no usable image. Nothing was added.', true);
    let bytes: Uint8Array;
    try { const raw = atob(b64.replace(/^data:[^,]*,/, '')); bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0)); } catch { throw new MuseImageError('malformed', 'Meta returned image data that does not decode. Nothing was added.', true); }
    const mime = sniff(bytes);
    if (!mime) throw new MuseImageError('malformed', 'Meta returned bytes that are not a PNG, JPEG or WebP image. Nothing was added.', true);
    // Read the declared size from the image header and refuse anything beyond the board's limits before decoding it.
    let declared: { width: number; height: number };
    try { declared = rasterDimensions(bytes, mime); } catch { throw new MuseImageError('malformed', 'Meta returned image data with an incomplete or unsupported structure. Nothing was added.', true); }
    if (declared.width > 8192 || declared.height > 8192 || declared.width * declared.height > 16_777_216) throw new MuseImageError('malformed', 'Meta returned an image larger than the board accepts. Nothing was added.', true);
    const blob = new Blob([bytes as BlobPart], { type: mime });
    let size: { width: number; height: number };
    try { size = await (deps.decode ?? decodeBitmap)(blob); } catch { throw new MuseImageError('malformed', 'The returned image could not be decoded. Nothing was added.', true); }
    settled();
    if (!(size.width > 0 && size.height > 0) || size.width > 8192 || size.height > 8192 || size.width * size.height > 16_777_216) throw new MuseImageError('malformed', 'The returned image has no pixels. Nothing was added.', true);
    return { blob, mime, width: size.width, height: size.height, elapsedMs: now() - started, createdAt: new Date().toISOString(), model: MUSE_IMAGE_MODEL };
  } finally {
    clearTimeout(timer); request.signal?.removeEventListener('abort', stop); inFlight.delete(slot);
  }
}

/** Off by default. `?museImage=on` or `?museImage=off` sets this browser's choice; it holds no secret. */
export function museImageEnabled(): boolean {
  try {
    const flag = new URLSearchParams(location.search).get('museImage');
    if (flag === 'on' || flag === 'off') localStorage.setItem('mot-muse-image', flag);
    return localStorage.getItem('mot-muse-image') === 'on';
  } catch { return false; }
}
