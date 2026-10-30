// Public FCC content boundary. Feed URLs are configured only after FCC publishes them (MOT-74/78).
import { z } from 'zod';
import { recoverFccTitle } from './fcc-text.ts';

export const FCC_ORIGIN = 'https://foreignclubberscorespondence.web.app';
const FCC_HOSTS = new Set(['foreignclubberscorespondence.web.app', 'foreignclubberscorespondence.firebaseapp.com']);
export function isPublicFccUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && FCC_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port; }
  catch { return false; }
}
const id = z.string().min(1).max(200);
const cityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const sourceUrl = z.string().max(2000).refine(isPublicFccUrl, 'Expected a public FCC HTTPS URL');
const date = z.string().min(1).max(80);
export const destinationRecordSchema = z.object({ id: cityIdSchema, name: z.string().min(1).max(120), countryCode: z.string().regex(/^[A-Z]{2}$/), timeZone: z.string().max(80).nullable() }).strict();
export type FccDestinationRecord = z.infer<typeof destinationRecordSchema>;
const articleSchema = z.object({ id, title: z.string().min(1).max(500), canonicalUrl: sourceUrl, body: z.string().max(200000), publishedAt: date.optional(), updatedAt: date.optional() }).strict();
const placeSchema = z.object({ id, name: z.string().min(1).max(500), canonicalUrl: sourceUrl, lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() }).strict();
const almanacSchema = z.object({ id, label: z.string().min(1).max(500), value: z.union([z.string().max(5000), z.number().finite()]), observedAt: date.optional(), unit: z.string().max(120).optional(), currency: z.string().max(12).optional(), fxDate: date.optional(), comparabilityNote: z.string().max(2000).optional() }).strict();
export const fccCityFeedSchema = z.object({
  schema: z.literal('fcc.city.feed'), version: z.literal(1), city: destinationRecordSchema.extend({ countryCode: z.string().regex(/^[A-Z]{2}$/).nullable() }), sourceVersion: z.string().min(1).max(200),
  articles: z.array(articleSchema).max(200), places: z.array(placeSchema).max(2000), almanac: z.array(almanacSchema).max(500),
}).strict().refine(feed => new Set(feed.articles.map(a => a.id)).size === feed.articles.length && new Set(feed.places.map(p => p.id)).size === feed.places.length, 'Source IDs must be unique within a city');
export type FccCityFeed = z.infer<typeof fccCityFeedSchema>;
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const citationUrl = z.string().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Almanac citations need public HTTPS URLs');
// Positions are the publisher's contract; fashion uses a different five-position tuple.
const priceObservation = z.tuple([z.number().finite().nonnegative().nullable(), z.string().max(1000).nullable(), citationUrl.nullable(), localDate.or(z.literal('')).nullable(), z.string().max(5000).nullable(), z.union([z.boolean(), z.literal(0), z.literal(1)])]);
const fashionObservation = z.tuple([z.number().finite().nonnegative().nullable(), z.string().max(12), z.number().finite().nonnegative().nullable(), citationUrl.nullable(), z.string().max(5000).nullable()]);
const labelPairs = z.array(z.tuple([id, z.string().min(1).max(500)])).max(500);
const almanacCitySchema = z.object({
  s: cityIdSchema, n: z.string().min(1).max(200), c: z.string().min(1).max(200), cur: z.string().regex(/^[A-Z]{3}$/), r: z.number().finite().nonnegative(),
  fx: localDate.or(z.literal('')).nullable(), st: z.string().max(20).optional(), ll: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]).optional(),
  pal: z.array(z.string().max(80)).max(32).optional(), scene: z.object({ src: z.string().max(2000), width: z.number().positive(), height: z.number().positive() }).strict().nullable().optional(),
  it: z.record(z.string(), priceObservation.nullable()), co: z.record(z.string(), priceObservation.nullable()), me: z.record(z.string(), priceObservation.nullable()),
  fu: priceObservation.nullable(), fa: z.record(z.string(), fashionObservation.nullable()), market: z.string().max(200).optional(),
  asOf: localDate.nullable().optional(), sourceNote: z.string().max(5000).optional(), fxNote: z.string().max(5000).optional(),
}).strict();
const economicReading = z.object({ value: z.number().finite(), year: z.number().int(), source: citationUrl, basis: z.string().max(2000).optional() }).strict();
export const fccAlmanacSnapshotSchema = z.object({
  schema: z.literal('fcc.almanac.city/1'), asOf: localDate.nullable(), slug: cityIdSchema, status: z.enum(['available', 'unavailable']),
  page: z.string().regex(/^\/[a-z0-9-]+\.html\?section=almanac$/).nullable(), city: almanacCitySchema.nullable(),
  labels: z.object({ it: labelPairs, co: labelPairs, me: labelPairs, fa: labelPairs }).strict(), market: z.string().max(200).nullable(),
  economy: z.object({
    gdp: economicReading.nullable().optional(), inflation: economicReading.nullable().optional(),
    currency: z.object({ code: z.string().regex(/^[A-Z]{3}$/), change: z.number().finite(), startRate: z.number().positive(), endRate: z.number().positive(), startDate: localDate, endDate: localDate, source: citationUrl, method: z.string().max(2000) }).strict().nullable().optional(),
  }).strict(),
}).strict().refine(value => value.status === 'available' ? value.city?.s === value.slug : value.city === null, 'Almanac city and availability must match');
export type FccAlmanacSnapshot = z.infer<typeof fccAlmanacSnapshotSchema>;
export interface FccSourceRef {
  id: string; url: string; provider: 'fcc'; sourceId: string; canonicalUrl: string; cityId: string; countryCode?: string;
  kind: 'article' | 'venue'; publishedAt?: string; updatedAt?: string; retrievedAt: string; version: string; contentHash?: string; origin: 'editorial' | 'catalogue';
}
export interface CityArticle { id: string; cityId: string; title: string; body: string; source: FccSourceRef; }
export interface CityPlace { id: string; city: string; name: string; lat?: number; lng?: number; provenance: 'fcc'; retrievedAt: string; fixture: false; source: FccSourceRef; }
export interface FccCityContent { city: FccCityFeed['city']; articles: CityArticle[]; places: CityPlace[]; almanac: FccCityFeed['almanac']; }
export interface FccError { code: 'invalid_url' | 'invalid_feed' | 'network' | 'http' | 'not_found' | 'offline' | 'cancelled'; message: string; httpStatus?: number; }
export type FccResult<T> = { status: 'ready' | 'cached' | 'stale'; value: T; retrievedAt: string; sourceVersion: string; error?: FccError } | { status: 'unavailable'; reason: string; error: FccError };
export interface CachedCity { feed?: FccCityFeed; almanac?: FccAlmanacSnapshot; retrievedAt: string; etag?: string; }
type CachedFeed = CachedCity & { feed: FccCityFeed };
export interface CityContentCache { read(cityId: string): Promise<CachedCity | undefined>; write(cityId: string, value: CachedCity): Promise<void>; }
/** Default is tab-local; the browser injects durable storage through this same interface. */
export class MemoryCityCache implements CityContentCache {
  private readonly cities = new Map<string, CachedCity>();
  async read(cityId: string): Promise<CachedCity | undefined> { const entry = this.cities.get(cityId); return entry && structuredClone(entry); }
  async write(cityId: string, entry: CachedCity): Promise<void> { this.cities.set(cityId, structuredClone(entry)); }
}
export interface FccDiagnostic { operation: 'fcc-city-fetch' | 'fcc-almanac-fetch'; sourceUrl?: string; errorClass: FccError['code']; httpStatus?: number; }
export interface FccAdapterOptions {
  feedUrl: (cityId: string) => string; fetcher?: typeof fetch; cache?: CityContentCache; now?: () => Date; maxRetries?: number; timeoutMs?: number;
  destinations?: readonly FccDestinationRecord[]; onDiagnostic?: (diagnostic: FccDiagnostic) => void;
}
export interface CityFetchOptions { signal?: AbortSignal; offline?: boolean; }
const err = (code: FccError['code'], message: string, httpStatus?: number): FccError => ({ code, message, ...(httpStatus === undefined ? {} : { httpStatus }) });
const unavailable = <T>(error: FccError): FccResult<T> => ({ status: 'unavailable', reason: error.message, error });
const compositeId = (city: string, sourceId: string) => sourceId.startsWith(`fcc:${city}:`) ? sourceId : `fcc:${city}:${sourceId}`;
async function normalize(entry: CachedFeed): Promise<FccCityContent> {
  const { feed, retrievedAt } = entry;
  const source = (raw: FccCityFeed['articles'][number] | FccCityFeed['places'][number], kind: 'article' | 'venue'): FccSourceRef => ({
    id: compositeId(feed.city.id, raw.id), url: raw.canonicalUrl, provider: 'fcc', sourceId: raw.id, canonicalUrl: raw.canonicalUrl,
    cityId: feed.city.id, ...(feed.city.countryCode ? { countryCode: feed.city.countryCode } : {}), kind, retrievedAt, version: feed.sourceVersion, origin: kind === 'article' ? 'editorial' : 'catalogue',
    ...('publishedAt' in raw && raw.publishedAt ? { publishedAt: raw.publishedAt } : {}), ...('updatedAt' in raw && raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
  });
  const articles = await Promise.all(feed.articles.map(async article => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(article.body));
    const contentHash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
    return { id: compositeId(feed.city.id, article.id), cityId: feed.city.id, title: recoverFccTitle(article.title), body: article.body, source: { ...source(article, 'article'), contentHash } };
  }));
  return { city: { ...feed.city }, articles, places: feed.places.map(place => ({ id: compositeId(feed.city.id, place.id), city: feed.city.id, name: place.name, lat: place.lat, lng: place.lng, provenance: 'fcc', retrievedAt, fixture: false, source: source(place, 'venue') })), almanac: structuredClone(feed.almanac) };
}

