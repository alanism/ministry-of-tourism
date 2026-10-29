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

export async function readCatalog<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not load artwork (${response.status}). Please retry.`);
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new Error('This artwork catalog is not supported. Please retry or choose another style.');
  return result.data;
}

/** Normalized source crops also work on the recorded optimized image variant. */
export function cropPixels(crop: Artwork['crop'], width: number, height: number) {
  const [x, y, w, h] = crop ?? [0, 0, 1, 1];
  const left = Math.min(width - 1, Math.round(x * width));
  const top = Math.min(height - 1, Math.round(y * height));
  return { x: left, y: top, width: Math.max(1, Math.min(width - left, Math.round(w * width))), height: Math.max(1, Math.min(height - top, Math.round(h * height))) };
}
