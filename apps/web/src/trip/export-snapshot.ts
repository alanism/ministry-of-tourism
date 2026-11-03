// MOT-146: one resolved set of city art and FCC tee photos per city, shared by preview, HTML and PDF.
import { loadCityApparel, TRIP_PACKAGE_LIMITS, type ApparelArtRef, type TripMeta } from '@writers-board/core';
import { catalogSchema, manifestSchema, readCatalog, type Artwork, type Manifest } from '../artwork/catalog';
import { artifactSha256 } from './artifact-store';
import fontCoverage from './standalone-fonts.json';

export interface ExportArtCredit { assetId:string; label:string; credit:string; rightsStatus:string; sourceUrl?:string; kind:string; }
export interface ExportArtGap { assetId?:string; label:string; slot:string; reason:string; }
export interface CityArtSnapshot {
  cityId:string;
  /** Raw ArtRefs for buildMagazine's artwork option, already in deterministic slot order. */
  art:Record<string,unknown>[];
  tees:ApparelArtRef[];
  blobs:ReadonlyMap<string,Blob>;
  dimensions:ReadonlyMap<string,{width:number;height:number}>;
  credits:ExportArtCredit[];
  gaps:ExportArtGap[];
}

const MANIFEST = '/artwork/fcc/manifest.json';
interface ArtSlot { subject:string; role:string; count:number; prefer?:RegExp; only?:boolean; }
/** Magazine slots that city art fills when the trip has nothing of its own for them, in pick order.
 * Catalogue art without a role is matched by label so the route, plate and letters spreads are not left blank. */
const ART_SLOTS: readonly ArtSlot[] = [
  { subject:'city-ink', role:'city-ink', count:1 },
  { subject:'city-illustrations', role:'backdrop', count:1 },
  { subject:'city-illustrations', role:'foreground', count:1 },
  { subject:'stickers', role:'tag', count:1 },
  { subject:'portraits', role:'portrait', count:2 },
  { subject:'objects', role:'vehicle', count:1, prefer:/tuk|boat|ferry|tram|train|bus|taxi|cyclo|scooter|vespa|bike|bicycle|car|plane|rickshaw|gondola|cable|jeep|moto/i, only:true },
  { subject:'restaurants', role:'facade', count:1, prefer:/facade|exterior|storefront|shopfront/i, only:true },
  { subject:'restaurants', role:'interior', count:1, prefer:/interior|atmosphere|inside|dining room/i, only:true },
  { subject:'hotels', role:'interior', count:1, prefer:/lobby|interior|lounge|reception/i, only:true },
  { subject:'objects', role:'specimen', count:2 },
  { subject:'people', role:'vignette', count:2, prefer:/family|kid|child|mother|mom|parent|picnic|couple|friends|cafe|beach|stroll|shopping/i },
  { subject:'activities', role:'postcard', count:1, prefer:/cruise|canal|boat|river|market|garden|park|beach|tour|family|picnic/i },
  { subject:'objects', role:'stamp', count:1 },
];
const TEE_COUNT = 3;

const FACES = Object.values(fontCoverage.fonts as Record<string,{ ranges:number[][] }>);
/** Standalone HTML refuses text its embedded fonts cannot draw, so city art whose label or credit needs another glyph is skipped. */
const drawable = (text:string) => [...text].every(character => { const point = character.codePointAt(0)!; return FACES.every(face => face.ranges.some(([start, end]) => point >= start! && point <= end!)); });

export const tripCityId = (meta:Pick<TripMeta,'cityId'|'city'>) => meta.cityId ?? meta.city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchBlob(url:string, fetcher:typeof fetch, signal:AbortSignal):Promise<Blob> {
  const response = await fetcher(url, { signal, credentials:'omit', redirect:'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > TRIP_PACKAGE_LIMITS.fileBytes) throw new Error('exceeds the portable image limit');
  const blob = await response.blob();
  if (!blob.size || blob.size > TRIP_PACKAGE_LIMITS.fileBytes) throw new Error('not a usable image');
  return blob;
}
/** Decodes for dimensions only; a bitmap that settles after Cancel is closed exactly once. */
function decodedSize(blob:Blob, signal:AbortSignal):Promise<{width:number;height:number}> {
  return new Promise((ok, fail) => {
    const stop = () => fail(signal.reason ?? new DOMException('Export cancelled', 'AbortError'));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once:true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return createImageBitmap(blob); }).then(
      image => { signal.removeEventListener('abort', stop); const size = { width:image.width, height:image.height }; image.close(); if (signal.aborted) stop(); else ok(size); },
      error => { signal.removeEventListener('abort', stop); fail(error); },
    );
  });
}

