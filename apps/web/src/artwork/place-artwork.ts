import { placeImages } from '../state/images';
import { cropPixels, type Artwork } from './catalog';

export async function placeArtwork(artwork: Artwork, signal: AbortSignal) {
  const response = await fetch(artwork.src, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not download this artwork (${response.status}). Please try again.`);
  let blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('The artwork server did not return an image. Please choose another image.');
  if (artwork.crop) {
    const bitmap = await createImageBitmap(blob);
    try {
      const rect = cropPixels(artwork.crop, bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare this artwork. Please try again.');
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare this artwork.')), 'image/png'));
    } finally { bitmap.close(); }
  }
  signal.throwIfAborted();
  await placeImages([blob], undefined, {
    frame: 'sticker', caption: artwork.label, maxSide: artwork.subject === 'places' ? 640 : 320,
    rotation: 0, signal,
    artwork: { assetId: artwork.id, styleId: artwork.styleId, sourceUrl: artwork.src,
      ...(artwork.original ? { originalUrl: artwork.original } : {}), ...(artwork.sourceHash ? { sourceHash: artwork.sourceHash } : {}) },
  });
}
