// Pure geometry, layering, paste classification and ingestion orchestration
// for the free board. No React and no DOM layout live here.
import { compareBoardObjects, type Actor, type TripSession } from '@writers-board/core';
import { prepareBoardImages, type PreparedBoardImage } from './board-images';
import { commitTripBlobs } from './trip-assets';
export const BOARD_SIZE = 10000;
export const STACK_LIMIT = 1000000;
export interface BoardRect { x: number; y: number; width: number; height: number; stack: number }
export interface BoardObjectRef { kind: 'card' | 'asset'; id: string; stack: number }
export function isFiniteRect(rect: BoardRect): boolean { return [rect.x, rect.y, rect.width, rect.height, rect.stack].every(Number.isFinite) && Number.isInteger(rect.stack); }
export function validateBoardRect(rect: BoardRect, opts: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number } = {}): BoardRect {
  if (!isFiniteRect(rect)) throw new RangeError('That position is not valid. Nothing changed.');
  const minWidth = opts.minWidth ?? 100; const minHeight = opts.minHeight ?? 100;
  const maxWidth = opts.maxWidth ?? BOARD_SIZE; const maxHeight = opts.maxHeight ?? BOARD_SIZE;
  if (rect.width < minWidth || rect.height < minHeight || rect.width > maxWidth || rect.height > maxHeight) throw new RangeError('That size is outside the allowed range. Nothing changed.');
  if (rect.stack < -STACK_LIMIT || rect.stack > STACK_LIMIT) throw new RangeError('That layer is outside the allowed range. Nothing changed.');
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > BOARD_SIZE || rect.y + rect.height > BOARD_SIZE) throw new RangeError('That would move part of the item off the board. Nothing changed.');
  return { ...rect };
}
export function rectsEqual(a: BoardRect, b: BoardRect): boolean { return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.stack === b.stack; }
export function moveRect(rect: BoardRect, dx: number, dy: number, opts?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }): BoardRect {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('That position is not valid. Nothing changed.');
  return validateBoardRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, opts);
}
export function resizeRect(rect: BoardRect, factor: number, opts: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number } = {}): BoardRect {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('That size is not valid. Nothing changed.');
  // One factor for both axes: footprint changes, aspect is preserved.
  return validateBoardRect({ ...rect, width: rect.width * factor, height: rect.height * factor }, opts);
}
export function sortBoardObjects<T extends BoardObjectRef>(objects: readonly T[]): T[] { return [...objects].sort(compareBoardObjects); }
export function nextStack(objects: readonly BoardObjectRef[], current: BoardObjectRef, direction: 'front' | 'back'): number {
  if (!objects.some((o) => o.kind === current.kind && o.id === current.id)) throw new RangeError('That item is no longer on the board. Nothing changed.');
  const stacks = objects.map((o) => o.stack);
  const next = direction === 'front' ? Math.max(...stacks) + 1 : Math.min(...stacks) - 1;
  if (!Number.isInteger(next) || next < -STACK_LIMIT || next > STACK_LIMIT) throw new RangeError('That item cannot be layered any further. Nothing changed.');
  return next;
}
/** Fit an image inside the square 10000 board, preserving its own aspect. */
export function imagePlacementRect(naturalWidth: number, naturalHeight: number, origin: { x: number; y: number }, maxSide = 2400): BoardRect {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth < 1 || naturalHeight < 1) throw new RangeError('That image has no readable size. Nothing changed.');
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || origin.x < 0 || origin.y < 0 || origin.x >= BOARD_SIZE || origin.y >= BOARD_SIZE) throw new RangeError('There is no room for that image there. Nothing changed.');
  const availableWidth = BOARD_SIZE - origin.x; const availableHeight = BOARD_SIZE - origin.y;
  let scale = Math.min(maxSide / naturalWidth, maxSide / naturalHeight, availableWidth / naturalWidth, availableHeight / naturalHeight);
  let width = naturalWidth * scale; let height = naturalHeight * scale;
  if (width < 100 || height < 100) { scale = Math.max(scale, 100 / naturalWidth, 100 / naturalHeight); width = naturalWidth * scale; height = naturalHeight * scale; }
  return validateBoardRect({ x: origin.x, y: origin.y, width, height, stack: 0 });
}
/** Command inputs carry geometry only: never stage, day, time or scope. */
export function cardMoveInput(id: string, rect: BoardRect): Record<string, unknown> { validateBoardRect(rect, { minWidth: 400, minHeight: 300, maxWidth: 5000, maxHeight: 5000 }); return { id, x: rect.x, y: rect.y, boardWidth: rect.width, boardHeight: rect.height, boardStack: rect.stack }; }
export function presentationMoveInput(id: string, rect: BoardRect): Record<string, unknown> { validateBoardRect(rect); return { id, x: rect.x / BOARD_SIZE, y: rect.y / BOARD_SIZE, width: rect.width / BOARD_SIZE, height: rect.height / BOARD_SIZE, zIndex: rect.stack }; }
export function buildMoveCommand(ref: BoardObjectRef, rect: BoardRect): { command: string; input: Record<string, unknown> } {
  return ref.kind === 'card' ? { command: 'trip_card_move', input: cardMoveInput(ref.id, rect) } : { command: 'trip_presentation_update', input: presentationMoveInput(ref.id, rect) };
}
export type PastePlan = { kind: 'text'; text: string } | { kind: 'uri'; text: string } | { kind: 'html-only' } | { kind: 'empty' };
export function classifyPaste(input: { text?: string; html?: string; uriList?: string }): PastePlan {
  const text = (input.text ?? '').trim();
  if (text) return { kind: 'text', text: input.text! };
  const uri = (input.uriList ?? '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
  if (uri) return { kind: 'uri', text: uri };
  if ((input.html ?? '').trim()) return { kind: 'html-only' };
  return { kind: 'empty' };
}
export function textNoteInput(text: string, origin: { x: number; y: number }): Record<string, unknown> {
  const body = text.trim();
  if (!body) throw new Error('Write something first.');
  if (body.length > 20000) throw new Error('That note is too long. Nothing was added.');
  const rect = validateBoardRect({ x: origin.x, y: origin.y, width: 1200, height: 900, stack: 0 }, { minWidth: 400, minHeight: 300, maxWidth: 5000, maxHeight: 5000 });
  const title = body.split(/\r?\n/)[0]!.slice(0, 80) || 'Note';
  return { kind: 'note', title, body, stage: 'plan', provenance: 'traveler', scope: 'private', x: rect.x, y: rect.y, boardWidth: rect.width, boardHeight: rect.height };
}
export interface IngestDeps {
  prepare?: typeof prepareBoardImages;
  commitBlobs?: typeof commitTripBlobs;
  randomId?: () => string;
  origin?: { x: number; y: number };
  baseStack?: number;
}
export type IngestSession = Pick<TripSession, 'executeAll'>;
interface InFlightEntry { promise: Promise<{ persisted: boolean; count: number }>; signal?: AbortSignal; actorId: string; actorKind: Actor['kind'] }
const inFlight = new WeakMap<object, InFlightEntry>();
/** All checks happen before one atomic executeAll inside commitTripBlobs. */
export function ingestBoardImages(session: IngestSession, actor: Actor, files: readonly File[], signal?: AbortSignal, deps: IngestDeps = {}): Promise<{ persisted: boolean; count: number }> {
  const existing = inFlight.get(session as object);
  if (existing && !existing.signal?.aborted) {
    if (existing.signal === signal && existing.actorId === actor.id && existing.actorKind === actor.kind) return existing.promise;
    return Promise.reject(new Error('Images are already being added in another context. Nothing changed. Wait for that to finish or cancel it first.'));
  }
  const run = (async () => {
    const prepare = deps.prepare ?? prepareBoardImages;
    const commit = deps.commitBlobs ?? commitTripBlobs;
    const randomId = deps.randomId ?? (() => crypto.randomUUID());
    const origin = deps.origin ?? { x: 120, y: 120 };
    const prepared: PreparedBoardImage[] = await prepare(files, signal);
    signal?.throwIfAborted();
    if (!prepared.length) return { persisted: true, count: 0 };
    // Validate every placement before any bytes are staged or commands run.
    const placements = prepared.map((image, index) => imagePlacementRect(image.width, image.height, { x: origin.x + index * 48, y: origin.y + index * 48 }));
    const assetIds = prepared.map(() => randomId());
    const blobs = prepared.map((p) => p.blob);
    let applied = false;
    const result = await commit(blobs, (hashes) => {
      if (applied) return;
      signal?.throwIfAborted();
      if (hashes.length !== prepared.length) throw new Error('Those images could not be prepared. Nothing was added.');
      const ops: { command: string; input: Record<string, unknown> }[] = [];
      prepared.forEach((image, index) => {
        const rect = placements[index]!; const assetId = assetIds[index]!;
        ops.push({ command: 'trip_asset_register', input: { asset: { id: assetId, hash: hashes[index], mime: image.blob.type, role: 'original', width: image.width, height: image.height, caption: image.name } } });
        ops.push({ command: 'trip_presentation_create', input: { assetId, surface: 'board', x: rect.x / BOARD_SIZE, y: rect.y / BOARD_SIZE, width: rect.width / BOARD_SIZE, height: rect.height / BOARD_SIZE, crop: [0, 0, 1, 1], rotation: 0, zIndex: (deps.baseStack ?? 0) + index, locked: false, scope: 'private' } });
      });
      session.executeAll(actor, ops);
      applied = true;
    }, signal);
    if (!applied) throw new Error('Those images were not added. Nothing changed.');
    return { persisted: result.persisted, count: prepared.length };
  })();
  const entry: InFlightEntry = { promise: run, signal, actorId: actor.id, actorKind: actor.kind };
  inFlight.set(session as object, entry);
  void run.catch(() => undefined).finally(() => { if (inFlight.get(session as object) === entry) inFlight.delete(session as object); });
  return run;
}
