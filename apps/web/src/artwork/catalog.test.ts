import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { artworkSchema, catalogSchema, manifestSchema, registrySchema, cropPixels, readCatalog } from './catalog';

const asset = {
  id: 'fcc:person', styleId: 'fcc-editorial', label: 'Café woman', subject: 'people', city: 'bangkok',
  thumb: 'https://example.com/person-480.webp', src: 'https://example.com/person-960.webp',
  original: 'https://example.com/person.png', sourceHash: 'a'.repeat(64),
  width: 1254, height: 1254, crop: [0.05, 0.02, 0.2, 0.47],
};

describe('artwork catalogs', () => {
  it('validates the published FCC metadata and every crop against the shared pack contract', async () => {
    const root = new URL('../../public/', import.meta.url);
    const json = async (url: string) => JSON.parse(await readFile(new URL(url.replace(/^\//, ''), root), 'utf8'));
    const registry = registrySchema.parse(await json('/artwork/index.json'));
    const fcc = registry.styles.find(style => style.id === 'fcc-editorial')!;
    const manifest = manifestSchema.parse(await json(fcc.manifest));
    expect(manifest.cities.length).toBeGreaterThan(100);
    // Bound open files while overlapping small-file I/O on Windows.
    for (let offset = 0; offset < manifest.catalogs.length; offset += 16) {
      const references = manifest.catalogs.slice(offset, offset + 16);
      const catalogs = await Promise.all(references.map(reference => json(reference.url)));
      for (const [index, reference] of references.entries()) {
        const catalog = catalogSchema.parse(catalogs[index]);
        expect(catalog.styleId).toBe(fcc.id);
        expect(catalog.items).toHaveLength(reference.count);
        expect(catalog.items.every(item => item.subject === reference.subject && item.city === reference.city)).toBe(true);
      }
    }
  });
  it('registers new styles as data, including packs without cities', () => {
    const registry = registrySchema.parse({ version: 1, styles: [
      { id: 'fcc-editorial', label: 'FCC illustration', manifest: '/artwork/fcc/manifest.json' },
      { id: 'kawaii', label: 'Kawaii', manifest: '/artwork/kawaii/manifest.json' },
      { id: 'anime', label: 'Cyberpunk anime', manifest: '/artwork/anime/manifest.json' },
    ] });
    expect(registry.styles.map(s => s.id)).toEqual(['fcc-editorial', 'kawaii', 'anime']);
    expect(manifestSchema.parse({ version: 1, styleId: 'kawaii', subjects: [{ id: 'objects', label: 'Objects' }],
      cities: [], catalogs: [{ subject: 'objects', url: '/artwork/kawaii/objects.json', count: 1 }] }).cities).toEqual([]);
    expect(artworkSchema.parse({ ...asset, styleId: 'kawaii', city: undefined }).styleId).toBe('kawaii');
  });

  it('rejects unsafe image URLs, invalid crops and inconsistent catalog identities', () => {
    expect(artworkSchema.safeParse({ ...asset, src: 'javascript:alert(1)' }).success).toBe(false);
    expect(artworkSchema.safeParse({ ...asset, crop: [0.9, 0, 0.2, 1] }).success).toBe(false);
    expect(catalogSchema.safeParse({ version: 1, styleId: 'kawaii', items: [asset] }).success).toBe(false);
    expect(catalogSchema.safeParse({ version: 1, styleId: 'fcc-editorial', items: [asset, asset] }).success).toBe(false);
  });

  it('maps recorded crop coordinates onto the optimized image instead of the original size', () => {
    expect(cropPixels([0.25, 0.5, 0.25, 0.5], 960, 960)).toEqual({ x: 240, y: 480, width: 240, height: 480 });
    expect(cropPixels(undefined, 960, 640)).toEqual({ x: 0, y: 0, width: 960, height: 640 });
  });

  it('fetches only the requested catalog, omits credentials and reports failures for retry', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ version: 1, styleId: 'fcc-editorial', items: [asset] })));
    const controller = new AbortController();
    const result = await readCatalog('/artwork/fcc/bangkok/people.json', catalogSchema, controller.signal, fetcher);
    expect(result.items).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/artwork/fcc/bangkok/people.json', { signal: controller.signal, credentials: 'omit' });
    fetcher.mockResolvedValue(new Response('missing', { status: 404 }));
    await expect(readCatalog('/artwork/missing.json', catalogSchema, controller.signal, fetcher)).rejects.toThrow('404');
  });
});
