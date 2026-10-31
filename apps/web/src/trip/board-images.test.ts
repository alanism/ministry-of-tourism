import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareBoardImages } from './board-images';

function bytes(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) out.push(...p);
  return new Uint8Array(out);
}
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer); v.setUint32(16, width); v.setUint32(20, height);
  return b;
}
function gif(width: number, height: number): Uint8Array {
  const b = bytes([71, 73, 70, 56, 57, 97]); const out = new Uint8Array(10); out.set(b); const v = new DataView(out.buffer); v.setUint16(6, width, true); v.setUint16(8, height, true); return out;
}
function jpeg(width: number, height: number, padSegments = 0): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  for (let i = 0; i < padSegments; i++) { const seg = new Uint8Array(4 + 60000); seg.set([0xff, 0xe0, 0xea, 0x62]); parts.push(seg); }
  const sof = new Uint8Array([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const v = new DataView(sof.buffer); v.setUint16(5, height); v.setUint16(7, width); parts.push(sof);
  return bytes(...parts);
}
function riff(chunkFourCc: string, payload: Uint8Array): Uint8Array {
  const padded = payload.length + (payload.length % 2);
  const b = new Uint8Array(20 + padded);
  const v = new DataView(b.buffer);
  b.set([82, 73, 70, 70], 0); v.setUint32(4, b.length - 8, true);
  b.set([87, 69, 66, 80], 8); b.set(new TextEncoder().encode(chunkFourCc), 12); v.setUint32(16, payload.length, true);
  b.set(payload, 20);
  return b;
}
function webpVp8(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const v = new DataView(payload.buffer); payload.set([0, 0, 0, 0x9d, 0x01, 0x2a], 0); v.setUint16(6, width, true); v.setUint16(8, height, true);
  return riff('VP8 ', payload);
}
function webpVp8l(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(5); payload[0] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14); const v = new DataView(payload.buffer); v.setUint32(1, bits, true);
  return riff('VP8L', payload);
}
function webpX(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const put = (o: number, n: number) => { payload[o + 4] = n & 255; payload[o + 5] = (n >> 8) & 255; payload[o + 6] = (n >> 16) & 255; };
  put(0, width - 1); put(3, height - 1); return riff('VP8X', payload);
}
const file = (data: Uint8Array, name: string, type: string) => new File([data as BlobPart], name, { type });
function stubDecode(dims: { width: number; height: number }[], onDecode?: (index: number, close: () => void) => void) {
  let active = 0, max = 0, calls = 0; const closed: number[] = [];
  const decode = vi.fn(async (_blob: Blob) => {
    const index = calls++; active++; max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 2));
    const close = () => { closed.push(index); };
    onDecode?.(index, close);
    active--;
    return { width: dims[index]!.width, height: dims[index]!.height, close };
  });
  vi.stubGlobal('createImageBitmap', decode);
  return { decode, closed, max: () => max };
}
afterEach(() => vi.unstubAllGlobals());

