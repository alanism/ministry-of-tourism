import { afterEach, expect, it, vi } from 'vitest';
import { prepareFashionPhoto } from './fashion-photo';

afterEach(() => vi.unstubAllGlobals());
function png(width: number, height: number) {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(8,13); bytes.set([73,72,68,82],12); view.setUint32(16,width); view.setUint32(20,height);
  return new File([bytes], 'private-original.png', { type: 'image/png' });
}
it('prepares only a bounded metadata-free redraw without uploading or storing the original', async () => {
  const original = png(2000,1000), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const close = vi.fn(), fillRect = vi.fn(), drawImage = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2000, height: 1000, close })));
  const encoded = new Blob(['fixture canvas JPEG without original file metadata'], { type: 'image/jpeg' });
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect, drawImage }), toBlob: (callback: (value: Blob) => void, type: string) => { expect(type).toBe('image/jpeg'); callback(encoded); } };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  const bytes = await original.arrayBuffer();
  const result = await prepareFashionPhoto(original, new AbortController().signal);
  expect(result).toEqual({ blob: encoded, width: 1600, height: 800 }); expect(canvas.width).toBe(1600); expect(canvas.height).toBe(800);
  expect(await original.arrayBuffer()).toEqual(bytes); expect(result.blob).not.toBe(original);
  expect(fetcher).not.toHaveBeenCalled(); expect(drawImage).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(2);
});
it('rejects unsafe headers and a cancelled source before decode or network access', async () => {
  const decode = vi.fn(), fetcher = vi.fn(); vi.stubGlobal('createImageBitmap', decode); vi.stubGlobal('fetch', fetcher);
  await expect(prepareFashionPhoto(png(20000,20000), new AbortController().signal)).rejects.toThrow(/8192|pixels/);
  const stopped = new AbortController(); stopped.abort();
  await expect(prepareFashionPhoto(png(100,100), stopped.signal)).rejects.toThrow();
  await expect(prepareFashionPhoto(new File(['<svg/>'],'photo.svg',{type:'image/svg+xml'}), new AbortController().signal)).rejects.toThrow(/Unsupported/);
  expect(decode).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