export function createFccAdapter(options: FccAdapterOptions) {
  const fetcher = options.fetcher ?? fetch, cache = options.cache ?? new MemoryCityCache(), now = options.now ?? (() => new Date());
  const retries = Math.max(0, Math.min(2, Math.floor(options.maxRetries ?? 1)));
  async function readCached(cityId: string): Promise<CachedFeed | undefined> {
    try {
      const entry = await cache.read(cityId);
      if (!entry || !entry.retrievedAt) return;
      const feed = fccCityFeedSchema.parse(entry.feed);
      return feed.city.id === cityId ? { ...entry, feed } : undefined;
    } catch { return undefined; }
  }
  async function result(entry: CachedFeed, status: 'ready' | 'cached' | 'stale', error?: FccError): Promise<FccResult<FccCityContent>> {
    return { status, value: await normalize(entry), retrievedAt: entry.retrievedAt, sourceVersion: entry.feed.sourceVersion, ...(error ? { error } : {}) };
  }
  async function getCity(cityId: string, request: CityFetchOptions = {}): Promise<FccResult<FccCityContent>> {
    if (!cityIdSchema.safeParse(cityId).success) return unavailable(err('invalid_feed', 'Choose a valid FCC city ID.'));
    if (request.signal?.aborted) return unavailable(err('cancelled', 'FCC loading was cancelled.'));
    const previous = await readCached(cityId);
    if (request.offline) return previous ? result(previous, 'cached') : unavailable(err('offline', 'No cached FCC issue is available for this city.'));
    let url: string;
    try { url = options.feedUrl(cityId); } catch { return unavailable(err('invalid_url', 'An FCC feed URL has not been configured.')); }
    if (!isPublicFccUrl(url)) return unavailable(err('invalid_url', 'The configured source must be a public FCC HTTPS URL.'));
    let failure = err('network', 'FCC could not be reached. Retry or use the dated cache.');
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetcher(url, { signal: request.signal, credentials: 'omit', redirect: 'error', headers: previous?.etag ? { 'If-None-Match': previous.etag } : {} });
        if (request.signal?.aborted) { failure = err('cancelled', 'FCC loading was cancelled.'); break; }
        if (response.status === 304 && previous) return result(previous, 'cached');
        if (!response.ok) {
          failure = err(response.status === 404 ? 'not_found' : 'http', response.status === 404 ? 'This FCC city feed is not published. Your trip remains available.' : 'FCC returned an error. Retry or use the dated cache.', response.status);
          if (response.status >= 500 && attempt < retries) continue;
          break;
        }
        let raw: unknown;
        try { raw = await response.json(); } catch { failure = err('invalid_feed', 'FCC returned an unreadable city feed. The previous issue was kept.'); break; }
        const parsed = fccCityFeedSchema.safeParse(raw);
        if (!parsed.success || parsed.data.city.id !== cityId) { failure = err('invalid_feed', 'FCC returned an invalid or different-city feed. The previous issue was kept.'); break; }
        if (request.signal?.aborted) { failure = err('cancelled', 'FCC loading was cancelled.'); break; }
        const entry: CachedFeed = { feed: parsed.data, retrievedAt: now().toISOString(), ...(response.headers.get('ETag') ? { etag: response.headers.get('ETag')! } : {}) };
        // Usable fetched content does not imply caching succeeded; never clear existing content to make space.
        try { await cache.write(cityId, entry); } catch { /* Existing board and cached issue remain untouched. */ }
        return result(entry, 'ready');
      } catch {
        failure = request.signal?.aborted ? err('cancelled', 'FCC loading was cancelled.') : err('network', 'FCC could not be reached. Retry or use the dated cache.');
        if (failure.code === 'cancelled') break;
      }
    }
    options.onDiagnostic?.({ operation: 'fcc-city-fetch', sourceUrl: url, errorClass: failure.code, ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }) });
    if (failure.code === 'cancelled') return unavailable(failure);
    return previous ? result(previous, 'stale', failure) : unavailable(failure);
  }
  const project = async <T>(cityId: string, select: (content: FccCityContent) => T, request?: CityFetchOptions): Promise<FccResult<T>> => {
    const city = await getCity(cityId, request);
    return city.status === 'unavailable' ? city : { ...city, value: select(city.value) };
  };
  async function getAlmanac(cityId: string, request: CityFetchOptions = {}): Promise<FccResult<FccAlmanacSnapshot>> {
    if (!cityIdSchema.safeParse(cityId).success) return unavailable(err('invalid_feed', 'Choose a valid FCC city ID.'));
    if (request.signal?.aborted) return unavailable(err('cancelled', 'Almanac loading was cancelled.'));
    // Separate keys reuse the injected public-content store without clobbering an issue snapshot.
    const cacheKey = `almanac:${cityId}`, url = `${FCC_ORIGIN}/almanac/city/${cityId}.json`;
    let previous: (CachedCity & { almanac: FccAlmanacSnapshot }) | undefined;
    try {
      const stored = await cache.read(cacheKey), parsed = fccAlmanacSnapshotSchema.safeParse(stored?.almanac);
      if (stored?.retrievedAt && parsed.success && parsed.data.slug === cityId) previous = { ...stored, almanac: parsed.data };
    } catch { /* An unreadable cache is unavailable; it never becomes trusted source data. */ }
    async function almanacResult(entry: CachedCity & { almanac: FccAlmanacSnapshot }, status: 'ready' | 'cached' | 'stale', error?: FccError): Promise<FccResult<FccAlmanacSnapshot>> {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(entry.almanac)));
      const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      return { status, value: structuredClone(entry.almanac), retrievedAt: entry.retrievedAt, sourceVersion: `sha256:${hash}`, ...(error ? { error } : {}) };
    }
    if (request.offline) return previous ? almanacResult(previous, 'cached') : unavailable(err('offline', 'No cached Almanac snapshot is available for this city.'));
    const controller = new AbortController(), cancel = () => controller.abort();
    request.signal?.addEventListener('abort', cancel, { once: true });
    if (request.signal?.aborted) cancel();
    let timedOut = false, failure = err('network', 'The Almanac could not be reached. Retry or use the dated cache.');
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(options.timeoutMs ?? 10000, 30000)));
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', headers: previous?.etag ? { 'If-None-Match': previous.etag } : {} });
          if (controller.signal.aborted) break;
          if (response.status === 304 && previous) return almanacResult(previous, 'cached');
          if (!response.ok) {
            failure = err(response.status === 404 ? 'not_found' : 'http', response.status === 404 ? 'This Almanac publication is unavailable. Your trip remains available.' : 'FCC returned an Almanac error. Retry or use the dated cache.', response.status);
            if (response.status >= 500 && attempt < retries) continue;
            break;
          }
          let raw: unknown;
          try { raw = await response.json(); } catch { failure = err('invalid_feed', 'The Almanac response is unreadable. The previous snapshot was kept.'); break; }
          const parsed = fccAlmanacSnapshotSchema.safeParse(raw);
          if (!parsed.success || parsed.data.slug !== cityId) { failure = err('invalid_feed', 'FCC returned an invalid or different-city Almanac snapshot. The previous snapshot was kept.'); break; }
          if (controller.signal.aborted) break;
          const entry = { almanac: parsed.data, retrievedAt: now().toISOString(), ...(response.headers.get('ETag') ? { etag: response.headers.get('ETag')! } : {}) };
          try { await cache.write(cacheKey, entry); } catch { /* Fetched data stays usable without claiming it was cached. */ }
          return almanacResult(entry, 'ready');
        } catch {
          failure = err('network', 'The Almanac could not be reached. Retry or use the dated cache.');
          if (controller.signal.aborted) break;
        }
      }
    } finally { clearTimeout(timer); request.signal?.removeEventListener('abort', cancel); }
    if (request.signal?.aborted) return unavailable(err('cancelled', 'Almanac loading was cancelled.'));
    if (timedOut) failure = err('network', 'Almanac loading timed out. Retry or use the dated cache.');
    options.onDiagnostic?.({ operation: 'fcc-almanac-fetch', sourceUrl: url, errorClass: failure.code, ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }) });
    return previous ? almanacResult(previous, 'stale', failure) : unavailable(failure);
  }
  return {
    getCity,
    listDestinations: () => (options.destinations ?? []).map(destination => destinationRecordSchema.parse(destination)),
    getCityArticles: (cityId: string, request?: CityFetchOptions) => project(cityId, content => content.articles, request),
    getCityPlaces: (cityId: string, request?: CityFetchOptions) => project(cityId, content => content.places, request),
    getAlmanac,
  };
}
export type FccAdapter = ReturnType<typeof createFccAdapter>;

export type CityResult = { status: 'ok'; places: CityPlace[]; fixture: false; label: string } | { status: 'unavailable'; reason: string };
/** Legacy synchronous gateway reads only an explicitly supplied validated snapshot, never fixture data. */
export function catalogSearch(city: string, query = '', content?: FccCityContent): CityResult {
  if (!content || content.city.id !== city.toLowerCase()) return { status: 'unavailable', reason: `FCC content for ${city} is unavailable until its published feed is loaded.` };
  const q = query.trim().toLowerCase();
  return { status: 'ok', places: content.places.filter(place => !q || place.name.toLowerCase().includes(q)), fixture: false, label: 'FCC source snapshot; opening hours and prices are not independently verified' };
}
export function routeEstimate(): { status: 'unavailable'; reason: string } {
  return { status: 'unavailable', reason: 'Route estimates are unavailable: no verified routing provider is connected.' };
}
