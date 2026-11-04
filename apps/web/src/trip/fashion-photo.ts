import { prepareBoardImages } from './board-images';

export interface PreparedFashionPhoto { blob: Blob; width: number; height: number }
export const FASHION_PHOTO_MAX_SIDE = 1600;
export const FASHION_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/** Validate before decode, then redraw to drop metadata and bound the outgoing photo.
 * No document, blob store, storage or network writes occur here. */
export async function prepareFashionPhoto(file: File, signal: AbortSignal): Promise<PreparedFashionPhoto> {
  const [prepared] = await prepareBoardImages([file], signal);
  if (!prepared) throw Error('Choose a PNG, JPEG or simple static WebP photo.');
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(prepared.blob);
  try {
    signal.throwIfAborted();
    const ratio = Math.min(1, FASHION_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio)), height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw Error('Photo preparation is unavailable in this browser.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('The photo could not be prepared.')), 'image/jpeg', .92));
    signal.throwIfAborted();
    if (blob.type !== 'image/jpeg' || blob.size > FASHION_PHOTO_MAX_BYTES) throw Error('The prepared photo is too large. Choose a smaller photo.');
    return { blob, width, height };
  } finally { bitmap.close(); }
}
