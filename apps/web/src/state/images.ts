// Paste (Ctrl+V) or drop image files onto the board. The bytes go to the
// browser's blob store; the board records a framed picture at that spot.
import { putBlob } from './blobs';
import { run } from './board';
import { useUi } from './ui';
import type { ImageView } from '@writers-board/core';

const MAX_SIDE = 320;

async function naturalSize(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export async function placeImages(files: Blob[], at?: { x: number; y: number }, options: {
  frame?: ImageView['frame']; caption?: string; artwork?: ImageView['artwork']; maxSide?: number; rotation?: number; signal?: AbortSignal;
} = {}) {
  const { view } = useUi.getState();
  let offset = 0;
  for (const file of files) {
    options.signal?.throwIfAborted();
    if (!file.type.startsWith('image/')) continue;
    const [blobId, size] = await Promise.all([putBlob(file), naturalSize(file)]);
    options.signal?.throwIfAborted();
    const scale = Math.min(1, (options.maxSide ?? MAX_SIDE) / Math.max(size.width, size.height));
    const width = Math.round(size.width * scale);
    const height = Math.round(size.height * scale);
    const origin = at ?? { x: view.x, y: view.y };
    const created = run<{ id: string }>('image_place', {
      blobId,
      x: Math.round(origin.x - width / 2 + offset),
      y: Math.round(origin.y - height / 2 + offset),
      width,
      height,
      rotation: options.rotation ?? Math.round((Math.random() * 4 - 2) * 10) / 10,
      ...(options.frame ? { frame: options.frame } : {}),
      ...(options.caption ? { caption: options.caption } : {}),
      ...(options.artwork ? { artwork: options.artwork } : {}),
    });
    if (created) useUi.getState().select(created.id);
    offset += 28;
  }
}

export function imagesFromClipboard(event: ClipboardEvent): Blob[] {
  return [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
