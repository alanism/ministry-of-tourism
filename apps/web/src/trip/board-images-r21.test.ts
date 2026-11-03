import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareBoardImages } from './board-images';

function bytes(...parts: (number[] | Uint8Array)[]): Uint8Array { const out: number[] = []; for (const p of parts) out.push(...p); return new Uint8Array(out); }
function segment(marker: number, payload: Uint8Array): Uint8Array { const b = new Uint8Array(payload.length + 4); b.set([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]); b.set(payload, 4); return b; }
function sof(width: number, height: number): Uint8Array { const b = new Uint8Array([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]); const v = new DataView(b.buffer); v.setUint16(5, height); v.setUint16(7, width); return b; }
interface ExifOpts { little?: boolean; magic?: number; ifdOffset?: number; type?: number; count?: number; unknownFirst?: boolean; truncatedEntry?: boolean; duplicateOrientation?: number }
function exifApp1(orientation: number, opts: ExifOpts = {}): Uint8Array {
  const little = opts.little ?? true;
  const entries: number[][] = [];
  const entry = (tag: number, type: number, count: number, value: number[]): number[] => little ? [tag & 255, tag >> 8, type & 255, type >> 8, count & 255, (count >> 8) & 255, (count >> 16) & 255, (count >> 24) & 255, ...value] : [(tag >> 8) & 255, tag & 255, (type >> 8) & 255, type & 255, (count >> 24) & 255, (count >> 16) & 255, (count >> 8) & 255, count & 255, ...value];
  const shortValue = (n: number): number[] => little ? [n & 255, (n >> 8) & 255, 0, 0] : [(n >> 8) & 255, n & 255, 0, 0];
  if (opts.unknownFirst) entries.push(entry(0x1234, 4, 100000, [255, 255, 255, 255]));
  entries.push(entry(0x0112, opts.type ?? 3, opts.count ?? 1, shortValue(orientation)));
  if (opts.duplicateOrientation !== undefined) entries.push(entry(0x0112, 3, 1, shortValue(opts.duplicateOrientation)));
  const header = little ? [73, 73, 42, 0, 8, 0, 0, 0] : [77, 77, 0, 42, 0, 0, 0, 8];
  const magic = opts.magic ?? 42; if (little) header[2] = magic & 255; else header[3] = magic & 255;
  const off = opts.ifdOffset ?? 8; if (little) { header[4] = off & 255; header[5] = (off >> 8) & 255; header[6] = (off >> 16) & 255; header[7] = (off >> 24) & 255; } else { header[4] = (off >> 24) & 255; header[5] = (off >> 16) & 255; header[6] = (off >> 8) & 255; header[7] = off & 255; }
  const countBytes = little ? [entries.length, 0] : [0, entries.length];
  const flat = entries.flat();
  const ifd = opts.truncatedEntry ? [...countBytes, ...flat.slice(0, 5)] : [...countBytes, ...flat, 0, 0, 0, 0];
  const tiff = bytes(header, ifd);
  return segment(0xe1, bytes([69, 120, 105, 102, 0, 0], tiff));
}
function jpeg(width: number, height: number, parts: Uint8Array[] = [], afterSof: Uint8Array[] = []): Uint8Array { return bytes([0xff, 0xd8], ...parts, sof(width, height), ...afterSof, [0xff, 0xd9]); }
function png(width: number, height: number): Uint8Array { const b = new Uint8Array(33); b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); const v = new DataView(b.buffer); v.setUint32(16, width); v.setUint32(20, height); return b; }
const file = (data: Uint8Array, name = 'x.jpg', type = 'image/jpeg') => new File([data as BlobPart], name, { type });
function stubDims(width: number, height: number) { const decode = vi.fn(async (_blob: Blob, _opts?: unknown) => ({ width, height, close: vi.fn() })); vi.stubGlobal('createImageBitmap', decode); return decode; }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
afterEach(() => vi.unstubAllGlobals());