describe('prepareBoardImages', () => {
  it('prepares PNG/JPEG/simple WebP sequentially (max 1), closing every bitmap and preserving dimensions/aspect', async () => {
    const files = [file(png(400, 200), 'a.png', 'image/png'), file(jpeg(300, 300), 'b.jpg', 'image/jpeg'), file(webpVp8(640, 480), 'd.webp', 'image/webp'), file(webpVp8l(200, 100), 'e.webp', 'image/webp')];
    const stub = stubDecode([{ width: 400, height: 200 }, { width: 300, height: 300 }, { width: 640, height: 480 }, { width: 200, height: 100 }]);
    const out = await prepareBoardImages(files);
    expect(out.map((o) => [o.name, o.width, o.height])).toEqual([['a.png', 400, 200], ['b.jpg', 300, 300], ['d.webp', 640, 480], ['e.webp', 200, 100]]);
    expect(out[0]!.width / out[0]!.height).toBe(2);
    expect(out.map((o) => o.blob.type)).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/webp']);
    expect(stub.max()).toBe(1); expect(stub.closed).toEqual([0, 1, 2, 3]); expect(stub.decode).toHaveBeenCalledTimes(4);
  });
  it('rejects GIF and VP8X WebP before any decode, with a file-or-text fallback', async () => {
    const stub = stubDecode([]);
    await expect(prepareBoardImages([file(gif(200, 100), 'c.gif', 'image/gif')])).rejects.toThrow(/GIF is not safely supported.*paste the image as text/);
    await expect(prepareBoardImages([file(webpX(640, 480), 'x.webp', 'image/webp')])).rejects.toThrow(/VP8X.*not safely supported.*paste the image as text/);
    expect(stub.decode).not.toHaveBeenCalled();
  });
  it('rejects truncated or lying WebP containers before any decode', async () => {
    const stub = stubDecode([]);
    const truncated = webpVp8(640, 480).slice(0, 24);
    await expect(prepareBoardImages([file(truncated, 't.webp', 'image/webp')])).rejects.toThrow(/Truncated|malformed WebP/);
    const lying = webpVp8(640, 480); new DataView(lying.buffer).setUint32(16, 9999, true);
    await expect(prepareBoardImages([file(lying, 'l.webp', 'image/webp')])).rejects.toThrow(/Truncated or malformed WebP/);
    const extraChunk = bytes(webpVp8(10, 10), [0, 0, 0, 0]);
    await expect(prepareBoardImages([file(extraChunk, 'extra.webp', 'image/webp')])).rejects.toThrow(/WebP/);
    expect(stub.decode).not.toHaveBeenCalled();
  });
  it('normalizes empty and unknown generic File MIME to the sniffed MIME on the prepared blob', async () => {
    const stub = stubDecode([{ width: 400, height: 200 }, { width: 400, height: 200 }]);
    const noType = await prepareBoardImages([file(png(400, 200), 'a.png', '')]);
    expect(noType[0]!.blob.type).toBe('image/png'); expect(noType[0]!.blob.size).toBe(png(400, 200).length);
    const generic = await prepareBoardImages([file(png(400, 200), 'b.png', 'application/octet-stream')]);
    expect(generic[0]!.blob.type).toBe('image/png'); expect(generic[0]!.blob.size).toBe(png(400, 200).length);
    expect(stub.decode).toHaveBeenCalledTimes(2);
  });
  it('rejects count, byte, side and pixel budgets, AVIF and beyond-cap JPEG headers before any decode', async () => {
    const stub = stubDecode([]);
    await expect(prepareBoardImages(Array.from({ length: 6 }, (_, i) => file(png(1, 1), `${i}.png`, 'image/png')))).rejects.toThrow(/at most 5/);
    await expect(prepareBoardImages([file(new Uint8Array(10 * 1024 * 1024 + 1), 'big.png', 'image/png')])).rejects.toThrow(/10 MiB/);
    await expect(prepareBoardImages([file(png(8193, 10), 'wide.png', 'image/png')])).rejects.toThrow(/8192/);
    await expect(prepareBoardImages([file(png(5000, 5000), 'many.png', 'image/png')])).rejects.toThrow(/16777216/);
    const avif = bytes([0, 0, 0, 24], new TextEncoder().encode('ftypavif'), new Uint8Array(16));
    await expect(prepareBoardImages([file(avif, 'x.avif', 'image/avif')])).rejects.toThrow(/AVIF.*PNG, JPEG/);
    await expect(prepareBoardImages([file(jpeg(100, 100, 2), 'far.jpg', 'image/jpeg')])).rejects.toThrow(/64 KiB/);
    expect(stub.decode).not.toHaveBeenCalled();
  });
  it('rejects malformed headers and known type mismatches before decode', async () => {
    const stub = stubDecode([]);
    await expect(prepareBoardImages([file(png(10, 10), 'fake.jpg', 'image/jpeg')])).rejects.toThrow(/does not match/);
    await expect(prepareBoardImages([file(new Uint8Array([1, 2, 3, 4]), 'x.png', 'image/png')])).rejects.toThrow(/Unsupported|Not a valid/);
    expect(stub.decode).not.toHaveBeenCalled();
  });
  it('closes the bitmap and returns no partial result when aborted after decode or when dimensions mismatch', async () => {
    const controller = new AbortController();
    const stub = stubDecode([{ width: 400, height: 200 }, { width: 10, height: 10 }], (index) => { if (index === 0) controller.abort(); });
    await expect(prepareBoardImages([file(png(400, 200), 'a.png', 'image/png')], controller.signal)).rejects.toThrow(/abort/i);
    expect(stub.closed).toEqual([0]);
    const mismatch = stubDecode([{ width: 401, height: 200 }]);
    await expect(prepareBoardImages([file(png(400, 200), 'a.png', 'image/png'), file(png(10, 10), 'b.png', 'image/png')])).rejects.toThrow(/does not match/);
    expect(mismatch.closed).toEqual([0]); expect(mismatch.decode).toHaveBeenCalledTimes(1);
  });
  it('fails the whole gesture on a later invalid header after earlier headers pass, still without decoding', async () => {
    const stub = stubDecode([{ width: 10, height: 10 }]);
    await expect(prepareBoardImages([file(png(10, 10), 'ok.png', 'image/png'), file(png(9000, 10), 'bad.png', 'image/png')])).rejects.toThrow(/8192/);
    expect(stub.decode).not.toHaveBeenCalled();
  });
});
