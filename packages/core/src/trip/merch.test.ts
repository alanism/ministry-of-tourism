import { describe, expect, it, vi } from 'vitest';
import { buildApparelPages, fccShopUrl, loadCityApparel, selectCityApparel } from './merch.ts';

const ORIGIN = 'https://foreignclubberscorespondence.web.app';
const art = (assetId = 'tee-1', originCityId = 'san-sebastian') => ({
  assetId, category: 'tee', label: 'A city tee', kind: 'apparel-mockup', originCityId,
  thumbnailUrl: `${ORIGIN}/assets/tee-thumb.webp`, renditionUrl: `${ORIGIN}/assets/tee.webp`,
  width: 800, height: 1000, mimeType: 'image/webp', credit: 'FCC photographer credit', rightsStatus: 'approved',
  source: { provider: 'fcc', sourceId: assetId, canonicalUrl: `${ORIGIN}/san-sebastian.html`, cityId: originCityId, kind: 'artwork', retrievedAt: '2026-10-28T00:00:00Z', origin: 'artwork' },
});
const png = 'data:image/png;base64,iVBORw0KGgo=';
const dimensions = { widthPx: 1184, heightPx: 1680, startFolio: 10 };
const pages = (artwork: unknown[], embeddedUrls = new Map(artwork.map((a: any) => [a.assetId, png]))) => buildApparelPages({ cityId: 'san-sebastian', cityName: 'San Sebastián', artwork, embeddedUrls, ...dimensions });

describe('MOT-102 explicit apparel identity and shop privacy', () => {
  it('selects only explicitly classified apparel from the exact city', () => {
    const legacy = { id: 'map-tee-from-filename', src: `${ORIGIN}/assets/home-map-wall-v2/tiles/mono/800/san-sebastian.webp` };
    expect(selectCityApparel('san-sebastian', [legacy, { ...art(), kind: 'map' }, { ...art(), kind: 'original-art' }, art('other', 'bilbao'), art()])).toMatchObject([{ assetId: 'tee-1', kind: 'apparel-mockup', originCityId: 'san-sebastian' }]);
  });
  it('rejects malformed declared apparel instead of treating it as missing metadata', () => {
    expect(() => selectCityApparel('san-sebastian', [{ kind: 'apparel-mockup' }])).toThrow();
    expect(() => selectCityApparel('san-sebastian', [{ ...art(), renditionUrl: 'https://attacker.example/tee.png' }])).toThrow();
    expect(() => selectCityApparel('san-sebastian', [{ ...art(), mimeType: 'image/svg+xml' }])).toThrow();
  });
  it('builds city-only FCC shop URLs for 200 stable slug cases and rejects injected trip fields', () => {
    // Schema cases, not a claim that 200 remote shop pages were visited.
    for (let i = 0; i < 200; i++) {
      const slug = `test-city-${i}`, url = new URL(fccShopUrl(slug));
      expect(url.origin).toBe(ORIGIN); expect(url.pathname).toBe('/shop/');
      expect([...url.searchParams]).toEqual([['city', slug]]);
    }
    for (const slug of ['', '../private', 'paris&name=Guest', 'paris?notes=secret', 'Paris Trip', 'paris#dates', 'https://evil.example']) expect(() => fccShopUrl(slug)).toThrow();
  });
});

