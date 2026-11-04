/** Reads dimensions for an export; cancellation rejects promptly and a late bitmap still closes. */
export function exportBitmapDimensions(blob: Blob, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal?.reason ?? new DOMException('Export cancelled', 'AbortError'));
    if (signal?.aborted) { stop(); return; }
    signal?.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(() => { signal?.throwIfAborted(); return createImageBitmap(blob); }).then(
      image => {
        signal?.removeEventListener('abort', stop);
        const size = { width: image.width, height: image.height };
        image.close();
        if (signal?.aborted) stop(); else resolve(size);
      },
      error => { signal?.removeEventListener('abort', stop); reject(error); },
    );
  });
}
