// Imported only after an image-inspection request. Read local board bytes,
// never fetch a model-supplied URL or preload the artwork catalogue.
import { latestBoard } from '../state/board';
import { getBlob } from '../state/blobs';

export async function readBoardImage(id: string, signal: AbortSignal): Promise<{ caption: string; dataUrl: string }> {
  signal.throwIfAborted();
  const image = latestBoard()?.images.find(image => image.id === id);
  if (!image) throw new Error('That picture is no longer on the board.');
  const blob = await getBlob(image.blobId);
  signal.throwIfAborted();
  if (!blob) throw new Error('This browser does not have the picture’s image data.');
  const bitmap = await createImageBitmap(blob);
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The picture could not be prepared for inspection.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { caption: image.caption, dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
  } finally { bitmap.close(); }
}