async function resolve(cityId:string, fetcher:typeof fetch, signal:AbortSignal):Promise<CityArtSnapshot> {
  const blobs = new Map<string,Blob>(), dimensions = new Map<string,{width:number;height:number}>();
  const art:Record<string,unknown>[] = [], credits:ExportArtCredit[] = [], gaps:ExportArtGap[] = [], tees:ApparelArtRef[] = [];

  // City art: catalogue items with a full ArtRef (kind, role, credit, rights) only; first by stable ID, never random.
  let manifest:Manifest | undefined;
  try { manifest = await readCatalog(MANIFEST, manifestSchema, signal, fetcher, { cache:true }); }
  catch { gaps.push({ label:'FCC city art', slot:'all art slots', reason:'the artwork manifest could not be loaded' }); }
  const bySubject = new Map<string,Artwork[]>();
  for (const { subject } of ART_SLOTS) {
    if (!manifest || bySubject.has(subject)) continue;
    const entry = manifest.catalogs.find(c => c.subject === subject && c.city === cityId);
    if (!entry) { bySubject.set(subject, []); continue; }
    try { bySubject.set(subject, (await readCatalog(entry.url, catalogSchema, signal, fetcher, { cache:true })).items.filter(a => a.artRef && a.artRef.kind !== 'apparel-mockup').sort((a, b) => a.id.localeCompare(b.id))); }
    catch { bySubject.set(subject, []); gaps.push({ label:`${cityId} ${subject}`, slot:subject, reason:'the city catalogue could not be loaded' }); }
  }
  // Plan every pick first (deterministic), then fetch in parallel; a failed image leaves its slot empty rather than shifting picks.
  const plan:{ item:Artwork; role:string }[] = [], picked = new Set<string>();
  for (const slot of manifest ? ART_SLOTS : []) {
    const have = plan.filter(p => p.role === slot.role).length;
    if (have >= slot.count) continue;
    let pool = (bySubject.get(slot.subject) ?? []).filter(a => !picked.has(a.id) && (a.artRef!.role ? a.artRef!.role === slot.role : true) && drawable(a.artRef!.label ?? a.label) && drawable(a.artRef!.credit ?? ''));
    if (slot.prefer) { const hit = pool.filter(a => slot.prefer!.test(a.label)); pool = slot.only ? hit : [...hit, ...pool.filter(a => !hit.includes(a))]; }
    if (!pool.length) { gaps.push({ label:`${cityId} ${slot.role}`, slot:slot.role, reason:'FCC has no credited art for this slot' }); continue; }
    for (const item of pool.slice(0, slot.count - have)) { picked.add(item.id); plan.push({ item, role:slot.role }); }
  }
  const loaded = await Promise.allSettled(plan.map(async ({ item }) => {
    const blob = await fetchBlob(item.src, fetcher, signal);
    if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error('not a supported still image');
    return { blob, ...await decodedSize(blob, signal) };
  }));
  signal.throwIfAborted();
  plan.forEach(({ item, role }, index) => {
    const ref = item.artRef!, result = loaded[index]!;
    if (result.status === 'rejected') { gaps.push({ assetId:item.id, label:ref.label ?? item.label, slot:role, reason:`image unavailable (${result.reason instanceof Error ? result.reason.message : 'load failed'})` }); return; }
    const image = result.value;
    blobs.set(item.id, image.blob); dimensions.set(item.id, { width:image.width, height:image.height });
    art.push({ ...ref, label:ref.label ?? item.label, width:image.width, height:image.height, mimeType:image.blob.type, role });
    credits.push({ assetId:item.id, label:ref.label ?? item.label, credit:ref.credit ?? 'unknown', rightsStatus:ref.rightsStatus ?? 'unknown', sourceUrl:ref.source?.canonicalUrl, kind:ref.kind });
  });

  // FCC tee-on-model photography: same checks as the former preview-only path, now shared by every export.
  try {
    const fresh = await loadCityApparel(cityId, { fetcher, signal });
    const variants = fresh.some(a => a.role) ? fresh.filter(a => a.role) : fresh;
    // Only the first three variants are candidates; a failed one is dropped, never replaced by a fourth style.
    for (const tee of variants.slice(0, TEE_COUNT)) {
      try {
        if (!drawable(tee.label ?? '') || !drawable(tee.credit ?? '')) throw new Error('its label needs a glyph the HTML fonts lack');
        signal.throwIfAborted();
        const blob = await fetchBlob(tee.originalUrl ?? tee.renditionUrl, fetcher, signal);
        if (blob.type !== tee.mimeType) throw new Error('does not match its declared raster');
        const hash = await artifactSha256(blob);
        if ((tee.hash && tee.hash !== hash) || (tee.source.contentHash && tee.source.contentHash !== hash)) throw new Error('original changed');
        signal.throwIfAborted();
        const size = await decodedSize(blob, signal);
        if (size.width !== tee.width || size.height !== tee.height) throw new Error('dimensions changed');
        blobs.set(tee.assetId, blob); dimensions.set(tee.assetId, { width:tee.width, height:tee.height }); tees.push(tee);
        credits.push({ assetId:tee.assetId, label:tee.label ?? 'FCC tee', credit:tee.credit ?? 'unknown', rightsStatus:tee.rightsStatus, sourceUrl:tee.source.canonicalUrl, kind:'apparel-mockup' });
      } catch (error) { if (signal.aborted) throw error; gaps.push({ assetId:tee.assetId, label:tee.label ?? 'FCC tee', slot:'tee', reason:`photo unavailable (${error instanceof Error ? error.message : 'load failed'})` }); }
    }
  } catch (error) { if (signal.aborted) throw error; gaps.push({ label:'FCC tee photos', slot:'tee', reason:'FCC apparel is unavailable' }); }

  return { cityId, art, tees, blobs, dimensions, credits, gaps };
}