describe('R21 A1 EXIF orientation', () => {
  it('accepts orientation 6 little-endian and 8 big-endian with swapped decoded size and original bytes', async () => {
    for (const data of [jpeg(200, 100, [exifApp1(6, { little: true })]), jpeg(200, 100, [exifApp1(8, { little: false })])]) {
      const decode = stubDims(100, 200);
      const out = await prepareBoardImages([file(data)]);
      expect(out.map((o) => [o.width, o.height])).toEqual([[100, 200]]);
      expect(new Uint8Array(await out[0]!.blob.arrayBuffer())).toEqual(data);
      expect(decode).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' });
      vi.unstubAllGlobals();
    }
  });
  it('accepts orientation 1 without swapping and EXIF after SOF but before SOS/EOI', async () => {
    stubDims(200, 100);
    await expect(prepareBoardImages([file(jpeg(200, 100, [exifApp1(1)]))])).resolves.toMatchObject([{ width: 200, height: 100 }]);
    stubDims(100, 200);
    await expect(prepareBoardImages([file(jpeg(200, 100, [], [exifApp1(6)]))])).resolves.toMatchObject([{ width: 100, height: 200 }]);
  });
  it('rejects swapped-looking decoded size without matching swap requirement', async () => {
    stubDims(200, 100);
    await expect(prepareBoardImages([file(jpeg(200, 100, [exifApp1(6)]))])).rejects.toThrow(/does not match/);
  });
  it('skips unknown tags safely without following their offsets', async () => {
    stubDims(100, 200);
    await expect(prepareBoardImages([file(jpeg(200, 100, [exifApp1(6, { unknownFirst: true })]))])).resolves.toMatchObject([{ width: 100, height: 200 }]);
  });
  it.each([
    ['bad TIFF magic', exifApp1(6, { magic: 43 })],
    ['out-of-bounds IFD offset', exifApp1(6, { ifdOffset: 100000 })],
    ['truncated IFD entry', exifApp1(6, { truncatedEntry: true })],
    ['orientation outside 1..8', exifApp1(9)],
    ['orientation wrong type', exifApp1(6, { type: 4 })],
    ['orientation wrong count', exifApp1(6, { count: 2 })],
  ])('rejects %s before decode', async (_label, app1) => {
    const decode = stubDims(100, 200);
    await expect(prepareBoardImages([file(jpeg(200, 100, [app1]))])).rejects.toThrow(/EXIF|orientation/i);
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects conflicting EXIF orientations before decode', async () => {
    const decode = stubDims(100, 200);
    await expect(prepareBoardImages([file(jpeg(200, 100, [exifApp1(6), exifApp1(1)]))])).rejects.toThrow(/conflicting EXIF orientation/i);
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects conflicting orientation tags within the same IFD before decode', async () => {
    const decode = stubDims(100, 200);
    await expect(prepareBoardImages([file(jpeg(200, 100, [exifApp1(6, { duplicateOrientation: 1 })]))])).rejects.toThrow(/conflicting EXIF orientation/i);
    expect(decode).not.toHaveBeenCalled();
  });
  it('keeps encoded-dimension preflight before decode for oriented JPEGs', async () => {
    const decode = stubDims(10, 8193);
    await expect(prepareBoardImages([file(jpeg(8193, 10, [exifApp1(6)]))])).rejects.toThrow(/8192/);
    expect(decode).not.toHaveBeenCalled();
  });
  it('keeps the minimal SOF+EOI JPEG fixture valid', async () => {
    stubDims(20, 10);
    await expect(prepareBoardImages([file(jpeg(20, 10))])).resolves.toMatchObject([{ width: 20, height: 10 }]);
  });
  it('rejects a truncated APP1 segment after a valid SOF before decode', async () => {
    const decode = stubDims(20, 10);
    const data = bytes([0xff, 0xd8], sof(20, 10), [0xff, 0xe1, 0x00, 0x20, 69, 120, 105, 102, 0, 0]);
    await expect(prepareBoardImages([file(data)])).rejects.toThrow(/JPEG header exceeds/i);
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects a header filling the exact 64 KiB slice without SOS or EOI before decode', async () => {
    const decode = stubDims(20, 10);
    const data = bytes([0xff, 0xd8], sof(20, 10), segment(0xe0, new Uint8Array(65511)));
    expect(data.length).toBe(65536);
    await expect(prepareBoardImages([file(data)])).rejects.toThrow(/JPEG header exceeds/i);
    expect(decode).not.toHaveBeenCalled();
  });
});

