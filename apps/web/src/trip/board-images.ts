// Bounded board image preparation (MOT-120, approved G5): header first, sequential decode, no writes.
// A format without a safe bounded full-frame header parser is rejected before decode, with a visible fallback:
// GIF (its logical screen may not bound frame decode), extended VP8X WebP (its canvas may not bound an
// encoded subframe), and AVIF/HEIF. PNG, JPEG, and simple single-frame VP8/VP8L WebP are supported.

export interface PreparedBoardImage { blob: Blob; width: number; height: number; name: string; }

export const MAX_BOARD_IMAGE_FILES = 5;
export const MAX_BOARD_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BOARD_IMAGE_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_BOARD_IMAGE_SIDE = 8192;
export const MAX_BOARD_IMAGE_PIXELS = 16777216;
export const BOARD_IMAGE_HEADER_BYTES = 64 * 1024;

const FALLBACK = 'Use a PNG, JPEG, or simple static WebP file, or paste the image as text instead.';
const UNKNOWN_FILE_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);
interface Header { mime: string; width: number; height: number; }

function fail(name: string, reason: string): never { throw new Error(`${name}: ${reason}`); }
function u16le(b: Uint8Array, o: number): number { return b[o]! | (b[o + 1]! << 8); }
function u16be(b: Uint8Array, o: number): number { return (b[o]! << 8) | b[o + 1]!; }
function u32le(b: Uint8Array, o: number): number { return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0; }
function u32be(b: Uint8Array, o: number): number { return b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!); }
function ascii(b: Uint8Array, o: number, n: number): string { return String.fromCharCode(...b.subarray(o, o + n)); }

function parsePng(b: Uint8Array, name: string): Header {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) fail(name, `Not a valid PNG. ${FALLBACK}`);
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') fail(name, `PNG is missing its IHDR header. ${FALLBACK}`);
  return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
}

function parseGif(b: Uint8Array, name: string): Header {
  const kind = ascii(b, 0, 6);
  if (b.length < 6 || (kind !== 'GIF87a' && kind !== 'GIF89a')) fail(name, `Not a valid GIF. ${FALLBACK}`);
  // Reject before decode: the GIF logical screen does not safely bound frame decode here,
  // and no safe full-frame preflight exists in this call.
  fail(name, `GIF is not safely supported here, so nothing was decoded. ${FALLBACK}`);
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function parseJpeg(b: Uint8Array, name: string): Header {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) fail(name, `Not a valid JPEG. ${FALLBACK}`);
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) fail(name, `Malformed JPEG segment. ${FALLBACK}`);
    while (o < b.length && b[o] === 0xff) o++;
    if (o >= b.length) break;
    const marker = b[o]!; o++;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (o + 2 > b.length) fail(name, `JPEG header exceeds the ${BOARD_IMAGE_HEADER_BYTES / 1024} KiB safety bound. ${FALLBACK}`);
    const length = u16be(b, o);
    if (length < 2 || o + length > BOARD_IMAGE_HEADER_BYTES) fail(name, `JPEG header exceeds the ${BOARD_IMAGE_HEADER_BYTES / 1024} KiB safety bound. ${FALLBACK}`);
    if (SOF.has(marker)) {
      if (length < 7 || o + length > b.length) fail(name, `Malformed JPEG frame header. ${FALLBACK}`);
      return { mime: 'image/jpeg', height: u16be(b, o + 3), width: u16be(b, o + 5) };
    }
    o += length;
  }
  fail(name, `JPEG frame header was not found within the safety bound. ${FALLBACK}`);
}

