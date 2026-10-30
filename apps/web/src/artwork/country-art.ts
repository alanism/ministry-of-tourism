import {decorativeArtwork} from './art-preview';
import {z} from 'zod';
import { artworkSchema,catalogSchema, readCatalog, type Artwork, type Manifest } from './catalog';

export interface ArtDestination { id: string; name: string; countryCode: string; timeZone: string | null; aliases?: readonly string[]; }
export interface ArtScope {
  state: 'cityavailable' | 'countryavailable' | 'categorygap' | 'cityabsent' | 'countryunknown' | 'countryempty' | 'indexunavailable';
  catalogs: Manifest['catalogs']; catalogPaths: string[]; originCities: Record<string, string>; countryCode?: string; message: string;
}
export interface ArtScopeOptions { cityId?: string; countryCode?: string; category: string; mode: 'city' | 'country'; destinations: readonly ArtDestination[]; manifest: Manifest; }

/** A catalog's geography comes only from an explicit city-country registry, never its label or image. */
export function resolveArtScope({ cityId, countryCode, category, mode, destinations, manifest }: ArtScopeOptions): ArtScope {
  const cityExists = !!cityId && manifest.cities.some(city => city.id === cityId);
  const categoryMatches=(subject:string)=>subject!=='apparel'&&(category==='all'||subject===category);
  const exact = manifest.catalogs.filter(ref => ref.city === cityId && categoryMatches(ref.subject) && ref.count > 0);
  const result = (state: ArtScope['state'], catalogs: Manifest['catalogs'], message: string): ArtScope => ({
    state, catalogs: catalogs.map(ref => ({ ...ref })), catalogPaths: catalogs.map(ref => ref.url), countryCode, message,
    originCities: Object.fromEntries(catalogs.map(ref => [ref.city!, destinations.find(city => city.id === ref.city)?.name ?? manifest.cities.find(city => city.id === ref.city)?.label ?? ref.city!])),
  });
  if (mode === 'city' && cityExists && exact.length) return result('cityavailable', exact, 'Exact-city artwork. Browse this country for additional decorative art.');
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return result('countryunknown', [], 'Choose the trip country to browse its artwork.');
  const ids = new Map<string, ArtDestination>();
  for (const city of destinations) {
    const prior = ids.get(city.id);
    if (!city.id || !city.name || !/^[A-Z]{2}$/.test(city.countryCode) || prior && (prior.countryCode !== city.countryCode || prior.name !== city.name)) {
      return result('indexunavailable', [], 'Country artwork is unavailable because destination country information could not be matched. Exact-city art and normal image uploads remain available.');
    }
    ids.set(city.id, city);
  }
  if (!ids.size) return result('indexunavailable', [], 'Country artwork is unavailable until destination country information is loaded. Exact-city art and normal image uploads remain available.');
  const countryCatalogs = manifest.catalogs.filter(ref => categoryMatches(ref.subject) && ref.count > 0 && !!ref.city && ids.get(ref.city)?.countryCode === countryCode);
  if (mode === 'country') return countryCatalogs.length
    ? result('countryavailable', countryCatalogs, `Artwork from ${countryCode}; every result keeps its original city.`)
    : result('countryempty', [], 'No artwork in this category is available for the selected country. Normal image uploads remain available.');
  return cityExists
    ? result('categorygap', countryCatalogs, countryCatalogs.length ? 'This city has no artwork in the selected category. Browse the same category across the country.' : 'This category is empty for the city and country. Other city categories and normal image uploads remain available.')
    : result('cityabsent', countryCatalogs, countryCatalogs.length ? 'This city has no artwork collection. Browse decorative art from the selected country; the trip destination stays unchanged.' : 'This city has no artwork collection, and the country has no results in this category. Normal image uploads remain available.');
}

