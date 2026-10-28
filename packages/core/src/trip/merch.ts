// MOT-102: public apparel metadata and city-only FCC commerce links. No checkout state lives here.
import { z } from 'zod';
import { FCC_ORIGIN, isPublicFccUrl } from './city-source.ts';
import { shell, kicker, rows, wrap, magazineLabel, PAPER, M, L, PU, escapeXml as esc } from './magazine-style.ts';

const slug = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const id = z.string().min(1).max(200);
const publicImage = z.string().max(2000).refine(isPublicFccUrl, 'Apparel images must use public FCC HTTPS URLs');
const apparelSource = z.object({
  provider: z.literal('fcc'), sourceId: id, canonicalUrl: publicImage, cityId: slug.optional(), countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  kind: z.literal('artwork'), publishedAt: z.string().max(80).optional(), updatedAt: z.string().max(80).optional(), retrievedAt: z.string().min(1).max(80),
  version: z.string().max(200).optional(), contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), origin: z.literal('artwork'),
  id: id.optional(), url: publicImage.optional(),
}).strict();
export const apparelArtRefSchema = z.object({
  assetId: id, category: z.string().min(1).max(200), kind: z.literal('apparel-mockup'), originCityId: slug,
  label: z.string().min(1).max(500).optional(), variant: z.string().min(1).max(120).optional(), countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  role:z.enum(['apparel-brush','apparel-map-mono','apparel-map-color']).optional(),
  depictedPlace: z.string().max(500).optional(), geographicScope: z.enum(['city', 'country', 'unspecified']).optional(),
  thumbnailUrl: publicImage, renditionUrl: publicImage, originalUrl: publicImage.optional(),
  width: z.number().finite().positive(), height: z.number().finite().positive(), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(), credit: z.string().max(1000).optional(), rightsStatus: z.enum(['approved', 'unknown', 'restricted']), source: apparelSource,
}).strict();
export type ApparelArtRef = z.infer<typeof apparelArtRefSchema>;

export function selectCityApparel(cityId: string, rawEntries: unknown): ApparelArtRef[] {
  slug.parse(cityId);
  if (!Array.isArray(rawEntries)) throw new Error('FCC apparel entries must be an array.');
  const selected = new Map<string, ApparelArtRef>();
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object' || raw.kind !== 'apparel-mockup') continue;
    const artwork = apparelArtRefSchema.parse(raw);
    if (artwork.originCityId !== cityId) continue;
    if (artwork.source.cityId && artwork.source.cityId !== cityId) throw new Error('FCC apparel provenance belongs to another city.');
    const previous = selected.get(artwork.assetId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(artwork)) throw new Error('FCC apparel has conflicting metadata for the same asset.');
    selected.set(artwork.assetId, artwork);
  }
  return [...selected.values()];
}

/** The function has no access to trip titles, dates, people, notes or arbitrary query parameters. */
export function fccShopUrl(cityId: string): string {
  return `${FCC_ORIGIN}/shop/?city=${encodeURIComponent(slug.parse(cityId))}`;
}

const localCatalog = z.string().regex(/^\/artwork\/[a-zA-Z0-9/_-]+\.json$/);
const registry = z.object({ version: z.literal(1), styles: z.array(z.object({ id, label: z.string().min(1).max(300), manifest: localCatalog }).strict()).max(100) }).strict();
const manifest = z.object({
  version: z.literal(1), styleId: id, subjects: z.array(z.object({ id, label: z.string().max(300) }).strict()), cities: z.array(z.object({ id, label: z.string().max(300) }).strict()),
  catalogs: z.array(z.object({ subject: id, city: slug.optional(), url: localCatalog, count: z.number().int().nonnegative() }).strict()),
}).strict();
const rawCatalog = z.object({ version: z.literal(1), styleId: id, items: z.array(z.unknown()).max(5000) }).strict();
async function fourWorkers<T, R>(values: readonly T[], work: (value: T) => Promise<R>): Promise<R[]> {
  let next = 0; const out: R[] = new Array(values.length);
  await Promise.all(Array.from({ length: Math.min(4, values.length) }, async () => {
    while (next < values.length) { const index = next++; out[index] = await work(values[index]!); }
  }));
  return out;
}
export async function loadCityApparel(cityId: string, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<ApparelArtRef[]> {
  slug.parse(cityId);
  const controller = new AbortController(), fetcher = options.fetcher ?? fetch;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new Error('FCC apparel loading was cancelled.');
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 20000);
  async function read<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    if (controller.signal.aborted) throw new Error('FCC apparel loading was cancelled or timed out.');
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('FCC apparel metadata could not be loaded. Retry.');
    const data = schema.parse(await response.json());
    if (controller.signal.aborted) throw new Error('FCC apparel loading was cancelled or timed out.');
    return data;
  }
  try {
    const styles = await read('/artwork/index.json', registry);
    const references = (await fourWorkers(styles.styles, async style => {
      const data = await read(style.manifest, manifest);
      if (data.styleId !== style.id) throw new Error('FCC apparel style identity does not match.');
      return data.catalogs.filter(catalog => catalog.city === cityId && catalog.count > 0).map(catalog => ({ ...catalog, styleId: style.id }));
    })).flat();
    const catalogs = await fourWorkers(references, async reference => {
      const data = await read(reference.url, rawCatalog);
      if (data.styleId !== reference.styleId || data.items.length !== reference.count) throw new Error('FCC apparel catalog identity does not match.');
      // Parse raw items: legacy catalog validators must not strip the explicit ArtRef classification.
      return data.items;
    });
    return selectCityApparel(cityId, catalogs.flat());
  } finally { clearTimeout(timer); controller.abort(); options.signal?.removeEventListener('abort', cancel); }
}