let caches = new WeakMap<typeof fetch,Map<string,Promise<CityArtSnapshot>>>();
/** Resolved once per city and reused, so preview, HTML and PDF never pick independently.
 * The first caller's Cancel stops the lookup; another waiting caller starts it again with its own signal. */
export function cityArtSnapshot(cityId:string, options:{ signal?:AbortSignal; fetcher?:typeof fetch } = {}):Promise<CityArtSnapshot> {
  const signal = options.signal ?? new AbortController().signal, fetcher = options.fetcher ?? fetch;
  let cache = caches.get(fetcher); if (!cache) caches.set(fetcher, cache = new Map());
  const start = () => { const pending = resolve(cityId, fetcher, signal); cache!.set(cityId, pending); pending.catch(() => { if (cache!.get(cityId) === pending) cache!.delete(cityId); }); return pending; };
  const existing = cache.get(cityId);
  if (!existing) return start();
  return existing.catch(error => { if (signal.aborted) throw error; const now = cache!.get(cityId); return now && now !== existing ? now : start(); });
}
export const resetCityArtSnapshots = () => { caches = new WeakMap(); };

export function snapshotWarnings(snapshot:CityArtSnapshot):string[] {
  const tees = snapshot.gaps.filter(g => g.slot === 'tee' && g.assetId).length, art = snapshot.gaps.filter(g => g.slot !== 'tee' && !g.reason.startsWith('FCC has no'));
  return [
    ...(tees ? [`${tees} FCC tee photo${tees === 1 ? ' is' : 's are'} unavailable; the remaining trip pages are kept.`] : []),
    ...snapshot.gaps.filter(g => g.slot === 'tee' && !g.assetId).map(() => 'FCC tee pages are unavailable; your trip pages are kept.'),
    ...(art.length ? [`City art left empty: ${art.map(g => `${g.label} (${g.reason})`).join('; ')}.`] : []),
  ];
}
