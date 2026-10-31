let decoderTail: Promise<void> = Promise.resolve();

/** Preview and board insertion hold one slot until native decoding settles and its bitmap closes. */
export async function imageBitmapDimensions(blob: Blob, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  const prior = decoderTail;
  let release!: () => void;
  decoderTail = new Promise<void>((resolve) => { release = resolve; });
  await prior;
  try {
    signal?.throwIfAborted();
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      signal?.throwIfAborted();
      return { width: bitmap.width, height: bitmap.height };
    } finally { bitmap.close(); }
  } finally { release(); }
}
