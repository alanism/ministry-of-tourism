/** Blob storage and board persistence must both finish before a durable-save message. */
export async function confirmImageSaved(persisted: boolean, whenSaved: (() => Promise<void>) | undefined, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted();
  if (!whenSaved) return false;
  let stop!: () => void, confirmed = false;
  try {
    const cancelled = new Promise<never>((_resolve, reject) => { stop = () => reject(signal.reason); signal.addEventListener('abort', stop, { once: true }); });
    await Promise.race([whenSaved(), cancelled]); confirmed = true;
  } catch { /* The already-applied card stays recoverable; never add it a second time. */ }
  finally { signal.removeEventListener('abort', stop); }
  signal.throwIfAborted();
  return persisted && confirmed;
}