export interface ApparelPage { id: string; pattern: 'merch' | 'tee-advert'; folio: number; svg: string; assetIds: string[]; credits: string[]; }
export interface ApparelPageOptions { cityId: string; cityName: string; artwork: unknown; embeddedUrls: ReadonlyMap<string, string>; widthPx: number; heightPx: number; startFolio: number; }
const embeddedRaster = /^data:image\/(?:png|jpeg|webp|avif);base64,[a-z0-9+/=]+$/i;

/** Full-page photographs, with a distinct, labelled last-page jacket. Never classifies art by its label. */
export function buildApparelPages(options:ApparelPageOptions):ApparelPage[]{
  const shop=fccShopUrl(options.cityId),cityName=z.string().min(1).max(120).parse(options.cityName);
  const w=z.number().finite().positive().max(10000).parse(options.widthPx),h=z.number().finite().positive().max(10000).parse(options.heightPx);
  z.number().int().positive().parse(options.startFolio);
  const identities=new Set<string>();
  const artwork=selectCityApparel(options.cityId,options.artwork).filter(a=>options.embeddedUrls.has(a.assetId)).filter(a=>{
    const identity=a.hash??a.source.contentHash??a.source.sourceId;
    if(identities.has(identity))return false;identities.add(identity);return true;
  }).slice(0,3);
  if(!artwork.length)return [];
  for(const art of artwork){if(!embeddedRaster.test(options.embeddedUrls.get(art.assetId)!))throw new Error('Apparel pages require embedded raster image bytes.');if(art.rightsStatus!=='approved'&&!art.credit?.trim())throw new Error('FCC credit is required for '+art.assetId+'.');}
  const jacket=artwork.find(a=>a.role==='apparel-map-color')??artwork.at(-1)!;
  const ordered=[...artwork.filter(a=>a!==jacket),jacket];
  return ordered.map((art,i)=>{
    const advert=art===jacket,folio=options.startFolio+i,credits=art.credit?.trim()?[art.credit.trim()]:[],creditLines=credits.flatMap(c=>wrap(c,70));
    if(creditLines.length>5)throw new Error('The supplied FCC credit exceeds this page layout. Preserve the credit and omit the apparel page.');
    const title=advert?'Take '+cityName+' with you.':'Wear the trip';
    const content='<image href="'+options.embeddedUrls.get(art.assetId)+'" x="0" y="0" width="1184" height="1680" preserveAspectRatio="xMidYMid meet"/>'
      +kicker(advert?'FCC · Advertisement':'FCC · '+cityName,M,2*L)
      +'<rect x="'+M+'" y="1230" width="1018" height="250" fill="'+PAPER+'"/>'
      +rows(wrap(title,35),M+24,1320,4.05*PU,L,'IBM Plex Serif',600)
      +(advert?'':rows(wrap(magazineLabel(art.label??art.category),65).slice(0,1),M+24,1380,2.1*PU,L))
      +'<a href="'+esc(shop)+'" target="_blank" rel="noopener noreferrer">'+kicker('Order on FCC →',M+24,1430)+'</a>'
      +rows(creditLines,M,1510,1.9*PU,26,'IBM Plex Mono');
    return {id:(advert?'tee-advert:':'merch:')+options.cityId+':'+art.assetId,pattern:advert?'tee-advert' as const:'merch' as const,folio,svg:shell(content,cityName,advert?undefined:folio).replace('width="1184" height="1680"','width="'+w+'" height="'+h+'"'),assetIds:[art.assetId],credits};
  });
}
