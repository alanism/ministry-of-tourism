import { describe, expect, it, vi } from 'vitest';
import { buildMoveCommand, classifyPaste, imagePlacementRect, ingestBoardImages, moveRect, nextStack, textNoteInput, validateBoardRect, type BoardRect } from './free-board-actions';
import { prepareBoardImages } from './board-images';
import { createTrip, exportTripPackage, importTripPackage, readPresentations, tripParts, TripSession, type Actor } from '@mot/core';
const rect: BoardRect = { x: 100, y: 100, width: 1200, height: 900, stack: 0 };
const actor: Actor = { kind: 'human', id: 'traveler', name: 'Traveler' };
const image = { blob: new Blob(['x'], { type: 'image/png' }), width: 800, height: 600, name: 'x.png' };
function pngBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(64); out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(out.buffer); dv.setUint32(8, 13); out.set([73, 72, 68, 82], 12); dv.setUint32(16, width); dv.setUint32(20, height); out[24] = 8; out[25] = 6;
  dv.setUint32(29, 0); out.set([0, 0, 0, 0], 33); dv.setUint32(37, 0); out.set([73, 69, 78, 68], 41);
  return out;
}
describe('free board geometry', () => {
  it('rejects invalid and out-of-board rectangles instead of clamping', () => {
    expect(() => validateBoardRect({ ...rect, x: Number.NaN })).toThrow(/not valid/);
    expect(() => moveRect(rect, -101, 0)).toThrow(/off the board/);
    expect(() => moveRect(rect, 9000, 0)).toThrow(/off the board/);
  });
  it('move commands contain no stage, day, time or scope changes', () => {
    const cmd = buildMoveCommand({ kind: 'card', id: 'c1', stack: 0 }, { ...rect, x: 200 });
    expect(cmd.command).toBe('trip_card_move');
    expect(Object.keys(cmd.input).sort()).toEqual(['boardHeight', 'boardStack', 'boardWidth', 'id', 'x', 'y']);
  });
  it('layer overflow is rejected visibly', () => {
    expect(() => nextStack([{ kind: 'card', id: 'a', stack: 1000000 }], { kind: 'card', id: 'a', stack: 1000000 }, 'front')).toThrow(/layered any further/);
    expect(nextStack([{ kind: 'card', id: 'a', stack: 3 }, { kind: 'asset', id: 'b', stack: 9 }], { kind: 'card', id: 'a', stack: 3 }, 'front')).toBe(10);
  });
  it('image placement preserves square-board aspect, not magazine aspect', () => {
    const placed = imagePlacementRect(2000, 1000, { x: 0, y: 0 });
    expect(placed.width / placed.height).toBeCloseTo(2);
    expect(placed.width).toBeLessThanOrEqual(10000); expect(placed.height).toBeGreaterThanOrEqual(100);
    const tall = imagePlacementRect(500, 2000, { x: 9000, y: 9000 });
    expect(tall.width / tall.height).toBeCloseTo(0.25); expect(tall.x + tall.width).toBeLessThanOrEqual(10000);
  });
  it('text notes are private and plain-text classification never trusts HTML', () => {
    const input = textNoteInput('Hello\nworld', { x: 0, y: 0 });
    expect(input).toMatchObject({ kind: 'note', scope: 'private', body: 'Hello\nworld' });
    expect(classifyPaste({ html: '<img src=x onerror=alert(1)>' })).toEqual({ kind: 'html-only' });
    expect(classifyPaste({ uriList: 'https://example.com/a' })).toEqual({ kind: 'uri', text: 'https://example.com/a' });
  });
});
describe('board image preparation with a real TripSession', () => {
  function realSession() { let n = 0; return new TripSession(createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon' }), { newId: () => `real-${++n}` }); }
  const commit = (hash: string) => async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply([hash]); return { persisted: true }; };
  it('adds media through executeAll and undoes it as one session change', async () => {
    const session = realSession();
    const originalBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 800, height: 600, close: () => undefined })) as never;
    try {
      await ingestBoardImages(session, actor, [new File(['x'], 'x.png', { type: 'image/png' })], undefined, { prepare: async () => [image], commitBlobs: commit('a'.repeat(64)) as never, randomId: () => 'asset-real-1' });
      expect(readPresentations(session.parts).filter((p) => p.surface === 'board')).toHaveLength(1);
      expect(session.undo(actor.id)).toBe(true);
      expect(readPresentations(session.parts).filter((p) => p.surface === 'board')).toHaveLength(0);
    } finally { if (originalBitmap) globalThis.createImageBitmap = originalBitmap; else delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap; }
  });
  it('a failed second image in preflight writes nothing to the real session', async () => {
    const session = realSession(); const blobs = vi.fn(commit('b'.repeat(64)));
    await expect(ingestBoardImages(session, actor, [new File(['x'], 'x.png')], undefined, { prepare: async () => { throw new Error('second image unsupported'); }, commitBlobs: blobs as never })).rejects.toThrow(/second/);
    expect(blobs).not.toHaveBeenCalled(); expect(readPresentations(session.parts)).toHaveLength(0);
  });
  it('a duplicate commit callback cannot write twice to the real session', async () => {
    const session = realSession();
    const twice = async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply(['c'.repeat(64)]); apply(['c'.repeat(64)]); return { persisted: true }; };
    await ingestBoardImages(session, actor, [new File(['x'], 'x.png')], undefined, { prepare: async () => [image], commitBlobs: twice as never, randomId: () => 'asset-real-2' });
    expect(readPresentations(session.parts).filter((p) => p.surface === 'board')).toHaveLength(1);
  });
  it('preserves board geometry and private media through a native package roundtrip', async () => {
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon' });
    let n = 0; const session = new TripSession(doc, { newId: () => `roundtrip-${++n}` });
    await ingestBoardImages(session, actor, [new File(['x'], 'x.png')], undefined, { prepare: async () => [image], commitBlobs: commit('d'.repeat(64)) as never, randomId: () => 'asset-roundtrip-1' });
    const original = readPresentations(session.parts).find((p) => p.surface === 'board');
    if (!original?.assetId) throw new Error('Expected a board presentation with media');
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    const pkg = await exportTripPackage(doc, new Map([[original.assetId, bytes]]), { includePrivate: true });
    const imported = await importTripPackage(pkg);
    try {
      const importedBoard = readPresentations(tripParts(imported.doc)).filter((p) => p.surface === 'board');
      expect(importedBoard).toHaveLength(1);
      expect(importedBoard[0]).toEqual({ ...original, boardId: importedBoard[0]!.boardId });
      expect(imported.assets.get(original.assetId)).toEqual(bytes);
    } finally { imported.doc.destroy(); }
  });
});
describe('board image preparation', () => {
  it('keeps accepted bytes byte-identical', async () => {
    const bytes = pngBytes(640, 480); const file = new File([bytes as BlobPart], 'dot.png', { type: 'application/octet-stream' });
    const originalBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 640, height: 480, close: () => undefined })) as never;
    try {
      const [prepared] = await prepareBoardImages([file]);
      expect(prepared).toMatchObject({ width: 640, height: 480, name: 'dot.png' });
      expect(new Uint8Array(await prepared!.blob.arrayBuffer())).toEqual(bytes);
    } finally { if (originalBitmap) globalThis.createImageBitmap = originalBitmap; else delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap; }
  });
  it('rejects GIF bytes even when mislabelled as PNG', async () => {
    const gif = new File([new TextEncoder().encode('GIF89a')], 'x.png', { type: 'image/png' });
    await expect(prepareBoardImages([gif])).rejects.toThrow(/GIF/);
  });
});
describe('ingestion orchestration', () => {
  function fakeSession() { return { executeAll: vi.fn(), execute: vi.fn() }; }
  it('one atomic call registers media and placements together', async () => {
    const session = fakeSession(); const commitBlobs = vi.fn(async (_b: readonly Blob[], apply: (h: string[]) => void) => { apply(['a'.repeat(64), 'b'.repeat(64)]); return { persisted: true }; });
    let n = 0;
    await ingestBoardImages(session as never, actor, [new File(['x'], 'x.png')], undefined, { prepare: async () => [image, image], commitBlobs: commitBlobs as never, randomId: () => `id-${++n}` });
    expect(session.executeAll).toHaveBeenCalledTimes(1);
    expect(session.executeAll.mock.calls[0]![1]).toHaveLength(4);
  });
  it('a second failed image means no partial commit', async () => {
    const session = fakeSession(); const commitBlobs = vi.fn(async () => ({ persisted: true }));
    await expect(ingestBoardImages(session as never, actor, [], undefined, { prepare: async () => { throw new Error('second image unsupported'); }, commitBlobs: commitBlobs as never })).rejects.toThrow(/second/);
    expect(session.executeAll).not.toHaveBeenCalled(); expect(commitBlobs).not.toHaveBeenCalled();
  });
  it('cancel between prepare and commit applies nothing', async () => {
    const session = fakeSession(); const controller = new AbortController();
    const commitBlobs = vi.fn(async (_b: readonly Blob[], apply: (h: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    await expect(ingestBoardImages(session as never, actor, [], controller.signal, { prepare: async () => { controller.abort(); return [image]; }, commitBlobs: commitBlobs as never, randomId: () => 'id-1' })).rejects.toThrow();
    expect(session.executeAll).not.toHaveBeenCalled();
  });
  it('duplicate concurrent callbacks share one flight and apply once', async () => {
    const session = fakeSession(); let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const commitBlobs = vi.fn(async (_b: readonly Blob[], apply: (h: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    const deps = { prepare: async () => { await gate; return [image]; }, commitBlobs: commitBlobs as never, randomId: () => 'id-1' };
    const first = ingestBoardImages(session as never, actor, [], undefined, deps); const second = ingestBoardImages(session as never, actor, [], undefined, deps);
    release(); await Promise.all([first, second]);
    expect(session.executeAll).toHaveBeenCalledTimes(1);
  });
  it('cancel pending first then retry with new signal succeeds before old prepare releases; old applies nothing', async () => {
    const session = fakeSession(); let prepareCalls = 0; let releaseFirst!: () => void; const firstGate = new Promise<void>((r) => { releaseFirst = r; });
    const commitBlobs = vi.fn(async (_b: readonly Blob[], apply: (h: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    const deps = { prepare: async () => { prepareCalls += 1; if (prepareCalls === 1) await firstGate; return [image]; }, commitBlobs: commitBlobs as never, randomId: () => 'id-retry' };
    const firstController = new AbortController(); const retryController = new AbortController();
    const first = ingestBoardImages(session as never, actor, [], firstController.signal, deps);
    const firstRejected = expect(first).rejects.toThrow();
    firstController.abort();
    const retry = ingestBoardImages(session as never, actor, [], retryController.signal, deps);
    await expect(retry).resolves.toEqual({ persisted: true, count: 1 });
    expect(session.executeAll).toHaveBeenCalledTimes(1);
    releaseFirst();
    await firstRejected;
    expect(session.executeAll).toHaveBeenCalledTimes(1);
  });
  it('other actor cannot reuse an active flight', async () => {
    const session = fakeSession(); let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const commitBlobs = vi.fn(async (_b: readonly Blob[], apply: (h: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    const deps = { prepare: async () => { await gate; return [image]; }, commitBlobs: commitBlobs as never, randomId: () => 'id-actor' };
    const signal = new AbortController().signal;
    const first = ingestBoardImages(session as never, actor, [], signal, deps);
    const other: Actor = { kind: 'human', id: 'other', name: 'Other' };
    await expect(ingestBoardImages(session as never, other, [], signal, deps)).rejects.toThrow(/already being added/);
    release();
    await expect(first).resolves.toEqual({ persisted: true, count: 1 });
    expect(session.executeAll).toHaveBeenCalledTimes(1);
  });
});