export interface CountryArtItem { artwork: Artwork; originCityId: string; originCityName: string; }
export interface CachedCountryArt { items: CountryArtItem[]; retrievedAt: string; }
export type CountryArtCache = Map<string, CachedCountryArt>;
interface ArtCacheStorage{getItem(key:string):string|null;setItem(key:string,value:string):void;}
const CACHE_KEY='mot-public-art-cache-v1',CACHE_BYTES=2*1024*1024;
const savedCache=z.array(z.tuple([z.string().max(30000),z.object({retrievedAt:z.iso.datetime(),items:z.array(z.object({artwork:artworkSchema,originCityId:z.string().min(1).max(160),originCityName:z.string().min(1).max(160)}).strict()).max(6000)}).strict()])).max(12);
function browserStorage():ArtCacheStorage|undefined{try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
export function restoreCountryArtCache(storage:ArtCacheStorage|undefined=browserStorage()):CountryArtCache{
  try{const raw=storage?.getItem(CACHE_KEY);return raw&&raw.length<=CACHE_BYTES?new Map(savedCache.parse(JSON.parse(raw))):new Map();}catch{return new Map();}
}
export function persistCountryArtCache(cache:CountryArtCache,storage:ArtCacheStorage|undefined=browserStorage()):boolean{
  if(!storage)return false;
  try{const entries=[...cache].sort((a,b)=>b[1].retrievedAt.localeCompare(a[1].retrievedAt)).slice(0,12);let raw=JSON.stringify(entries);while(raw.length>CACHE_BYTES&&entries.length>1){entries.pop();raw=JSON.stringify(entries);}if(raw.length>CACHE_BYTES)return false;storage.setItem(CACHE_KEY,raw);return true;}catch{return false;}
}
export interface CountryArtLoad { status: 'ready' | 'cached' | 'unavailable' | 'cancelled'; items: CountryArtItem[]; retrievedAt?: string; error?: string; }
export interface CountryArtLoadOptions { scope: ArtScope; manifest: Manifest; subject: string; signal: AbortSignal; fetcher?: typeof fetch; cache?: CountryArtCache; now?: () => Date; timeoutMs?: number; offline?: boolean; }

/** Load only this country's selected category. A failed batch never replaces a complete cached batch. */
export async function loadCountryArtwork({ scope, manifest, subject, signal, fetcher = fetch, cache = new Map(), now = () => new Date(), timeoutMs = 20000, offline = false }: CountryArtLoadOptions): Promise<CountryArtLoad> {
  const key = JSON.stringify([manifest.styleId, subject, scope.countryCode, scope.catalogPaths]);
  const cached = cache.get(key);
  const previous = cached&&cached.items.every(item=>item.artwork.city===item.originCityId&&!!scope.originCities[item.originCityId]
    &&scope.catalogs.some(ref=>ref.city===item.originCityId&&ref.subject===item.artwork.subject)
    &&(subject==='all'||item.artwork.subject===subject)&&decorativeArtwork(item.artwork)
    &&(!scope.countryCode||!item.artwork.artRef||item.artwork.artRef.countryCode===scope.countryCode))?cached:undefined;
  const prior = () => previous ? structuredClone(previous) : { items: [] };
  if (signal.aborted) return { status: 'cancelled', ...prior() };
  if (offline) return previous ? { status: 'cached', ...prior() } : { status: 'unavailable', items: [], error: 'You are offline and no cached country results are available. Retry when connected.' };
  if (!scope.catalogs.length) return { status: 'ready', items: [] };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false, failed = false, next = 0;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(timeoutMs, 30000)));
  const batches: CountryArtItem[][] = new Array(scope.catalogs.length);
  async function worker() {
    while (!controller.signal.aborted && !failed && next < scope.catalogs.length) {
      const index = next++, ref = scope.catalogs[index]!;
      try {
        if (!/^\/artwork\/[a-zA-Z0-9/_-]+\.json$/.test(ref.url) || !ref.city || !scope.originCities[ref.city]
          || ref.subject==='apparel'||(subject!=='all'&&ref.subject !== subject) || !manifest.catalogs.some(known => known.url === ref.url && known.city === ref.city && known.subject === ref.subject && known.count === ref.count)) throw new Error('Invalid country catalog reference');
        const catalog = await readCatalog(ref.url, catalogSchema, controller.signal, fetcher);
        if (catalog.styleId !== manifest.styleId || catalog.items.length !== ref.count || catalog.items.some(item => item.city !== ref.city || item.subject !== ref.subject||(scope.countryCode&&item.artRef&&item.artRef.countryCode!==scope.countryCode))) throw new Error('Country catalog identity does not match');
        batches[index] = catalog.items.filter(decorativeArtwork).map(artwork => ({ artwork, originCityId: ref.city!, originCityName: scope.originCities[ref.city!]! }));
      } catch { failed = true; controller.abort(); }
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(4, scope.catalogs.length) }, () => worker())); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  if (signal.aborted) return { status: 'cancelled', ...prior() };
  if (failed || timedOut || controller.signal.aborted) return {
    status: previous ? 'cached' : 'unavailable', ...prior(),
    error: timedOut ? 'FCC artwork loading timed out. Retry or use the dated cached results.' : 'FCC artwork could not be refreshed. Retry or use the dated cached results.',
  };
  const snapshot = { items: batches.flat(), retrievedAt: now().toISOString() };
  cache.set(key, structuredClone(snapshot));
  return { status: 'ready', ...snapshot };
}
