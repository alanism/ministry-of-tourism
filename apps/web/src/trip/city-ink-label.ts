import '@fontsource/ibm-plex-serif/600.css';
import { MUSE_IMAGE_MAX_BYTES, type MuseImageResult } from './muse-image';

/** Paint exact mixed-case typography locally; the provider is asked to generate no letters. */
export function drawCityInkMark(context: CanvasRenderingContext2D, width: number, height: number): void {
  const size = Math.max(14, Math.round(Math.min(width, height) * .035));
  const x = width / 2, y = height * .13;
  context.fillStyle = '#1f64aa';
  context.fillRect(x - size * 1.8, y - size, size * 3.6, size * 1.8);
  context.fillStyle = '#ffffff'; context.font = `600 ${size}px "IBM Plex Serif", serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.letterSpacing = `${size * .12}px`;
  context.fillText('MoT', x, y);
}
export async function addCityInkMark(result: MuseImageResult, signal: AbortSignal): Promise<MuseImageResult> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(result.blob);
  try {
    signal.throwIfAborted();
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw Error('The City Ink mark could not be added. Nothing was saved.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    await document.fonts.load(`600 32px "IBM Plex Serif"`); signal.throwIfAborted();
    drawCityInkMark(context, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('The City Ink image could not be prepared.')), 'image/png'));
    signal.throwIfAborted();
    if (blob.size > MUSE_IMAGE_MAX_BYTES) throw Error('The labeled image is too large to save.');
    return { ...result, blob, mime: 'image/png', width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); }
}
