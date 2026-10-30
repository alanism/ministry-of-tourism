import { z } from 'zod';
import {artRefSchema} from '@writers-board/core';

const id = z.string().min(1).max(160);
const label = z.string().min(1).max(300);
const catalogUrl = z.string().regex(/^\/artwork\/[a-zA-Z0-9/_-]+\.json$/);
const imageUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Artwork images need a public HTTPS URL');
const crop = z.tuple([z.number().min(0), z.number().min(0), z.number().positive(), z.number().positive()])
  .refine(([x, y, w, h]) => x + w <= 1.000001 && y + h <= 1.000001, 'Crop must fit inside the image');

export const registrySchema = z.object({
  version: z.literal(1),
  styles: z.array(z.object({ id, label, manifest: catalogUrl,credit:z.string().min(1).max(1000).optional(),rightsStatus:z.enum(['approved','unknown','restricted']).optional() })).min(1),
}).refine(value => new Set(value.styles.map(style => style.id)).size === value.styles.length, 'Style IDs must be unique');

export const manifestSchema = z.object({
  version: z.literal(1), styleId: id,
  subjects: z.array(z.object({ id, label })).min(1),
  cities: z.array(z.object({ id, label })),
  catalogs: z.array(z.object({ subject: id, city: id.optional(), url: catalogUrl, count: z.number().int().nonnegative() })),
  credit:z.string().min(1).max(1000).optional(),rightsStatus:z.enum(['approved','unknown','restricted']).optional(),
}).refine(value => value.catalogs.every(catalog => value.subjects.some(subject => subject.id === catalog.subject)
  && (!catalog.city || value.cities.some(city => city.id === catalog.city))), 'Unknown artwork subject or city');

export const artworkSchema = z.object({
  id, styleId: id, label, subject: id, city: id.optional(), collection: id.optional(),
  thumb: imageUrl, src: imageUrl, original: imageUrl.optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  width: z.number().positive(), height: z.number().positive(), crop: crop.optional(),
  artRef:artRefSchema.optional(),
}).superRefine((art,ctx)=>{
  const ref=art.artRef;if(ref&&(art.id!==ref.assetId||art.city!==ref.originCityId||art.width!==ref.width||art.height!==ref.height||art.thumb!==ref.thumbnailUrl||art.src!==ref.renditionUrl||art.original!==ref.originalUrl))ctx.addIssue({code:'custom',message:'Artwork display fields conflict with its ArtRef'});
});

export const catalogSchema = z.object({ version: z.literal(1), styleId: id, items: z.array(artworkSchema) })
  .refine(value => value.items.every(item => item.styleId === value.styleId), 'Artwork belongs to a different style')
  .refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Artwork IDs must be unique');

export type Artwork = z.infer<typeof artworkSchema>;
export type StylePack = z.infer<typeof registrySchema>['styles'][number];
export type Manifest = z.infer<typeof manifestSchema>;

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE_MAX_ENTRIES = 32;
type CatalogCacheEntry = { storedAt: number; data: unknown };
const catalogCache = new Map<string, CatalogCacheEntry>();
const catalogSchemaIds = new WeakMap<object, number>();
const catalogFetcherIds = new WeakMap<object, number>();
let nextCatalogSchemaId = 1;
let nextCatalogFetcherId = 1;

function catalogIdentityId(ids: WeakMap<object, number>, value: object, assign: () => number): number {
  let id = ids.get(value);
  if (id === undefined) { id = assign(); ids.set(value, id); }
  return id;
}

function catalogCacheKey<T>(url: string, schema: z.ZodType<T>, fetcher: typeof fetch): string {
  const schemaId = catalogIdentityId(catalogSchemaIds, schema, () => nextCatalogSchemaId++);
  const fetcherId = catalogIdentityId(catalogFetcherIds, fetcher, () => nextCatalogFetcherId++);
  return JSON.stringify([schemaId, fetcherId, url]);
}

async function fetchCatalog<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal, fetcher: typeof fetch): Promise<T> {
  signal.throwIfAborted();
  let abort!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>reject(signal.reason??new DOMException('Catalog cancelled','AbortError'));signal.addEventListener('abort',abort,{once:true});});
  try {
    const work=(async()=>{
      const response = await fetcher(url, { signal, credentials: 'omit' });
      if(signal.aborted){void response.body?.cancel().catch(()=>{});signal.throwIfAborted();}
      if (!response.ok) throw new Error(`Could not load artwork (${response.status}). Please retry.`);
      const body=await response.json();signal.throwIfAborted();
      const result = schema.safeParse(body);
      if (!result.success) throw new Error('This artwork catalog is not supported. Please retry or choose another style.');
      return result.data;
    })();
    return await Promise.race([work,cancelled]);
  } finally {signal.removeEventListener('abort',abort);}
}

export async function readCatalog<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal, fetcher: typeof fetch = fetch, options: { cache?: boolean; forceRefresh?: boolean } = {}): Promise<T> {
  signal.throwIfAborted();
  if (!options.cache) return fetchCatalog(url, schema, signal, fetcher);
  const key = catalogCacheKey(url, schema, fetcher);
  if (options.forceRefresh) {
    catalogCache.delete(key);
  } else {
    const entry = catalogCache.get(key);
    if (entry) {
      const age = Date.now() - entry.storedAt;
      if (age < 0 || age >= CATALOG_CACHE_TTL_MS) {
        catalogCache.delete(key);
      } else {
        catalogCache.delete(key);
        catalogCache.set(key, entry);
        signal.throwIfAborted();
        return structuredClone(entry.data) as T;
      }
    }
  }
  const data = await fetchCatalog(url, schema, signal, fetcher);
  signal.throwIfAborted();
  catalogCache.delete(key);
  catalogCache.set(key, { storedAt: Date.now(), data: structuredClone(data) });
  while (catalogCache.size > CATALOG_CACHE_MAX_ENTRIES) {
    const oldest = catalogCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    catalogCache.delete(oldest);
  }
  return data;
}

/** Normalized source crops also work on the recorded optimized image variant. */
export function cropPixels(crop: Artwork['crop'], width: number, height: number) {
  const [x, y, w, h] = crop ?? [0, 0, 1, 1];
  const left = Math.min(width - 1, Math.round(x * width));
  const top = Math.min(height - 1, Math.round(y * height));
  return { x: left, y: top, width: Math.max(1, Math.min(width - left, Math.round(w * width))), height: Math.max(1, Math.min(height - top, Math.round(h * height))) };
}
