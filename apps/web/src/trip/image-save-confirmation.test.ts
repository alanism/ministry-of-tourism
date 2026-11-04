import { expect, it, vi } from 'vitest';
import { confirmImageSaved } from './image-save-confirmation';
it('waits for the board write after image storage before confirming saved', async () => {
  let finish!: () => void;
  const boardWrite = new Promise<void>(resolve => { finish = resolve; });
  const whenSaved = vi.fn(() => boardWrite), settled = vi.fn();
  const pending = confirmImageSaved(true, whenSaved, new AbortController().signal).then(settled);
  await Promise.resolve(); expect(whenSaved).toHaveBeenCalledOnce(); expect(settled).not.toHaveBeenCalled();
  finish(); await pending; expect(settled).toHaveBeenCalledWith(true);
});
it('never confirms durable saved when board persistence rejects, is missing, or image storage is tab-only', async () => {
  const signal = new AbortController().signal;
  expect(await confirmImageSaved(true, async () => { throw Error('Board write failed'); }, signal)).toBe(false);
  expect(await confirmImageSaved(true, undefined, signal)).toBe(false);
  expect(await confirmImageSaved(false, async () => {}, signal)).toBe(false);
});
it('stops waiting on close and ignores a late successful board write', async () => {
  let finish!: () => void;
  const boardWrite = new Promise<void>(resolve => { finish = resolve; }), controller = new AbortController();
  const pending = confirmImageSaved(true, () => boardWrite, controller.signal);
  controller.abort(); await expect(pending).rejects.toThrow(); finish(); await Promise.resolve();
  const already = new AbortController(); already.abort(); const fence = vi.fn(async () => {});
  await expect(confirmImageSaved(true, fence, already.signal)).rejects.toThrow(); expect(fence).not.toHaveBeenCalled();
});
