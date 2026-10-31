// Direct FCC catalog-to-free-board insertion (MOT-120): one selected original, board surface only.
import { readAllCards, readPresentations, type Actor, type TripSession } from '@writers-board/core';
import { artworkSchema, type Artwork } from '../artwork/catalog';
import { MAX_BOARD_IMAGE_BYTES, prepareBoardImages } from './board-images';
import { BOARD_SIZE, STACK_LIMIT, imagePlacementRect } from './free-board-actions';
import { commitTripBlobs } from './trip-assets';

interface InFlightEntry { signal: AbortSignal; committed: boolean }
const inFlight = new WeakMap<object, InFlightEntry>();
const SUPPORTED_MIME = /^image\/(png|jpeg|webp|gif|avif)$/;

async function fetchBoundedOriginal(url: string, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
  if (signal.aborted) {
    void response.body?.cancel().catch(() => undefined);
    signal.throwIfAborted();
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Artwork download failed (${response.status}). Retry or choose another image.`);
  }
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime && !SUPPORTED_MIME.test(mime)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('This artwork is not a supported image.');
  }
  const advertised = response.headers.get('content-length');
  if (advertised !== null && advertised.trim() !== '') {
    const length = Number(advertised);
    if (Number.isFinite(length) && length > MAX_BOARD_IMAGE_BYTES) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error('This artwork is over the 10 MiB limit. Nothing was added.');
    }
  }
  if (!response.body) {
    const blob = await response.blob();
    signal.throwIfAborted();
    if (blob.size > MAX_BOARD_IMAGE_BYTES) throw new Error('This artwork is over the 10 MiB limit. Nothing was added.');
    if (blob.type && !SUPPORTED_MIME.test(blob.type)) throw new Error('This artwork is not a supported image.');
    return blob;
  }
  const reader = response.body.getReader();
  const cancelOnAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancelOnAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      signal.throwIfAborted();
      if (value) {
        total += value.byteLength;
        if (total > MAX_BOARD_IMAGE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error('This artwork is over the 10 MiB limit. Nothing was added.');
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    if (signal.aborted) await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    try { reader.releaseLock(); } catch { /* already released by cancellation */ }
  }
  signal.throwIfAborted();
  const blob = new Blob(chunks as BlobPart[], { type: mime });
  if (blob.size > MAX_BOARD_IMAGE_BYTES) throw new Error('This artwork is over the 10 MiB limit. Nothing was added.');
  return blob;
}

export async function placeBoardArtwork(session: TripSession, actor: Actor, artwork: Artwork, signal: AbortSignal, options: { origin?: { x: number; y: number }; onCommitted?: () => void } = {}): Promise<{ persisted: boolean; presentationId: string }> {
  const actorSnapshot: Actor = { ...actor };
  if (actorSnapshot.kind !== 'human') throw new Error('Only a person can add artwork to the board.');
  signal.throwIfAborted();
  const parsed = artworkSchema.parse(structuredClone(artwork));
  const originSnapshot = options.origin ? { x: options.origin.x, y: options.origin.y } : { x: 120, y: 120 };
  const onCommitted = options.onCommitted;
  const ref = parsed.artRef;
  if (parsed.subject === 'apparel' || ref?.kind === 'apparel-mockup' || ref?.category === 'apparel') {
    throw new Error('Apparel belongs in Wear the trip, not decorative artwork.');
  }
  const selectedUrl = parsed.original ?? parsed.src;
  new URL(selectedUrl);
  if (!Number.isFinite(originSnapshot.x) || !Number.isFinite(originSnapshot.y)) {
    throw new RangeError('There is no room for that image there. Nothing changed.');
  }
  const crop = (parsed.crop ?? [0, 0, 1, 1]) as [number, number, number, number];
  // Validate placement from the catalogued dimensions and crop before any fetch; decoded bytes are rechecked below.
  imagePlacementRect(parsed.width * crop[2], parsed.height * crop[3], originSnapshot);
  const existing = inFlight.get(session as object);
  if (existing && (existing.committed || !existing.signal.aborted)) {
    throw new Error('Artwork is already being added. Nothing changed. Wait for that to finish or cancel it first.');
  }
  const entry: InFlightEntry = { signal, committed: false };
  inFlight.set(session as object, entry);
  let presentationId = '';
  try {
    signal.throwIfAborted();
    const originalBlob = await fetchBoundedOriginal(selectedUrl, signal);
    signal.throwIfAborted();
    const file = new File([originalBlob], parsed.label, { type: originalBlob.type });
    const prepared = await prepareBoardImages([file], signal);
    signal.throwIfAborted();
    if (prepared.length !== 1) throw new Error('That artwork could not be prepared. Nothing was added.');
    const image = prepared[0]!;
    if (image.width !== parsed.width || image.height !== parsed.height) {
      throw new Error('The original pixel size changed. Refresh the catalog before adding it.');
    }
    if (ref && (image.width !== ref.width || image.height !== ref.height)) {
      throw new Error('The original pixel size changed. Refresh the catalog before adding it.');
    }
    if (ref?.mimeType && image.blob.type !== ref.mimeType) {
      throw new Error('The original image type changed. Refresh the catalog before adding it.');
    }
    const displayWidth = image.width * crop[2];
    const displayHeight = image.height * crop[3];
    const rect = imagePlacementRect(displayWidth, displayHeight, originSnapshot);
    const assetId = crypto.randomUUID();
    signal.throwIfAborted();
    let applied = false;
    const result = await commitTripBlobs([image.blob], (hashes) => {
      signal.throwIfAborted();
      if (applied) return;
      if (hashes.length !== 1) throw new Error('That artwork could not be prepared. Nothing was added.');
      const hash = hashes[0]!;
      if (ref?.hash && hash !== ref.hash) throw new Error('The original bytes changed. Refresh the catalog before adding it.');
      const stacks = [
        ...readAllCards(session.parts).map((card) => card.boardStack ?? 0),
        ...readPresentations(session.parts).filter((p) => p.surface === 'board').map((p) => p.zIndex),
      ];
      const stack = stacks.length ? Math.max(...stacks) + 1 : 1;
      if (!Number.isInteger(stack) || stack > STACK_LIMIT || stack < -STACK_LIMIT) {
        throw new RangeError('That item cannot be layered any further. Nothing changed.');
      }
      const credit = ref?.credit;
      const rightsStatus = ref?.rightsStatus ?? 'unknown';
      const refSource = ref?.source;
      const source = {
        ...(refSource ?? {}),
        id: parsed.id,
        url: selectedUrl,
        retrievedAt: refSource?.retrievedAt ?? new Date().toISOString(),
        provider: 'fcc' as const,
        sourceId: refSource?.sourceId,
        cityId: refSource?.cityId ?? ref?.originCityId ?? parsed.city,
        countryCode: refSource?.countryCode ?? ref?.countryCode,
        kind: 'artwork' as const,
        origin: refSource?.origin ?? ('artwork' as const),
      };
      const executeResults: unknown[] = session.executeAll(actorSnapshot, [
        { command: 'trip_asset_register', input: { asset: { id: assetId, hash, mime: image.blob.type, role: 'original', width: image.width, height: image.height, caption: parsed.label, credit, rightsStatus, source } } },
        { command: 'trip_presentation_create', input: { assetId, surface: 'board', x: rect.x / BOARD_SIZE, y: rect.y / BOARD_SIZE, width: rect.width / BOARD_SIZE, height: rect.height / BOARD_SIZE, crop: [...crop], rotation: 0, zIndex: stack, locked: false, scope: 'private' } },
      ]);
      presentationId = (executeResults[executeResults.length - 1] as { id: string }).id;
      applied = true;
      entry.committed = true;
      try { onCommitted?.(); } catch { /* The document is already committed; an observer cannot roll back media. */ }
    }, signal);
    if (!applied) throw new Error('That artwork was not added. Nothing changed.');
    return { persisted: result.persisted, presentationId };
  } finally {
    if (inFlight.get(session as object) === entry) inFlight.delete(session as object);
  }
}