function parseWebp(b: Uint8Array, name: string, fileSize: number): Header {
  if (b.length < 12 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') fail(name, `Not a valid WebP. ${FALLBACK}`);
  if (b.length < 20) fail(name, `Truncated WebP container. ${FALLBACK}`);
  // The RIFF length must describe the complete file exactly; a short header slice or a lying
  // container length must never masquerade as a small image.
  const riffSize = u32le(b, 4);
  if (riffSize < 12 || riffSize + 8 !== fileSize) fail(name, `Truncated or malformed WebP container. ${FALLBACK}`);
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    // Reject before decode: the VP8X canvas does not safely bound an encoded subframe here,
    // and no safe full-frame preflight exists in this call.
    fail(name, `Extended WebP (VP8X) is not safely supported here, so nothing was decoded. ${FALLBACK}`);
  }
  if (chunk !== 'VP8 ' && chunk !== 'VP8L') fail(name, `Unsupported WebP header. ${FALLBACK}`);
  const chunkSize = u32le(b, 16);
  // Single-frame signature: the first and only chunk must exactly account for the container,
  // including the RIFF even-alignment pad byte. Extra or truncated chunks are rejected.
  const chunkEnd = 20 + chunkSize + (chunkSize % 2);
  if (chunkSize === 0 || chunkEnd !== fileSize) fail(name, `Truncated or malformed WebP container. ${FALLBACK}`);
  if (chunk === 'VP8L') {
    if (chunkSize < 5 || b.length < 25 || b[20] !== 0x2f) fail(name, `Malformed WebP lossless header. ${FALLBACK}`);
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunkSize < 10 || b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) fail(name, `Malformed WebP lossy header. ${FALLBACK}`);
  return { mime: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
}

function parseHeader(b: Uint8Array, name: string, fileSize: number): Header {
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') fail(name, `AVIF/HEIF headers are not safely supported here, so nothing was decoded. ${FALLBACK}`);
  if (b.length >= 2 && b[0] === 0x89 && b[1] === 0x50) return parsePng(b, name);
  if (b.length >= 3 && ascii(b, 0, 3) === 'GIF') return parseGif(b, name);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return parseJpeg(b, name);
  if (b.length >= 4 && ascii(b, 0, 4) === 'RIFF') return parseWebp(b, name, fileSize);
  fail(name, `Unsupported or unrecognized image format; nothing was decoded. ${FALLBACK}`);
}

/**
 * Validates budgets and bounded headers for the whole gesture before any decode, then decodes
 * strictly one file at a time, closing every bitmap. Any failure rejects the whole gesture:
 * this function performs no document, blob-store or other writes, so there is never a partial result.
 * Every prepared blob is re-typed with the sniffed MIME (via slice), even when File.type is
 * empty or an unknown generic type such as application/octet-stream; a known conflicting
 * File.type is rejected before decode.
 */
export async function prepareBoardImages(files: readonly File[], signal?: AbortSignal): Promise<PreparedBoardImage[]> {
  if (files.length > MAX_BOARD_IMAGE_FILES) throw new Error(`Choose at most ${MAX_BOARD_IMAGE_FILES} images at a time.`);
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_BOARD_IMAGE_BYTES) fail(file.name, 'Image is over the 10 MiB per-file limit; nothing was decoded.');
    total += file.size;
  }
  if (total > MAX_BOARD_IMAGE_TOTAL_BYTES) throw new Error('Images are over the 50 MiB per-gesture limit; nothing was decoded.');
  const headers: Header[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    const head = new Uint8Array(await file.slice(0, BOARD_IMAGE_HEADER_BYTES).arrayBuffer());
    signal?.throwIfAborted();
    const header = parseHeader(head, file.name, file.size);
    if (!header.width || !header.height) fail(file.name, `Image has invalid dimensions. ${FALLBACK}`);
    if (header.width > MAX_BOARD_IMAGE_SIDE || header.height > MAX_BOARD_IMAGE_SIDE) fail(file.name, `Image exceeds ${MAX_BOARD_IMAGE_SIDE} pixels on a side; nothing was decoded.`);
    if (header.width * header.height > MAX_BOARD_IMAGE_PIXELS) fail(file.name, `Image exceeds ${MAX_BOARD_IMAGE_PIXELS} pixels; nothing was decoded.`);
    if (!UNKNOWN_FILE_TYPES.has(file.type) && file.type !== header.mime) fail(file.name, `File type ${file.type} does not match its ${header.mime} header; nothing was decoded.`);
    headers.push(header);
  }
  const out: PreparedBoardImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!, header = headers[i]!;
    signal?.throwIfAborted();
    const bitmap = await createImageBitmap(file);
    try {
      signal?.throwIfAborted();
      if (bitmap.width !== header.width || bitmap.height !== header.height) fail(file.name, 'Decoded size does not match its header; the whole gesture was cancelled.');
      out.push({ blob: file.slice(0, file.size, header.mime), width: bitmap.width, height: bitmap.height, name: file.name });
    } finally { bitmap.close(); }
  }
  signal?.throwIfAborted();
  return out;
}
