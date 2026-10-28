// PNG print info (MOT-35): declare the resolution so the file's physical size is its declared size,
// and label the file as a derivative keepsake. Chunks go right after IHDR.
import { concat } from './image-meta.ts';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function pngWithPrintInfo(png: Uint8Array, dpi: number, description: string): Uint8Array {
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset + 8, 4).getUint32(0);
  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9);
  new DataView(phys.buffer).setUint32(0, ppm);
  new DataView(phys.buffer).setUint32(4, ppm);
  phys[8] = 1; // unit: metre
  const text = new TextEncoder().encode(`Description\0${description}`);
  return concat([png.subarray(0, ihdrEnd), chunk('pHYs', phys), chunk('tEXt', text), png.subarray(ihdrEnd)]);
}