describe('MOT-102 metadata discovery', () => {
  const index = { version: 1, styles: [{ id: 'fcc', label: 'FCC', manifest: '/artwork/fcc/manifest.json' }] };
  const manifest = { version: 1, styleId: 'fcc', subjects: [{ id: 'people', label: 'People' }], cities: [{ id: 'san-sebastian', label: 'San Sebastián' }, { id: 'paris', label: 'Paris' }], catalogs: [
    { city: 'san-sebastian', subject: 'people', count: 1, url: '/artwork/fcc/san-sebastian/people.json' },
    { city: 'paris', subject: 'people', count: 1, url: '/artwork/fcc/paris/people.json' },
  ] };
  it('reads raw explicit ArtRefs from only the requested city catalogs', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url) === '/artwork/index.json' ? index : String(url).endsWith('manifest.json') ? manifest : { version: 1, styleId: 'fcc', items: [art()] })));
    expect(await loadCityApparel('san-sebastian', { fetcher })).toMatchObject([{ assetId: 'tee-1' }]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/artwork/index.json', '/artwork/fcc/manifest.json', '/artwork/fcc/san-sebastian/people.json']);
    for (const [, request] of fetcher.mock.calls) expect(request).toMatchObject({ credentials: 'omit' });
  });
  it('returns no apparel for unclassified legacy catalogs and never infers it from URL patterns', async () => {
    const fetcher = (async (url) => new Response(JSON.stringify(String(url) === '/artwork/index.json' ? index : String(url).endsWith('manifest.json') ? manifest : { version: 1, styleId: 'fcc', items: [{ id: 'tee', city: 'san-sebastian', src: `${ORIGIN}/assets/brush-portraits-v1/san-sebastian/model.webp` }] }))) as typeof fetch;
    expect(await loadCityApparel('san-sebastian', { fetcher })).toEqual([]);
  });
  it('does not turn network failure into a no-tees result, and aborts before fetching when cancelled', async () => {
    await expect(loadCityApparel('san-sebastian', { fetcher: (async () => { throw new Error('network'); }) as typeof fetch })).rejects.toThrow();
    const controller = new AbortController(); controller.abort(); const fetcher = vi.fn();
    await expect(loadCityApparel('san-sebastian', { fetcher, signal: controller.signal })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('MOT-89/102 prepared apparel pages', () => {
  it('omits both pages when no permitted photos exist and recomposes partial variants without placeholders', () => {
    expect(pages([])).toEqual([]);
    expect(pages([{ ...art(), kind: 'map' }])).toEqual([]);
    expect(pages([art()], new Map())).toEqual([]);
    for (const count of [1, 2, 3]) {
      const output = pages(Array.from({ length: count }, (_, i) => art(`tee-${i}`)));
      expect(output.map(page => page.pattern)).toEqual([...Array.from({length:count-1},()=> 'merch'),'tee-advert']);
      expect(output.map(page => page.folio)).toEqual(Array.from({length:count},(_,i)=>10+i));
      expect(output.every(page=>(page.svg.match(/<image /g)??[]).length===1)).toBe(true);
      expect(new Set(output.flatMap(page=>page.assetIds)).size).toBe(count);
      expect(output[0]!.svg).not.toMatch(/placeholder|unavailable/i);
    }
  });
  it('embeds only selected raster data and escapes all visible source text without HTML or scripts', () => {
    const artwork = [art('one'), art('two'), art('three'), art('four')];
    const output = buildApparelPages({ cityId: 'san-sebastian', cityName: '<script>bad()</script> & City', artwork, embeddedUrls: new Map(artwork.map(a => [a.assetId, png])), ...dimensions });
    expect(output.flatMap(page=>page.assetIds)).toEqual(['one', 'two', 'three']);
    for (const page of output) {
      expect(page.svg).not.toMatch(/<script|foreignObject|https:\/\/attacker/);
      expect(page.svg).toContain('&lt;script&gt;bad()&lt;/script&gt; &amp; City');
      expect(page.svg).toContain(fccShopUrl('san-sebastian').replace(/&/g, '&amp;'));
      expect(page.credits).toEqual(['FCC photographer credit']);
      expect(page.svg).not.toMatch(/\$\d|in stock|size [SML]|price:/i);
    }
    expect(() => pages([art()], new Map([['tee-1', 'data:image/svg+xml,<svg onload="evil()"/>']]))).toThrow();
  });
  it('keeps unknown/restricted artwork with actual credit, and fails clearly when the required credit is missing', () => {
    for (const rightsStatus of ['unknown', 'restricted']) {
      expect(pages([{ ...art(), rightsStatus }])).toHaveLength(1);
      expect(() => pages([{ ...art(), rightsStatus, credit: '' }])).toThrow(/credit/i);
    }
  });
  it('never serializes private trip fields and attributes the advert only to its own image', () => {
    const artwork = [art('first'), { ...art('last'), credit: 'Other FCC photographer' }];
    const input = { cityId: 'san-sebastian', cityName: 'San Sebastián', artwork, embeddedUrls: new Map(artwork.map(a => [a.assetId, png])), ...dimensions,
      tripTitle: 'private-trip-title', guestName: 'private-guest-name', notes: 'private-notes', dates: 'private-stay-dates' };
    const output = buildApparelPages(input);
    expect(output[1]!.credits).toEqual(['Other FCC photographer']);
    expect(output[1]!.svg).not.toContain('FCC photographer credit');
    expect(JSON.stringify(output)).not.toContain('private-');
  });
});
