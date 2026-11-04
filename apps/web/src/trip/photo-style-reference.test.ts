import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { PHOTO_STYLE_REFERENCES, loadPhotoStyleReference } from './photo-style-reference';
import { generateMuseImage, MUSE_IMAGE_EDIT_ENDPOINT } from './muse-image';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=', 'base64'));
const source = new Blob([png], { type: 'image/png' });
const provider = () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(png).toString('base64') }] }));

it.each(['fashion', 'city'] as const)('loads the approved %s reference from this app and sends it second, after the selected photo', async style => {
  const reference = PHOTO_STYLE_REFERENCES[style];
  const bytes = readFileSync(new URL(`../../public${reference.url}`, import.meta.url));
  const fetchReference = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  const blob = await loadPhotoStyleReference(style, new AbortController().signal, fetchReference);
  expect(fetchReference).toHaveBeenCalledWith(reference.url, expect.objectContaining({ credentials: 'omit' }));
  expect(await blob.arrayBuffer()).toEqual(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const fetcher = vi.fn(async () => provider());
  await generateMuseImage({ key: 'FICTIONAL-REFERENCE-TEST', prompt: 'IMAGE 1 is the photo. IMAGE 2 is style only.', aspect: 'portrait', sourcePhoto: source, styleReference: blob }, { fetcher, decode: async () => ({ width: 1, height: 1 }) });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(String(init.body));
  expect(url).toBe(MUSE_IMAGE_EDIT_ENDPOINT);
  expect(body.images).toEqual([{ image_url: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }, { image_url: `data:image/png;base64,${bytes.toString('base64')}` }]);
  expect(body.tool_enablement).toEqual({ enable_image_search: false, enable_web_search: false, enable_shell: false });
  expect(body.n).toBe(1);
});

it('fails closed when the approved reference is missing, replaced or cancelled', async () => {
  const signal = new AbortController().signal;
  await expect(loadPhotoStyleReference('fashion', signal, async () => new Response('missing', { status: 404 }))).rejects.toThrow(/reference/);
  await expect(loadPhotoStyleReference('city', signal, async () => new Response(png))).rejects.toThrow(/reference/);
  const abort = new AbortController(); abort.abort(); const fetcher = vi.fn();
  await expect(loadPhotoStyleReference('fashion', abort.signal, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('refuses a style-only or malformed reference before sending a provider request', async () => {
  const fetcher = vi.fn();
  await expect(generateMuseImage({ key: 'FICTIONAL-REFERENCE-TEST', prompt: 'Fixture', aspect: 'portrait', styleReference: source }, { fetcher })).rejects.toMatchObject({ kind: 'rejected', uncertain: false });
  await expect(generateMuseImage({ key: 'FICTIONAL-REFERENCE-TEST', prompt: 'Fixture', aspect: 'portrait', sourcePhoto: source, styleReference: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }, { fetcher })).rejects.toMatchObject({ kind: 'rejected', uncertain: false });
  expect(fetcher).not.toHaveBeenCalled();
});
