import { describe, expect, it, vi } from 'vitest';
import { ingestBoardImages } from './free-board-actions';
import type { Actor } from '@mot/core';

const actor: Actor = { kind: 'human', id: 'traveler', name: 'Traveler' };
const image = { blob: new Blob(['x'], { type: 'image/png' }), width: 800, height: 600, name: 'x.png' };
function fakeSession(executeAll?: () => void) { return { executeAll: vi.fn(executeAll ?? (() => undefined)), execute: vi.fn() }; }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } { let resolve!: (v: T) => void; const promise = new Promise<T>((res) => { resolve = res; }); return { promise, resolve }; }

describe('R21 A2 onCommitted', () => {
  it('fires once after document apply and before blob persistence settles', async () => {
    const events: string[] = [];
    const session = fakeSession(() => { events.push('doc'); });
    const gate = deferred<{ persisted: boolean }>();
    const commitBlobs = vi.fn(async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply(['a'.repeat(64)]); events.push('storage-pending'); return gate.promise; });
    const onCommitted = vi.fn(() => { events.push('committed'); });
    const pending = ingestBoardImages(session as never, actor, [new File(['x'], 'x.png')], undefined, { prepare: async () => [image], commitBlobs: commitBlobs as never, randomId: () => 'id-r21-1', onCommitted });
    await flush();
    expect(session.executeAll).toHaveBeenCalledTimes(1);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['doc', 'committed', 'storage-pending']);
    gate.resolve({ persisted: false });
    await expect(pending).resolves.toEqual({ persisted: false, count: 1 });
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });
  it('does not fire on prepare failure and document semantics are unchanged', async () => {
    const session = fakeSession(); const onCommitted = vi.fn(); const commitBlobs = vi.fn(async () => ({ persisted: true }));
    await expect(ingestBoardImages(session as never, actor, [], undefined, { prepare: async () => { throw new Error('prepare failed'); }, commitBlobs: commitBlobs as never, onCommitted })).rejects.toThrow(/prepare failed/);
    expect(onCommitted).not.toHaveBeenCalled(); expect(session.executeAll).not.toHaveBeenCalled(); expect(commitBlobs).not.toHaveBeenCalled();
  });
  it('does not fire when document apply throws', async () => {
    const session = fakeSession(() => { throw new Error('apply failed'); }); const onCommitted = vi.fn();
    const commitBlobs = vi.fn(async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    await expect(ingestBoardImages(session as never, actor, [], undefined, { prepare: async () => [image], commitBlobs: commitBlobs as never, randomId: () => 'id-r21-2', onCommitted })).rejects.toThrow(/apply failed/);
    expect(onCommitted).not.toHaveBeenCalled(); expect(session.executeAll).toHaveBeenCalledTimes(1);
  });
  it('a progress-observer exception cannot invalidate committed media', async () => {
    const session = fakeSession();
    const commitBlobs = vi.fn(async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply(['a'.repeat(64)]); return { persisted: true }; });
    const onCommitted = vi.fn(() => { throw new Error('observer failed'); });
    await expect(ingestBoardImages(session as never, actor, [], undefined, { prepare: async () => [image], commitBlobs: commitBlobs as never, randomId: () => 'id-r21-3', onCommitted })).resolves.toEqual({ persisted: true, count: 1 });
    expect(session.executeAll).toHaveBeenCalledTimes(1); expect(onCommitted).toHaveBeenCalledTimes(1);
  });
  it('duplicate commit callbacks still apply and signal once', async () => {
    const session = fakeSession(); const onCommitted = vi.fn();
    const commitBlobs = vi.fn(async (_blobs: readonly Blob[], apply: (hashes: string[]) => void) => { apply(['a'.repeat(64)]); apply(['a'.repeat(64)]); return { persisted: true }; });
    await ingestBoardImages(session as never, actor, [], undefined, { prepare: async () => [image], commitBlobs: commitBlobs as never, randomId: () => 'id-r21-4', onCommitted });
    expect(session.executeAll).toHaveBeenCalledTimes(1); expect(onCommitted).toHaveBeenCalledTimes(1);
  });
});