describe('R21 A3 shared decoder slot', () => {
  function gatedDecode() {
    const gates: Deferred<{ width: number; height: number; close: () => void }>[] = [];
    const closed: number[] = []; let calls = 0; let open = 0; let peak = 0;
    const decode = vi.fn((_blob: Blob, _opts?: unknown) => { const index = calls++; open++; peak = Math.max(peak, open); const gate = deferred<{ width: number; height: number; close: () => void }>(); gates.push(gate); return gate.promise; });
    vi.stubGlobal('createImageBitmap', decode);
    const bitmap = (index: number, width = 10, height = 10) => ({ width, height, close: () => { closed.push(index); open--; } });
    return { decode, gates, closed, bitmap, calls: () => calls, peak: () => peak };
  }
  it('holds one slot across concurrent calls through settlement and close; cancelled first does not let retry decode early', async () => {
    const g = gatedDecode();
    const c1 = new AbortController();
    const first = prepareBoardImages([file(png(10, 10), 'a.png', 'image/png')], c1.signal);
    const firstRejected = expect(first).rejects.toThrow(/abort/i);
    await flush(); expect(g.calls()).toBe(1);
    const retry = prepareBoardImages([file(png(10, 10), 'b.png', 'image/png')]);
    await flush(); expect(g.calls()).toBe(1); expect(g.peak()).toBe(1);
    c1.abort();
    g.gates[0]!.resolve(g.bitmap(0));
    await firstRejected; expect(g.closed).toEqual([0]);
    await flush(); expect(g.calls()).toBe(2);
    g.gates[1]!.resolve(g.bitmap(1));
    await expect(retry).resolves.toMatchObject([{ name: 'b.png', width: 10, height: 10 }]);
    expect(g.closed).toEqual([0, 1]); expect(g.peak()).toBe(1);
  });
  it('queued aborted job never decodes and failures unlock the queue', async () => {
    const g = gatedDecode();
    const first = prepareBoardImages([file(png(10, 10), 'a.png', 'image/png')]);
    const firstRejected = expect(first).rejects.toThrow(/decode failed/);
    await flush(); expect(g.calls()).toBe(1);
    const c2 = new AbortController();
    const queued = prepareBoardImages([file(png(10, 10), 'b.png', 'image/png')], c2.signal);
    const queuedRejected = expect(queued).rejects.toThrow(/abort/i);
    const third = prepareBoardImages([file(png(10, 10), 'c.png', 'image/png')]);
    await flush(); c2.abort();
    g.gates[0]!.reject(new Error('decode failed'));
    await firstRejected; await queuedRejected;
    await flush(); expect(g.calls()).toBe(2);
    g.gates[1]!.resolve(g.bitmap(2));
    await expect(third).resolves.toMatchObject([{ name: 'c.png' }]);
    expect(g.closed).toEqual([2]);
  });
  it('validation error after decode closes bitmap and unlocks the queue', async () => {
    const g = gatedDecode();
    const first = prepareBoardImages([file(png(10, 10), 'a.png', 'image/png')]);
    const firstRejected = expect(first).rejects.toThrow(/does not match/);
    await flush();
    const second = prepareBoardImages([file(png(10, 10), 'b.png', 'image/png')]);
    await flush(); expect(g.calls()).toBe(1);
    g.gates[0]!.resolve(g.bitmap(0, 11, 10));
    await firstRejected; expect(g.closed).toEqual([0]);
    await flush(); expect(g.calls()).toBe(2);
    g.gates[1]!.resolve(g.bitmap(1));
    await expect(second).resolves.toMatchObject([{ name: 'b.png' }]);
    expect(g.closed).toEqual([0, 1]);
  });
});
