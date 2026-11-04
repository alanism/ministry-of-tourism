export const PHOTO_STYLE_REFERENCES = {
  fashion: { url: '/assets/photo-illustration/fashion-reference.png', label: 'Approved fashion illustration style reference', sha256: '7f79f78e08ddc7f0472ab8d5ba5b6baa57a4be18d606e172ad5750ec3b41214e' },
  city: { url: '/assets/photo-illustration/city-ink-reference.png', label: 'Approved FCC City Ink style reference', sha256: '7913c2ebe656ce98ab7b5e35de568fbdf179bd15458a0c70840ecd5bfd1a3894' },
} as const;

/** Only the owner-approved, byte-pinned reference is attached; no credentials leave with this GET. */
export async function loadPhotoStyleReference(style: keyof typeof PHOTO_STYLE_REFERENCES, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
  signal.throwIfAborted();
  const reference = PHOTO_STYLE_REFERENCES[style];
  const response = await fetcher(reference.url, { signal, credentials: 'omit' });
  if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024) throw Error('The approved style reference could not be loaded. Nothing was sent to Meta.');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  if (bytes.byteLength > 1024 * 1024) throw Error('The approved style reference is too large. Nothing was sent to Meta.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== reference.sha256) throw Error('The approved style reference failed its check. Nothing was sent to Meta.');
  return new Blob([bytes], { type: 'image/png' });
}
