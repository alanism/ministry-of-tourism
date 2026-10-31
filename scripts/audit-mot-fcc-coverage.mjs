#!/usr/bin/env node
// MOT-121: deterministic, bounded, offline FCC -> MoT metadata coverage audit.
// Metadata only: never fetches URLs, reads image bytes, follows registry
// `local` paths, executes embedded content, or mutates its inputs.
import { createHash } from 'node:crypto';
import { lstat, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://foreignclubberscorespondence.web.app';
const CITY_PAGES = `${ORIGIN}/output/prototypes/city-pages/`;
const JOURNAL = `${CITY_PAGES}journal/`;
const LIMITS = {
  // Evidence-based bound for this new tool: the measured real snapshot's
  // largest city.json is 2,512,419 bytes (new-york) and ho-chi-minh-city is
  // 2,057,189 bytes, so city documents are bounded at 4 MiB. Total is 128 MiB.
  cityBytes: 4_194_304,
  registryBytes: 16_777_216,
  fileBytes: 16_777_216,
  totalBytes: 134_217_728,
  cities: 1_000,
  assets: 100_000,
  files: 100_000,
  collections: 10_000,
  stickers: 100_000,
  rows: 200_000,
  shards: 10_000,
  items: 200_000,
};
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeDisplay = (value) => { if (typeof value !== 'string') return value; if (value.startsWith('data:')) return `urn:mot-audit:inline:sha256:${sha256(Buffer.from(value))}:length:${value.length}`; if (value.length > 512) return `urn:mot-audit:locator:sha256:${sha256(Buffer.from(value))}:length:${value.length}`; return value; };
const safeText = (value) => { const text = String(value).replace(/data:[^\s'"]+/g, (m) => safeDisplay(m)); return text.length > 1024 ? `${text.slice(0, 512)} urn:mot-audit:inline:sha256:${sha256(Buffer.from(text))}:length:${text.length}` : text; };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v, name, max = LIMITS.items) => {
  if (!Array.isArray(v)) throw new Error(`malformed schema: ${name} must be an array`);
  if (v.length > max) throw new Error(`bounded limit exceeded: ${name} has too many entries`);
  return v;
};
const str = (v) => (typeof v === 'string' && v ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byStr = (a, b) => cmp(String(a), String(b));
const uniqSort = (values) => [...new Set(values.filter((v) => v !== undefined && v !== null && v !== ''))].sort(byStr);
const resolveUrl = (value, base) => {
  if (typeof value !== 'string' || !value) return undefined;
  try { return new URL(value, base).href; } catch { return value; }
};
const urlProtocol = (value) => { try { return new URL(value).protocol; } catch { return undefined; } };
const isHttps = (value) => urlProtocol(value) === 'https:';
// Raw source frames are [left, top, right, bottom] pixels. A normalized crop
// is produced only from explicit, valid, positive sheet dimensions and an
// in-bounds frame; anything else stays unresolved with the raw frame kept.
const frameCrop = (frame, width, height) => {
  if (!Array.isArray(frame) || frame.length !== 4 || !width || !height || width <= 0 || height <= 0) return undefined;
  const [l, t, r, b] = frame;
  if (![l, t, r, b].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  if (!(l >= 0 && t >= 0 && r > l && b > t && r <= width && b <= height)) return undefined;
  return [l / width, t / height, (r - l) / width, (b - t) / height];
};
const cropEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((v, i) => typeof v === 'number' && typeof b[i] === 'number' && Math.abs(v - b[i]) <= 1e-9);
const eligibility = (matched) => ({
  discover: matched ? 'catalog-present/needs-product-check' : 'not-in-mot-catalog',
  preview: matched ? 'catalog-present/needs-product-check' : 'not-in-mot-catalog',
  insert: matched ? 'catalog-present/needs-product-check' : 'not-in-mot-catalog',
  share: 'credited-share-permitted-under-current-policy; standalone permission not granted by this audit',
  embed: 'unresolved',
  shop: 'unverified',
});
const pickCredit = (rec) => str(rec?.credit) ?? str(rec?.creditLine) ?? str(rec?.source?.credit) ?? str(rec?.attribution);
const pickRights = (rec) => str(rec?.rightsStatus) ?? str(rec?.rights) ?? str(rec?.referencePermissions) ?? str(rec?.source?.rightsStatus);
const CATEGORY_ALIASES = {
  object: 'objects', objects: 'objects', scene: 'people', scenes: 'people', person: 'people', people: 'people',
  portrait: 'portraits', portraits: 'portraits', fashion: 'portraits', style: 'portraits',
  backdrop: 'city-illustrations', foreground: 'city-illustrations', 'city-illustration': 'city-illustrations', 'city-illustrations': 'city-illustrations',
  hotel: 'hotels', hotels: 'hotels', restaurant: 'restaurants', restaurants: 'restaurants', activity: 'activities', activities: 'activities',
  'fashion-men': 'portraits', 'brush-portrait': 'portraits', map: 'maps', maps: 'maps',
  tag: 'stickers', stamp: 'stickers', sticker: 'stickers', stickers: 'stickers', apparel: 'apparel', gallery: 'gallery', artwork: 'artwork', registry: 'registry',
};
const normCategory = (category, fallback = 'unresolved') => CATEGORY_ALIASES[String(category ?? '').toLowerCase()] ?? (str(category) ?? fallback);
function safeRel(rel, what = 'path') {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || rel.includes('\\') || rel.includes('\0')) {
    throw new Error(`unsafe ${what}: ${String(rel)}`);
  }
  const parts = rel.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) throw new Error(`unsafe traversal in ${what}: ${rel}`);
  return parts.join('/');
}
function localManifestPath(value, what) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || value.includes('\\') || value.includes('://') || value.split('/').includes('..')) {
    throw new Error(`unsafe nonlocal ${what}: ${String(value)}`);
  }
  return safeRel(value.slice(1), what);
}
const inside = (root, target) => {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

class Reader {
  constructor(fccRoot, motRoot) {
    this.roots = { fcc: fccRoot, mot: motRoot };
    this.inputs = new Map();
    this.cache = new Map();
    this.total = 0;
  }
  async bytes(kind, rel, max = LIMITS.fileBytes) {
    safeRel(rel);
    const key = `${kind}/${rel}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const root = this.roots[kind];
    const file = resolve(root, ...rel.split('/'));
    if (!inside(root, file)) throw new Error(`containment escape: ${kind}/${rel}`);
    let real;
    try { real = await realpath(file); } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`missing required input: ${kind}/${rel}`);
      throw e;
    }
    // Realpath-check every target, including escapes introduced through a
    // parent directory junction/symlink, not only a symlinked final file.
    if (!inside(root, real)) throw new Error(`symlink containment escape: ${kind}/${rel}`);
    const handle = await open(real, 'r');
    try {
      const st = await handle.stat();
      if (!st.isFile()) throw new Error(`malformed input (not a file): ${kind}/${rel}`);
      // st is the resolved target's stat (never an lstat symlink size), and
      // the size gate runs before any bounded bytes are read.
      if (st.size > max) throw new Error(`file too large: ${kind}/${rel} exceeds bounded size limit (${max} bytes)`);
      const expected = st.size;
      const buffer = Buffer.alloc(expected);
      let offset = 0;
      while (offset < expected) {
        const { bytesRead } = await handle.read(buffer, offset, expected - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== expected) throw new Error(`file changed during audit: ${kind}/${rel} was truncated while reading`);
      const sentinel = Buffer.alloc(1);
      const { bytesRead: extraBytes } = await handle.read(sentinel, 0, 1, expected);
      const after = await handle.stat();
      if (extraBytes > 0 || after.size !== expected || after.mtimeMs !== st.mtimeMs) throw new Error(`file changed during audit: ${kind}/${rel} changed while reading`);
      const data = buffer;
      this.total += data.length; // actual, unique (cached) bytes only
      if (this.total > LIMITS.totalBytes) throw new Error('bounded limit exceeded: total input size too large');
      this.inputs.set(key, { path: key, sha256: sha256(data), bytes: data.length });
      this.cache.set(key, data);
      return data;
    } finally { await handle.close(); }
  }
  async json(kind, rel, { max = LIMITS.fileBytes, optional = false } = {}) {
    let data;
    try { data = await this.bytes(kind, rel, max); } catch (e) {
      if (optional && /^missing required input/.test(e.message)) return null;
      throw e;
    }
    try { return JSON.parse(data.toString('utf8')); } catch { throw new Error(`malformed JSON: invalid JSON in ${kind}/${rel}`); }
  }
  async stat(kind, rel) { // existence/containment probe without reading bytes
    safeRel(rel);
    const root = this.roots[kind];
    const file = resolve(root, ...rel.split('/'));
    if (!inside(root, file)) return { exists: false, escape: true };
    try { await lstat(file); } catch (e) {
      if (e.code === 'ENOENT') return { exists: false, escape: false };
      throw e;
    }
    let real;
    try { real = await realpath(file); } catch { return { exists: true, escape: true }; }
    return { exists: true, escape: !inside(root, real) };
  }
  list() { return [...this.inputs.values()].sort((a, b) => byStr(a.path, b.path)); }
}

export async function auditFccCoverage({ fccRoot, motPublicRoot } = {}) {
  if (!fccRoot || !motPublicRoot) throw new Error('missing required input roots: fccRoot and motPublicRoot are required');
  let fccReal; let motReal;
  try { fccReal = await realpath(fccRoot); } catch { throw new Error('missing FCC root: root does not exist'); }
  try { motReal = await realpath(motPublicRoot); } catch { throw new Error('missing MoT root: root does not exist'); }
  const reader = new Reader(fccReal, motReal);
  const issues = []; const limitations = [];
  const issue = (code, message) => issues.push({ code, message: safeText(message) });

  // ---- FCC registries and indexes -------------------------------------------
  const cityIndex = await reader.json('fcc', 'content/cities/index.json', { max: LIMITS.registryBytes });
  if (!isObj(cityIndex) || cityIndex.schema !== 'fcc.city-sources/1') throw new Error('malformed schema: content/cities/index.json');
  const slugs = arr(cityIndex.slugs, 'city index slugs', LIMITS.cities);
  for (const s of slugs) if (typeof s !== 'string' || !SAFE_SLUG.test(s)) throw new Error(`unsafe slug in city index: ${String(s)}`);
  const slugSet = new Set(slugs);
  const registry = await reader.json('fcc', 'content/assets/registry.json', { max: LIMITS.registryBytes });
  if (!isObj(registry) || registry.schema !== 'fcc.asset-registry/1') throw new Error('malformed schema: asset registry');
  const optimized = await reader.json('fcc', 'data/optimized-assets-release.json', { max: LIMITS.registryBytes });
  if (!isObj(optimized) || !Array.isArray(optimized.files)) throw new Error('malformed schema: optimized assets release');
  for (const f of arr(optimized.files, 'optimized files', LIMITS.files)) {
    if (!isObj(f) || typeof f.path !== 'string') throw new Error('malformed schema: optimized file entry must be an object with a path');
  }
  const brush = await reader.json('fcc', 'data/brush-portraits.json', { max: LIMITS.registryBytes });
  if (!isObj(brush) || brush.schema !== 'fcc.brush-portraits/1' || !Array.isArray(brush.cities)) throw new Error('malformed schema: brush portraits');
  arr(brush.cities, 'brush cities', LIMITS.cities);
  const homeMap = await reader.json('fcc', 'data/home-map-wall-release.json', { max: LIMITS.registryBytes });
  if (!isObj(homeMap)) throw new Error('malformed schema: home map release');
  const teeVariants = new Set(arr(homeMap.tshirtCollections ?? [], 'tshirt collections', 100).filter((v) => typeof v === 'string'));
  const cityArtRaw = await reader.json('fcc', 'output/prototypes/city-pages/journal/city-art.json', { max: LIMITS.registryBytes, optional: true });
  if (cityArtRaw === null) limitations.push('Optional city-art source unavailable: absent/not present in the supplied FCC snapshot, so city-art copies cannot be claimed as part of the audited universe.');
  const cityArt = cityArtRaw ?? {};
  if (!isObj(cityArt)) throw new Error('malformed schema: city-art');
  for (const [key, list] of Object.entries(cityArt)) if (!Array.isArray(list)) throw new Error(`malformed schema: city-art entry for ${key} must be an array`);
  const magazine = await reader.json('fcc', 'output/magazine-articles/art-registry.json', { max: LIMITS.registryBytes, optional: true });
  if (!magazine) limitations.push('Optional magazine art registry unavailable: absent/not present in the supplied FCC snapshot, so magazine records cannot be claimed as part of the audited universe.');
  else if (!isObj(magazine) || !Array.isArray(magazine.cities)) throw new Error('malformed schema: magazine art registry');
  limitations.push('Offline metadata audit only: registry availability is release-declared, not freshly verified live; no URLs were fetched and no image bytes were read.');
  limitations.push('Inline locators encountered in metadata are hashed as text, not decoded or copied; no separate image files were fetched or read.');
  limitations.push('Shop route is unverified unless explicit source metadata proves it; discover/preview/insert are catalog-present/needs-product-check, not proven product behaviour.');
  limitations.push('Standalone HTML embedding permission remains unresolved; this audit does not invent a license and does not change the existing credited unknown/restricted sharing policy.');
  if (registry.releaseVersion && optimized.contentVersion && registry.releaseVersion !== optimized.contentVersion) {
    limitations.push(`Source registry releaseVersion (${registry.releaseVersion}) differs from optimized contentVersion (${optimized.contentVersion}); both versions are recorded as supplied and neither was live-verified.`);
  }

  // ---- Source rows ------------------------------------------------------------
  const rows = [];
  const mergeIndex = new Map(); // identity key -> row
  const shaIndex = new Map(); // city|sha256 -> rows[]
  const dimsByOriginal = new Map(); // any proven original alias -> dims
  const registerRow = (row) => {
    const frameKey = row.frame ? row.frame.join(',') : (row.crop ? `crop:${row.crop.join(',')}` : 'noframe');
    const keys = new Set();
    for (const url of row.originalAliases ?? [row.originalUrl]) if (url) keys.add(`${row.cityId ?? ''}|url:${url}|${frameKey}`);
    if (row.sha256) keys.add(`${row.cityId ?? ''}|sha:${row.sha256}|${frameKey}`);
    for (const id of [row.sourceId, ...(row.aliasSourceIds ?? [])]) if (id) keys.add(`${row.cityId ?? ''}|id:${id}|${frameKey}`);
    for (const k of keys) if (!mergeIndex.has(k)) mergeIndex.set(k, row);
    if (row.sha256) {
      const k = `${row.cityId ?? ''}|${row.sha256}`;
      if (!shaIndex.has(k)) shaIndex.set(k, []);
      if (!shaIndex.get(k).includes(row)) shaIndex.get(k).push(row);
    }
  };
  const findMerge = (row) => {
    const frameKey = row.frame ? row.frame.join(',') : (row.crop ? `crop:${row.crop.join(',')}` : 'noframe');
    const keys = [];
    for (const url of row.originalAliases ?? [row.originalUrl]) if (url) keys.push(`${row.cityId ?? ''}|url:${url}|${frameKey}`);
    if (row.sha256) keys.push(`${row.cityId ?? ''}|sha:${row.sha256}|${frameKey}`);
    // Full record copies can carry a different display id for the exact same
    // proven original+crop; the sha/url keys above are the merge proof, the
    // display id alone is not required to be equal.
    for (const k of keys) { const hit = mergeIndex.get(k); if (hit) return hit; }
    return undefined;
  };
  function addRow(row) {
    row.matchedMotIds = [];
    row.originalUrl = safeDisplay(row.originalUrl); row.sourceUrl = safeDisplay(row.sourceUrl); row.derivativeUrl = safeDisplay(row.derivativeUrl); row.sourcePointer = safeDisplay(row.sourcePointer);
    if (Array.isArray(row.originalAliases)) row.originalAliases = row.originalAliases.map(safeDisplay);
    if (Array.isArray(row.renditionUrls)) row.renditionUrls = row.renditionUrls.map(safeDisplay);
    if (Array.isArray(row.derivativeUrls)) row.derivativeUrls = row.derivativeUrls.map(safeDisplay);
    if (typeof row.originalUrl === 'string' && row.originalUrl.startsWith('urn:mot-audit:inline:')) { row._unresolved = true; row.reason = 'inline image locator in source metadata was hashed as text, not decoded or copied; inline source mapping is unresolved'; }
    row.originalAliases = uniqSort([row.originalUrl, row.sourceUrl, ...(row.originalAliases ?? [])]);
    if (row.originalUrl && !row.originalAliases.includes(row.originalUrl)) row.originalAliases.unshift(row.originalUrl);
    row.aliasSourceIds = uniqSort([row.sourceId, ...(row.aliasSourceIds ?? [])]);
    row.provenance = uniqSort(row.provenance ?? []);
    row.renditionUrls = uniqSort(row.renditionUrls ?? []);
    if (row.frame && row.crop === undefined && !row._unresolved) {
      row._unresolved = true;
      row.reason ??= 'raw frame preserved but a normalized crop is not provable from explicit valid sheet dimensions; crop was not guessed';
    }
    if (row.originalUrl && !isHttps(row.originalUrl)) {
      row._unresolved = true;
      row.reason ??= `unsupported protocol in source original URL: ${row.originalUrl}`;
    }
    row.status = row._unresolved ? 'unresolved' : 'missing';
    row.eligibility = eligibility(false);
    // Source credit/rights are carried on the row itself; the generic FCC
    // fallback applies only when the source supplies no credit of its own.
    if (row.credit === undefined) row.credit = 'Foreign Clubbers Correspondence';
    row.rightsStatus ??= 'unknown';
    const existing = findMerge(row);
    if (existing) {
      const creditConflict = row.credit && existing.credit && row.credit !== existing.credit && existing.credit !== 'Foreign Clubbers Correspondence' && row.credit !== 'Foreign Clubbers Correspondence';
      const rightsConflict = row.rightsStatus && existing.rightsStatus && row.rightsStatus !== existing.rightsStatus && existing.rightsStatus !== 'unknown' && row.rightsStatus !== 'unknown';
      if (creditConflict || rightsConflict) {
        issue('source-policy-conflict', `conflicting source credit/rights retained as separate rows for ${String(row.sourceId)} in city ${String(row.cityId)}`);
      } else {
        existing.provenance = uniqSort([...(existing.provenance ?? []), ...(row.provenance ?? [])]);
        if (existing.credit === 'Foreign Clubbers Correspondence' && row.credit && row.credit !== 'Foreign Clubbers Correspondence') existing.credit = row.credit;
        if (existing.rightsStatus === 'unknown' && row.rightsStatus && row.rightsStatus !== 'unknown') existing.rightsStatus = row.rightsStatus;
        existing.registryUses = uniqSort([...(existing.registryUses ?? []), ...(row.registryUses ?? [])]);
        existing.aliasSourceIds = uniqSort([...(existing.aliasSourceIds ?? []), ...(row.aliasSourceIds ?? []), row.sourceId]);
        existing.originalAliases = uniqSort([...(existing.originalAliases ?? []), ...(row.originalAliases ?? [])]);
        existing.renditionUrls = uniqSort([...(existing.renditionUrls ?? []), ...(row.renditionUrls ?? [])]);
        for (const f of ['frame', 'crop', 'sha256', 'width', 'height', 'derivativeUrl', 'slot', 'sourceUrl', 'renditionFamily']) {
          if (existing[f] === undefined && row[f] !== undefined) existing[f] = row[f];
        }
        // A valid crop is never silently merged with an unresolved frame,
        // and an unresolved duplicate never erases a proven crop.
        if (row._unresolved && row.crop === undefined && existing.crop !== undefined) {
          existing.unresolvedDuplicates = uniqSort([...(existing.unresolvedDuplicates ?? []), row.sourceId]);
        } else if (row._unresolved && !existing.crop) existing._unresolved = true;
        if (existing._unresolved && existing.crop === undefined) existing.status = 'unresolved';
        if (row.reason && !existing.reason) existing.reason = row.reason;
        existing.derivativeUrls = uniqSort([...(existing.derivativeUrls ?? []), existing.derivativeUrl, row.derivativeUrl]);
        existing.renditionUrls = uniqSort([...(existing.renditionUrls ?? []), row.derivativeUrl]);
        if (row.derivativeUrl && !existing.derivativeUrl) existing.derivativeUrl = row.derivativeUrl;
        if (row.kind === 'sticker' && (row.provenance ?? []).includes('journal collections') && existing.kind === 'original-art' && row.crop !== undefined) {
          if (!existing._runtimeSourceId || cmp(row.sourceId, existing.sourceId) < 0) existing.sourceId = row.sourceId;
          existing._runtimeSourceId = true;
        }
        registerRow(existing);
        return existing;
      }
    }
    if (rows.length >= LIMITS.rows) throw new Error('bounded limit exceeded: too many source rows');
    rows.push(row); registerRow(row);
    return row;
  }
  const noteDims = (urls, w, h, sha) => {
    if (!w || !h || w <= 0 || h <= 0) return;
    for (const u of Array.isArray(urls) ? urls : [urls]) {
      if (!u) continue;
      const prior = dimsByOriginal.get(u);
      if (!prior) { dimsByOriginal.set(u, { width: w, height: h, sha256: sha }); continue; }
      if (prior.width !== w || prior.height !== h) issue('source-dimension-conflict', `conflicting source sheet dimensions for ${u}: ${prior.width}x${prior.height} retained, ${w}x${h} not overwritten`);
      else if (!prior.sha256 && sha) prior.sha256 = sha;
    }
  };
  const galleryById = new Map();
  const cityDocs = new Map();
  for (const slug of [...slugs].sort(byStr)) {
    const doc = await reader.json('fcc', `content/cities/${slug}/city.json`, { max: LIMITS.cityBytes });
    if (!isObj(doc) || doc.schema !== 'fcc.city-source/1' || !isObj(doc.catalog) || !isObj(doc.catalog.city)) {
      throw new Error(`malformed schema: city ${slug}`);
    }
    if (doc.catalog.city.slug && doc.catalog.city.slug !== slug) throw new Error(`malformed schema: city slug mismatch for ${slug}`);
    if (doc.gallery !== undefined && !Array.isArray(doc.gallery)) throw new Error(`malformed schema: gallery for city ${slug}`);
    cityDocs.set(slug, doc);
    for (const rec of arr(doc.gallery ?? [], 'gallery', LIMITS.items)) if (isObj(rec) && rec.id) galleryById.set(`${slug}|${rec.id}`, rec);
    for (const rec of arr(cityArt[slug] ?? [], 'city-art gallery', LIMITS.items)) if (isObj(rec) && rec.id) galleryById.set(`${slug}|${rec.id}`, rec);
  }
  // Shared extractor for catalog.figures and catalog.artwork: real artwork
  // repeats full figure-shaped records (key, kind, src, sha256, frame, width,
  // height), so both families go through exactly the same code path and merge
  // into one row per proven city+original+crop.
  const extractFigureLike = (slug, rec, provenance) => {
    const rawUrl = resolveUrl(rec.src, CITY_PAGES);
    const gal = rec.sha256 ? galleryById.get(`${slug}|${rec.sha256}`) : undefined;
    const publishedUrl = gal ? resolveUrl(gal.original ?? gal.src, JOURNAL) : undefined;
    const originalUrl = publishedUrl ?? rawUrl;
    noteDims([rawUrl, publishedUrl, originalUrl], num(rec.width), num(rec.height), str(rec.sha256));
    return addRow({
      cityId: slug, sourceId: String(rec.key), aliasSourceIds: [str(rec.sha256), gal ? String(gal.id) : undefined],
      kind: 'sticker', category: normCategory(rec.kind, 'stickers'), originalUrl, sourceUrl: rawUrl,
      originalAliases: [originalUrl, rawUrl, publishedUrl],
      frame: Array.isArray(rec.frame) ? rec.frame : undefined,
      crop: frameCrop(rec.frame, num(rec.width), num(rec.height)),
      sha256: str(rec.sha256), width: num(rec.width), height: num(rec.height),
      credit: pickCredit(rec), rightsStatus: pickRights(rec), provenance: [provenance],
    });
  };
  for (const slug of [...slugs].sort(byStr)) {
    const doc = cityDocs.get(slug); const cc = doc.catalog.city;
    const fashion = cc.fashion;
    const fashionRowBySlot = new Map();
    if (fashion !== undefined) {
      if (!isObj(fashion)) throw new Error(`malformed fashion entry for city ${slug}`);
      const originalUrl = resolveUrl(fashion.src, CITY_PAGES);
      noteDims(originalUrl, num(fashion.width), num(fashion.height), str(fashion.sha256));
      const frames = arr(fashion.frames ?? [], 'fashion frames', 10_000);
      const fashionSlots = Array.isArray(fashion.slots) ? fashion.slots : [];
      frames.forEach((frame, i) => {
        const crop = frameCrop(frame, num(fashion.width), num(fashion.height));
        const row = addRow({
          cityId: slug, sourceId: `${slug}-fashion`, aliasSourceIds: [fashionSlots[i] ? String(fashionSlots[i]) : undefined, str(fashion.sha256)],
          kind: 'original-art', category: 'portraits', originalUrl, frame: Array.isArray(frame) ? frame : undefined, crop,
          sha256: str(fashion.sha256), width: num(fashion.width), height: num(fashion.height),
          credit: pickCredit(fashion), rightsStatus: pickRights(fashion),
          provenance: ['catalog.city.fashion'], slot: fashionSlots[i] !== undefined ? String(fashionSlots[i]) : undefined,
          _unresolved: crop === undefined && Array.isArray(frame),
          reason: crop === undefined && Array.isArray(frame) ? 'fashion frame has no provable normalized crop from explicit valid dimensions' : undefined,
        });
        if (fashionSlots[i] !== undefined) fashionRowBySlot.set(String(fashionSlots[i]), row);
      });
      if (!Array.isArray(fashion.frames) || !frames.length) {
        addRow({ cityId: slug, sourceId: `${slug}-fashion`, kind: 'original-art', category: 'portraits', originalUrl, sha256: str(fashion.sha256), credit: pickCredit(fashion), rightsStatus: pickRights(fashion), provenance: ['catalog.city.fashion'], reason: 'source sheet without enumerated frames' });
      }
    }
    for (const fig of arr(cc.figures ?? [], 'figures', LIMITS.items)) {
      if (!isObj(fig)) throw new Error(`malformed figures entry for city ${slug}`);
      // Real catalogs also carry style metadata {slot,label,w,h,kind:'style'}
      // with no key/src: its image and crop are the matching fashion slot.
      const isStyle = fig.kind === 'style' || (fig.slot !== undefined && !fig.key && !fig.src);
      if (isStyle) {
        const slot = str(fig.slot) ?? str(fig.label);
        const target = slot ? fashionRowBySlot.get(slot) : undefined;
        if (target) {
          target.provenance = uniqSort([...target.provenance, 'catalog.city.figures[style]']);
          target.aliasSourceIds = uniqSort([...target.aliasSourceIds, slot]);
          registerRow(target);
        } else {
          issue('style-slot-mismatch', `style figures entry for city ${slug} slot ${String(slot)} has no matching fashion frame`);
          addRow({ cityId: slug, sourceId: String(slot ?? `${slug}-style`), kind: 'original-art', category: 'portraits', originalUrl: undefined, provenance: ['catalog.city.figures[style]'], _unresolved: true, reason: 'style slot has no matching fashion frame; no source row was invented for it' });
        }
        continue;
      }
      if (!fig.key || !fig.src) throw new Error(`malformed figures entry for city ${slug}`);
      extractFigureLike(slug, fig, 'catalog.city.figures');
    }
    for (const art of arr(cc.artwork ?? [], 'catalog artwork', LIMITS.items)) {
      if (!isObj(art) || !art.key || !art.src) throw new Error(`malformed artwork entry for city ${slug}`);
      const row = extractFigureLike(slug, art, 'catalog.city.artwork');
      row.provenance = uniqSort([...row.provenance, 'catalog.city.artwork']);
    }
    const ja = isObj(doc.journalArt) ? doc.journalArt : {};
    if (doc.journalArt !== undefined && !isObj(doc.journalArt)) throw new Error(`malformed journalArt for city ${slug}`);
    for (const key of Object.keys(ja).sort()) {
      if (key === 'city') continue;
      const v = ja[key];
      if (key === 'name') { if (typeof v !== 'string') throw new Error(`malformed journalArt entry name for city ${slug}`); continue; }
      if (key === 'palette') { if (!Array.isArray(v)) throw new Error(`malformed journalArt entry palette for city ${slug}`); continue; }
      if (v === null) { addRow({ cityId: slug, sourceId: `${slug}-${key}`, kind: 'original-art', category: normCategory(key), provenance: ['journalArt'], _unresolved: true, reason: 'journalArt slot is explicitly null/unavailable; no source URL was fabricated' }); continue; }
      if (!isObj(v)) throw new Error(`malformed journalArt entry ${key} for city ${slug}`);
      const p = isObj(v.preview) ? v.preview : {};
      const originalUrl = resolveUrl(p.original ?? v.original ?? v.src, JOURNAL);
      if (!originalUrl) { addRow({ cityId: slug, sourceId: String(v.id ?? `${slug}-${key}`), kind: 'original-art', category: normCategory(key), provenance: ['journalArt'], _unresolved: true, reason: 'journalArt entry has no original or src URL' }); continue; }
      noteDims(originalUrl, num(p.width ?? v.width), num(p.height ?? v.height), str(v.sha256));
      addRow({ cityId: slug, sourceId: String(v.id ?? `${slug}-${key}`), kind: 'original-art', category: normCategory(v.category ?? key), originalUrl, renditionUrls: [resolveUrl(v.src, JOURNAL), resolveUrl(p.src, JOURNAL), resolveUrl(p.thumb, JOURNAL)].filter(Boolean), sha256: str(v.sha256), credit: pickCredit(v), rightsStatus: pickRights(v), provenance: ['journalArt'] });
    }
    // Gallery + its city-art copy: both provenances are retained on one row.
    // A gallery record whose id is a figure/artwork SHA also aliases that
    // crop (published original); the full gallery record is still retained
    // separately as its own sheet row, not discarded as only an alias.
    for (const [prov, list] of [['city.gallery', doc.gallery ?? []], ['city-art', cityArt[slug] ?? []]]) {
      for (const rec of arr(list, 'gallery records', LIMITS.items)) {
        if (!isObj(rec) || !rec.id || (!rec.original && !rec.src)) throw new Error(`malformed gallery entry for city ${slug}`);
        const publishedUrl = resolveUrl(rec.original ?? rec.src, JOURNAL);
        noteDims(publishedUrl, num(rec.width), num(rec.height), str(rec.sha256));
        const aliasTargets = shaIndex.get(`${slug}|${rec.id}`) ?? [];
        if (aliasTargets.length) {
          for (const target of aliasTargets) {
            target.originalAliases = uniqSort([...target.originalAliases, publishedUrl]);
            target.renditionUrls = uniqSort([...target.renditionUrls, resolveUrl(rec.src, JOURNAL), resolveUrl(rec.thumb, JOURNAL), publishedUrl]);
            target.provenance = uniqSort([...target.provenance, prov]);
            target.aliasSourceIds = uniqSort([...target.aliasSourceIds, String(rec.id)]);
            registerRow(target);
          }
        }
        // Duplicate gallery/city-art records go through addRow below so a
        // later explicit credit/rights policy merges instead of being discarded.
        addRow({ cityId: slug, sourceId: String(rec.id), kind: 'original-art', category: normCategory(rec.category, 'gallery'), originalUrl: publishedUrl, renditionUrls: [resolveUrl(rec.src, JOURNAL), resolveUrl(rec.thumb, JOURNAL), publishedUrl].filter(Boolean), sha256: str(rec.sha256), width: num(rec.width), height: num(rec.height), credit: pickCredit(rec), rightsStatus: pickRights(rec), provenance: [prov], reason: 'full source sheet/record; a cropped derivative does not by itself cover the sheet' });
      }
    }
  }
  // City-art keys outside the city index stay visible as unresolved rows.
  for (const key of Object.keys(cityArt).sort(byStr)) {
    if (slugSet.has(key)) continue;
    issue('city-art-undeclared-city', `city-art records reference undeclared city ${key}; retained as unresolved rows`);
    for (const rec of arr(cityArt[key], 'city-art gallery', LIMITS.items)) {
      if (!isObj(rec)) throw new Error(`malformed city-art entry for undeclared city ${key}`);
      addRow({ cityId: key, sourceId: String(rec.id ?? rec.src ?? 'city-art'), kind: 'original-art', category: normCategory(rec.category, 'gallery'), originalUrl: resolveUrl(rec.original ?? rec.src, JOURNAL), renditionUrls: [resolveUrl(rec.src, JOURNAL)].filter(Boolean), credit: pickCredit(rec), rightsStatus: pickRights(rec), provenance: ['city-art'], _unresolved: true, reason: 'city-art record references a city outside the city index; origin is unresolved' });
    }
    if (!arr(cityArt[key], 'city-art gallery', LIMITS.items).length) {
      addRow({ cityId: key, sourceId: 'city-art', kind: 'original-art', category: 'gallery', provenance: ['city-art'], _unresolved: true, reason: 'city-art key references a city outside the city index; origin is unresolved' });
    }
  }
  // Brush portraits are apparel; only the explicit master is original art.
  // Apparel originals/web/thumbnail may be /absolute-public-path or HTTPS and
  // are resolved once at the FCC origin.
  for (const c of brush.cities) {
    if (!isObj(c) || !c.slug) throw new Error('malformed brush-portraits city entry');
    addRow({ cityId: String(c.slug), sourceId: String(c.slug), aliasSourceIds: [str(c.sha256)], kind: 'apparel-mockup', category: 'apparel', originalUrl: resolveUrl(c.original, `${ORIGIN}/`), sha256: str(c.sha256), width: num(c.width), height: num(c.height), renditionUrls: [resolveUrl(c.web, `${ORIGIN}/`), resolveUrl(c.thumbnail, `${ORIGIN}/`)].filter(Boolean), credit: pickCredit(c), rightsStatus: pickRights(c), provenance: ['brush-portraits'] });
  }
  if (brush.artworkMaster) {
    const m = brush.artworkMaster;
    if (!isObj(m)) throw new Error('malformed brush-portraits artworkMaster entry');
    addRow({ cityId: null, sourceId: 'artworkMaster', aliasSourceIds: [str(m.sha256)], kind: 'original-art', category: 'artwork', originalUrl: resolveUrl(m.original, `${ORIGIN}/`), sha256: str(m.sha256), width: num(m.width), height: num(m.height), renditionUrls: [resolveUrl(m.web, `${ORIGIN}/`), resolveUrl(m.thumbnail, `${ORIGIN}/`)].filter(Boolean), credit: pickCredit(m), rightsStatus: pickRights(m), provenance: ['brush-portraits.artworkMaster'], _unresolved: true, reason: 'explicit artworkMaster has no provable source city; no city was guessed' });
  }
  // Home-map tee rendition families: every declared rendition is retained;
  // the explicitly largest size is the original and supplies the SHA, in a
  // stable order independent of input order. Sizes stay out of the design id,
  // and declared cities outside the canonical list remain visible.
  const teeGroups = new Map();
  for (const f of optimized.files) {
    const m = /^\/assets\/home-map-wall-v2\/tiles\/([^/]+)\/(\d+)\/([^/]+)\.webp$/.exec(f.path);
    if (m && teeVariants.has(m[1])) {
      const k = `${m[1]}|${m[3]}`;
      if (!teeGroups.has(k)) teeGroups.set(k, { variant: m[1], slug: m[3], entries: [] });
      teeGroups.get(k).entries.push({ size: Number(m[2]), path: f.path, sha256: str(f.sha256) });
    }
  }
  for (const g of [...teeGroups.values()].sort((a, b) => byStr(`${a.slug}|${a.variant}`, `${b.slug}|${b.variant}`))) {
    const entries = [...g.entries].sort((a, b) => (b.size - a.size) || byStr(a.path, b.path));
    const largest = entries[0];
    addRow({ cityId: g.slug, sourceId: `${g.slug}-home-map-${g.variant}`, aliasSourceIds: [largest.sha256], kind: 'apparel-mockup', category: 'apparel', originalUrl: `${ORIGIN}${largest.path}`, sha256: largest.sha256, renditionUrls: entries.map((e) => `${ORIGIN}${e.path}`), renditionFamily: g.variant, provenance: ['home-map-wall tiles'], _unresolved: slugSet.has(g.slug) ? undefined : true, reason: slugSet.has(g.slug) ? undefined : 'declared tee city is outside the canonical city list; retained as unresolved' });
  }
  if (magazine) {
    for (const city of arr(magazine.cities, 'magazine cities', LIMITS.cities)) {
      if (!isObj(city) || !isObj(city.sections)) throw new Error('malformed magazine city entry');
      for (const section of Object.keys(city.sections).sort()) for (const e of arr(city.sections[section], 'magazine entries', LIMITS.items)) {
        if (!isObj(e)) throw new Error(`malformed magazine entry in section ${section}`);
        if (!e.src && !e.id) { addRow({ cityId: str(city.slug) ?? null, sourceId: `${section}-entry`, kind: 'original-art', category: normCategory(section), provenance: ['magazine art-registry'], _unresolved: true, reason: 'magazine entry has no src or id; retained as unresolved' }); continue; }
        addRow({ cityId: str(city.slug) ?? null, sourceId: String(e.id ?? e.src), kind: 'original-art', category: e.category != null ? normCategory(e.category) : (e.type === 'hotel' || e.type === 'restaurant' ? normCategory(e.type) : normCategory(section)), originalUrl: resolveUrl(e.responsive?.original ?? e.src, `${ORIGIN}/output/magazine-articles/`), credit: pickCredit(e), rightsStatus: pickRights(e) ?? 'unknown', provenance: ['magazine art-registry'] });
      }
    }
  }
  // Journal runtime collections + declared originals maps.
  const collectionsDoc = await reader.json('fcc', 'output/prototypes/city-pages/journal/collections.json', { max: LIMITS.registryBytes, optional: true });
  let collectionCount = 0; let derivativeCount = 0; let collectionArtAbsent = 0;
  if (collectionsDoc) {
    if (!isObj(collectionsDoc) || !Array.isArray(collectionsDoc.collections)) throw new Error('malformed schema: journal collections');
    const collections = arr(collectionsDoc.collections, 'journal collections', LIMITS.collections);
    collectionCount = collections.length;
    const originalsCache = new Map();
    async function loadOriginals(rel, collId) {
      if (originalsCache.has(rel)) return originalsCache.get(rel);
      let result;
      try { safeRel(rel, 'originals path'); } catch { issue('unsafe-originals-traversal', `unsafe traversal in originals reference for collection ${collId}`); result = { error: 'unsafe' }; originalsCache.set(rel, result); return result; }
      const probe = await reader.stat('fcc', `output/prototypes/city-pages/journal/${rel}`);
      if (!probe.exists) { issue('missing-originals', `declared originals map failed to load (missing) for collection ${collId}: journal/${rel}`); result = { error: 'missing' }; }
      else if (probe.escape) { issue('symlink-containment-escape', `symlink containment escape in originals map for collection ${collId}: journal/${rel}`); result = { error: 'symlink' }; }
      else {
        try {
          const data = await reader.json('fcc', `output/prototypes/city-pages/journal/${rel}`, { max: LIMITS.registryBytes });
          if (!isObj(data) || !Array.isArray(data.assets) || !Array.isArray(data.frames)) throw new Error(`malformed schema: originals map journal/${rel}`);
          result = { data };
        } catch (e) {
          if (/symlink containment escape/.test(e.message)) { issue('symlink-containment-escape', `symlink containment escape in originals map for collection ${collId}: journal/${rel}`); result = { error: 'symlink' }; }
          else if (/missing required input/.test(e.message)) { issue('missing-originals', `declared originals map failed to load (missing) for collection ${collId}: journal/${rel}`); result = { error: 'missing' }; }
          else throw e;
        }
      }
      originalsCache.set(rel, result); return result;
    }
    for (const coll of collections) {
      if (!isObj(coll)) throw new Error('malformed journal collection entry');
      const stickers = arr(coll.stickers ?? [], 'collection stickers', LIMITS.stickers);
      derivativeCount += stickers.length;
      let orig = null;
      if (coll.originals) orig = await loadOriginals(String(coll.originals), String(coll.id ?? 'unknown'));
      const processSticker = async (st, extraProv) => {
        const cityId = str(coll.city) ?? (coll.type === 'city' ? str(coll.id) : null);
        if (!isObj(st)) { addRow({ cityId, sourceId: 'malformed-sticker', kind: 'sticker', category: 'stickers', provenance: ['journal collections', ...(extraProv ?? [])], _unresolved: true, reason: 'malformed collection sticker entry retained as unresolved' }); return; }
        const derivativeUrl = resolveUrl(st.src, JOURNAL);
        const base = { cityId, sourceId: String(st.key ?? st.id ?? 'sticker'), kind: 'sticker', category: 'stickers', derivativeUrl, provenance: ['journal collections', ...(extraProv ?? [])] };
        if (!orig || orig.error || !orig.data) { addRow({ ...base, originalUrl: derivativeUrl, _unresolved: true, reason: orig?.error === 'symlink' ? 'originals map is a symlink escaping the FCC root and was not followed' : orig?.error === 'unsafe' ? 'unsafe originals reference was not followed' : 'declared originals map failed to load' }); return; }
        const idx = num(st.index) ?? 0; const frameObj = orig.data.frames[idx];
        const frame = isObj(frameObj) ? frameObj.frame : undefined;
        const assetIdx = isObj(frameObj) && num(frameObj.asset) !== undefined ? num(frameObj.asset) : 0;
        const pointer = orig.data.assets[assetIdx];
        if (typeof pointer !== 'string') { addRow({ ...base, originalUrl: derivativeUrl, frame: Array.isArray(frame) ? frame : undefined, _unresolved: true, reason: 'originals frame has no asset pointer' }); return; }
        if (pointer.startsWith('data:')) { addRow({ ...base, originalUrl: safeDisplay(pointer), frame: Array.isArray(frame) ? frame : undefined, sourcePointer: safeDisplay(pointer), _unresolved: true, reason: 'inline image locator in source metadata was hashed as text, not decoded or copied; inline source mapping is unresolved' }); return; }
        const resolved = pointer.startsWith('http') || pointer.startsWith('/') ? resolveUrl(pointer, `${ORIGIN}/`) : resolveUrl(pointer, CITY_PAGES);
        let unsafe = false;
        try { const u = new URL(resolved); if (u.protocol !== 'https:' || !u.pathname.startsWith('/output/')) unsafe = true; } catch { unsafe = true; }
        if (unsafe) {
          issue('unsafe-original-traversal', `unsafe traversal/containment in originals asset pointer for collection ${String(coll.id)}: ${safeDisplay(pointer)}`);
          addRow({ ...base, originalUrl: derivativeUrl, frame: Array.isArray(frame) ? frame : undefined, sourcePointer: safeDisplay(pointer), _unresolved: true, reason: 'unsafe original asset pointer was contained and not followed' }); return;
        }
        if (!cityId) { addRow({ ...base, originalUrl: resolved, frame: Array.isArray(frame) ? frame : undefined, _unresolved: true, reason: 'non-city/world collection has no provable city; no city was manufactured' }); return; }
        const dims = dimsByOriginal.get(resolved);
        const crop = dims ? frameCrop(frame, dims.width, dims.height) : undefined;
        addRow({ ...base, originalUrl: resolved, frame: Array.isArray(frame) ? frame : undefined, crop, width: dims?.width, height: dims?.height, sha256: dims?.sha256, _unresolved: !dims || crop === undefined, reason: dims && crop !== undefined ? undefined : 'raw frame preserved but source sheet dimensions are not provable from explicit matching metadata; crop was not guessed' });
      };
      for (const st of stickers) await processSticker(st);
      if (typeof coll.id === 'string' && SAFE_SLUG.test(coll.id)) {
        const rel = `output/prototypes/city-pages/journal/art/${coll.id}.json`;
        const probe = await reader.stat('fcc', rel);
        if (probe.exists && !probe.escape) {
          const dup = await reader.json('fcc', rel, { max: LIMITS.registryBytes });
          const list = Array.isArray(dup) ? dup : (isObj(dup) ? (dup.stickers ?? dup.items ?? []) : []);
          if (!Array.isArray(list)) throw new Error(`malformed schema: collection art json ${rel}`);
          for (const st of list) await processSticker(st, ['collection art json']);
        } else if (probe.exists && probe.escape) issue('symlink-containment-escape', `symlink containment escape in collection art json for collection ${coll.id}`);
        else collectionArtAbsent += 1;
      }
    }
    limitations.push(`Journal runtime collections retained as provenance: ${collectionCount} collections and ${derivativeCount} declared derivatives, including empty universal/special collections; no city was manufactured for non-city collections.`);
    if (collectionArtAbsent) limitations.push(`Optional per-collection art JSON absent/not present for ${collectionArtAbsent} collection(s) in the supplied snapshot; absence was not treated as additional provenance.`);
  } else limitations.push('Optional journal runtime collections file unavailable: absent/not present in the supplied snapshot; journal derivatives could not be enumerated.');
  // Registry catch-all, indexed by city+normalized URL and city+hash (no
  // rows.some scan per use). Recognized rows retain the registry use/pointer
  // as provenance; unknown uses stay visible as unresolved rows.
  const registryUrlIndex = new Map(); const registryHashIndex = new Map();
  const pushIndex = (map, key, row) => { if (!map.has(key)) map.set(key, []); if (!map.get(key).includes(row)) map.get(key).push(row); };
  for (const row of rows) {
    if (!row.cityId) continue;
    for (const u of [row.originalUrl, row.sourceUrl, ...(row.originalAliases ?? []), ...(row.renditionUrls ?? []), row.derivativeUrl]) if (u) pushIndex(registryUrlIndex, `${row.cityId}|${resolveUrl(u, `${ORIGIN}/`)}`, row);
    if (row.sha256) pushIndex(registryHashIndex, `${row.cityId}|${row.sha256}`, row);
    for (const a of row.aliasSourceIds ?? []) if (/^[0-9a-f]{64}$/i.test(a)) pushIndex(registryHashIndex, `${row.cityId}|${a}`, row);
  }
  for (const asset of arr(registry.assets ?? [], 'registry assets', LIMITS.assets)) {
    if (!isObj(asset) || !asset.id) throw new Error('malformed registry asset entry');
    const assetUrl = resolveUrl(asset.url, `${ORIGIN}/`);
    const uses = arr(asset.uses ?? [], 'registry uses', LIMITS.items);
    if (!uses.length) { addRow({ cityId: null, sourceId: String(asset.id), kind: 'registry-asset', category: 'registry', originalUrl: assetUrl, sha256: str(asset.release?.sha256), provenance: ['asset registry'], _unresolved: true, reason: 'registry asset has no accounted use' }); continue; }
    for (const use of uses) {
      if (!isObj(use)) throw new Error('malformed registry use entry');
      const useCity = str(use.city) ?? null;
      const recognized = [
        ...(useCity && assetUrl ? registryUrlIndex.get(`${useCity}|${assetUrl}`) ?? [] : []),
        ...(useCity && asset.release?.sha256 ? registryHashIndex.get(`${useCity}|${asset.release.sha256}`) ?? [] : []),
      ];
      if (recognized.length) {
        for (const row of recognized) {
          row.provenance = uniqSort([...row.provenance, 'asset registry']);
          row.registryUses = uniqSort([...(row.registryUses ?? []), `${String(asset.id)}:${String(use.pointer)}`]);
        }
        continue;
      }
      const outsideCity = !slugSet.has(use.city);
      issue(outsideCity ? 'registry-undeclared-city-use' : 'registry-unaccounted-use', `${outsideCity ? 'undeclared outside-city' : 'unaccounted'} registry use for asset ${asset.id} at ${String(use.pointer)} (city ${String(use.city)})`);
      addRow({ cityId: useCity, sourceId: String(asset.id), kind: 'registry-use', category: normCategory(use.scope, 'registry'), originalUrl: assetUrl, sha256: str(asset.release?.sha256), provenance: ['asset registry'], registryPointer: str(use.pointer), registryUses: [`${String(asset.id)}:${String(use.pointer)}`], availability: str(asset.availability), releaseVersion: str(registry.releaseVersion), _unresolved: true, reason: outsideCity ? 'registry use references an undeclared city' : 'registry use is not accounted for by a recognized canonical source family' });
    }
  }

  // ---- MoT catalog -------------------------------------------------------------
  const destinations = await reader.json('mot', 'fcc/destinations.json', { max: LIMITS.registryBytes });
  if (!isObj(destinations) || !Array.isArray(destinations.cities)) throw new Error('malformed schema: MoT destinations');
  const destById = new Map(arr(destinations.cities, 'destinations', LIMITS.cities).map((c) => [c.id, c]));
  const artIndex = await reader.json('mot', 'artwork/index.json', { max: LIMITS.registryBytes });
  if (!isObj(artIndex) || !Array.isArray(artIndex.styles)) throw new Error('malformed schema: MoT artwork index');
  const motItems = []; const seenIds = new Map(); let duplicates = 0;
  for (const style of arr(artIndex.styles, 'artwork styles', 100)) {
    if (!isObj(style) || !style.id || !style.manifest) throw new Error('malformed MoT style entry');
    const manifestRel = localManifestPath(style.manifest, 'style manifest');
    const manifest = await reader.json('mot', manifestRel, { max: LIMITS.registryBytes });
    if (!isObj(manifest) || !Array.isArray(manifest.catalogs)) throw new Error(`malformed schema: MoT manifest for style ${style.id}`);
    if (manifest.styleId && manifest.styleId !== style.id) issue('manifest-style-mismatch', `manifest styleId mismatch for style ${style.id}`);
    const declaredSubjects = new Set((manifest.subjects ?? []).map((s) => s?.id));
    const declaredCities = new Set((manifest.cities ?? []).map((c) => c?.id));
    for (const cat of arr(manifest.catalogs, 'manifest catalogs', LIMITS.shards)) {
      if (!isObj(cat) || !cat.url) throw new Error('malformed manifest catalog entry');
      const shardRel = localManifestPath(cat.url, 'catalog shard');
      const probe = await reader.stat('mot', shardRel);
      if (!probe.exists) { issue('missing-shard', `missing referenced shard for ${String(cat.city)}/${String(cat.subject)}: ${shardRel}`); continue; }
      if (probe.escape) { issue('symlink-containment-escape', `symlink containment escape in referenced shard: ${shardRel}`); continue; }
      const shard = await reader.json('mot', shardRel, { max: LIMITS.registryBytes });
      if (!isObj(shard) || !Array.isArray(shard.items)) throw new Error(`malformed schema: shard ${shardRel}`);
      if (typeof cat.count === 'number' && cat.count !== shard.items.length) issue('count-mismatch', `manifest count mismatch for ${String(cat.city)}/${String(cat.subject)}: declared ${cat.count}, actual ${shard.items.length}`);
      if (motItems.length + shard.items.length > LIMITS.items) throw new Error('bounded limit exceeded: too many MoT items');
      for (const item of shard.items) {
        if (!isObj(item) || !item.id) throw new Error(`malformed MoT item in shard ${shardRel}`);
        motItems.push(item);
        if (seenIds.has(item.id)) { duplicates += 1; issue('duplicate-mot-identity', `duplicate MoT identity: ${item.id}`); } else seenIds.set(item.id, item);
        if (item.city !== cat.city || item.subject !== cat.subject) issue('shard-subject-city-mismatch', `MoT item ${item.id} subject/city does not agree with its manifest shard (${String(cat.city)}/${String(cat.subject)})`);
        if (declaredCities.size && !declaredCities.has(item.city)) issue('manifest-city-mismatch', `MoT item ${item.id} city is not declared in the manifest`);
        if (declaredSubjects.size && !declaredSubjects.has(item.subject)) issue('manifest-subject-mismatch', `MoT item ${item.id} subject is not declared in the manifest`);
        const dest = destById.get(item.city);
        if (!dest) issue('destination-mismatch', `MoT item ${item.id} references an unknown destination city ${String(item.city)}`);
        else if (item.artRef && dest.countryCode && item.artRef.countryCode !== dest.countryCode) issue('origin-country-mismatch', `MoT item ${item.id} country/origin mismatch for city ${item.city}`);
        for (const f of ['thumb', 'src', 'original']) if (typeof item[f] !== 'string' || !item[f].startsWith('https://')) issue('mot-url-mismatch', `MoT item ${item.id} field ${f} is not an HTTPS URL`);
        const a = item.artRef;
        if (a) {
          if (a.thumbnailUrl !== item.thumb || a.renditionUrl !== item.src || a.originalUrl !== item.original) issue('mot-display-mismatch', `MoT item ${item.id} display/rendition fields are inconsistent with artRef`);
          if (a.source && (a.source.cityId !== item.city)) issue('origin-mismatch', `MoT item ${item.id} source origin city mismatch`);
        }
      }
    }
  }

  // Strict release-proven original aliases. Both the source original URL and
  // each alias must be canonical FCC-origin release paths with identical
  // full SHA-256 and positive safe-integer byte evidence; row claims alone
  // are never trusted, and any conflicting evidence poisons its path.
  const releaseEvidence = new Map(); const poisonedReleasePaths = new Set();
  const releasePathKey = (value) => {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      const parsed = value.startsWith('//') ? new URL(`https:${value}`)
        : /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ? new URL(value) : new URL(value, ORIGIN);
      return parsed.pathname || undefined;
    } catch { return undefined; }
  };
  const strictReleasePath = (value) => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#') || value.includes('%')) return undefined;
    const parts = value.split('/').slice(1);
    if (!parts.length || parts.some((p) => !p || p === '.' || p === '..')) return undefined;
    try { const parsed = new URL(value, ORIGIN); return parsed.origin === ORIGIN && parsed.pathname === value ? value : undefined; } catch { return undefined; }
  };
  const strictReleaseUrlPath = (value) => {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      const parsed = new URL(value); const pathname = strictReleasePath(parsed.pathname);
      return parsed.origin === ORIGIN && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && pathname && value === `${ORIGIN}${pathname}` ? pathname : undefined;
    } catch { return undefined; }
  };
  for (const file of optimized.files) {
    const canonical = strictReleasePath(file?.path); const key = canonical ?? releasePathKey(file?.path);
    if (!key) continue;
    const sha = typeof file?.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(file.sha256) ? file.sha256.toLowerCase() : undefined;
    const valid = canonical && sha && Number.isSafeInteger(file?.bytes) && file.bytes > 0 ? { sha256: sha, bytes: file.bytes } : undefined;
    if (!valid) { poisonedReleasePaths.add(key); releaseEvidence.delete(key); continue; }
    if (poisonedReleasePaths.has(key)) continue;
    const prior = releaseEvidence.get(key);
    if (prior && (prior.sha256 !== valid.sha256 || prior.bytes !== valid.bytes)) { poisonedReleasePaths.add(key); releaseEvidence.delete(key); }
    else releaseEvidence.set(key, valid);
  }
  const releaseUrlsByEvidence = new Map();
  for (const [releasePath, evidence] of releaseEvidence) {
    const key = `${evidence.sha256}:${evidence.bytes}`;
    const urls = releaseUrlsByEvidence.get(key) ?? [];
    urls.push(`${ORIGIN}${releasePath}`);
    releaseUrlsByEvidence.set(key, urls);
  }
  for (const urls of releaseUrlsByEvidence.values()) urls.sort();
  for (const row of rows) {
    const sourcePath = strictReleaseUrlPath(row.originalUrl);
    const sourceEvidence = sourcePath ? releaseEvidence.get(sourcePath) : undefined;
    if (!sourceEvidence) continue;
    const aliases = releaseUrlsByEvidence.get(`${sourceEvidence.sha256}:${sourceEvidence.bytes}`);
    if (aliases?.length) row.originalAliases = uniqSort([...(row.originalAliases ?? []), ...aliases]);
  }
  // ---- Matching (indexed; no O(N*M) scans) ------------------------------------
  // Proof is: same city + proven canonical original alias (raw source URL or
  // SHA-proven published gallery original) + exact normalized crop +
  // compatible role. The MoT display/source id need not equal the source
  // display key; every original source id and SHA alias is preserved. A bare
  // matching source id with a conflicting original URL is not proof.
  const bySource = new Map(); const byOriginal = new Map();
  const pushMap = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const item of motItems) {
    if (item.artRef?.source?.sourceId) pushMap(bySource, `${item.city}\0${item.artRef.source.sourceId}`, item);
    if (item.original) pushMap(byOriginal, `${item.city}\0${resolveUrl(item.original, `${ORIGIN}/`)}`, item);
  }
  const roleOk = (row, item) => {
    const kind = item.artRef?.kind; const cat = normCategory(item.artRef?.category, '');
    if (row.kind === 'apparel-mockup') return kind === 'apparel-mockup' && cat === 'apparel';
    if (row.kind === 'sticker') return kind === 'sticker' || (kind === 'original-art' && cat === row.category);
    if (row.kind === 'original-art') return (kind === 'original-art' && (cat === row.category || row.category === 'gallery' || row.category === 'artwork')) || (kind === 'sticker' && row.crop !== undefined && (cat === 'stickers' || cat === row.category));
    return false;
  };
  const matchedMot = new Set();
  for (const row of rows) {
    if (row._unresolved || !row.cityId) { row.status = 'unresolved'; continue; }
    const cand = new Set();
    for (const it of bySource.get(`${row.cityId}\0${row.sourceId}`) ?? []) cand.add(it);
    for (const id of row.aliasSourceIds ?? []) for (const it of bySource.get(`${row.cityId}\0${id}`) ?? []) cand.add(it);
    for (const url of row.originalAliases ?? []) for (const it of byOriginal.get(`${row.cityId}\0${resolveUrl(url, `${ORIGIN}/`)}`) ?? []) cand.add(it);
    const good = []; const pending = [];
    for (const item of cand) {
      const a = item.artRef; const s = isObj(a) ? a.source : undefined;
      const problems = [];
      if (!isObj(a)) problems.push('missing artRef');
      if (isObj(a) && a.source?.provider !== 'fcc') problems.push('invalid source provider');
      if (isObj(a) && !str(a.assetId)) problems.push('missing artRef assetId');
      if (isObj(a) && str(a.assetId) && a.assetId !== item.id) problems.push('artRef assetId identity mismatch');
      if (isObj(a) && a.category !== item.subject) problems.push('artRef category/subject mismatch');
      if (!isObj(s) || !str(s?.sourceId)) problems.push('missing source sourceId');
      if (!isHttps(item.original) || !isHttps(item.thumb) || !isHttps(item.src)) problems.push('unsupported protocol or invalid display URL');
      if (isObj(a) && (a.thumbnailUrl !== item.thumb || a.renditionUrl !== item.src || a.originalUrl !== item.original)) problems.push('display URL mismatch');
      const originalOk = isHttps(item.original) && (row.originalAliases ?? []).includes(resolveUrl(item.original, `${ORIGIN}/`));
      if (!originalOk) problems.push('original alias mismatch');
      const originOk = item.city === row.cityId && isObj(a) && a.originCityId === row.cityId && isObj(s) && s.cityId === row.cityId;
      if (!originOk) problems.push('origin city mismatch');
      const dest = destById.get(item.city);
      if (isObj(a) && dest?.countryCode && a.countryCode !== dest.countryCode) problems.push('country mismatch');
      if (isObj(s) && dest?.countryCode && s.countryCode && s.countryCode !== dest.countryCode) problems.push('country mismatch');
      const cropOk = row.crop !== undefined ? cropEq(item.crop, row.crop) : (row.frame ? false : item.crop === undefined);
      if (!cropOk) problems.push('crop mismatch');
      const okRole = isObj(a) && roleOk(row, item);
      if (!okRole) problems.push('kind/category role mismatch');
      if (!problems.length) good.push(item);
      else {
        const labelish = isObj(s) && (s.sourceId === row.sourceId || (row.aliasSourceIds ?? []).includes(s.sourceId));
        if (labelish || originalOk) pending.push({ item, problems });
      }
    }
    if (!good.length) for (const p of pending) {
      const binding = p.problems.filter((x) => x !== 'crop mismatch' && x !== 'kind/category role mismatch');
      if (binding.length || (!p.problems.includes('crop mismatch') && p.problems.includes('kind/category role mismatch'))) issue('origin-role-mismatch', `MoT item ${p.item.id} does not match source ${row.sourceId} for city ${row.cityId}: ${uniqSort(p.problems).join('; ')}`);
    }
    if (good.length) {
      row.status = 'matched'; row.matchedMotIds = [...new Set(good.map((i) => i.id))].sort();
      for (const i of good) matchedMot.add(i.id);
      const first = [...good].sort((a, b) => byStr(a.id, b.id))[0];
      // Source credit/rights win when the source supplied them; MoT values are
      // retained separately and only fill gaps, so an explicit restricted
      // source can never be upgraded by a match.
      const sourceCredit = row.credit !== 'Foreign Clubbers Correspondence' ? row.credit : undefined;
      const sourceRights = row.rightsStatus !== 'unknown' ? row.rightsStatus : undefined;
      if (first.artRef?.credit) row.motCredit = first.artRef.credit;
      if (first.artRef?.rightsStatus) row.motRightsStatus = first.artRef.rightsStatus;
      if (!sourceCredit && first.artRef?.credit) row.credit = first.artRef.credit;
      if (!sourceRights && first.artRef?.rightsStatus) row.rightsStatus = first.artRef.rightsStatus;
      if (sourceCredit) row.sourceCredit = sourceCredit;
      if (sourceRights) row.sourceRightsStatus = sourceRights;
      row.eligibility = eligibility(true);
    } else {
      row.status = row._unresolved ? 'unresolved' : 'missing';
      if (row.status === 'missing' && !row.reason) row.reason = 'no MoT item proves this exact city, canonical original alias, crop and role';
    }
  }
  const extra = motItems.filter((i) => !matchedMot.has(i.id)).length;

  // ---- Report shaping -----------------------------------------------------------
  rows.sort((a, b) => byStr(a.cityId ?? '', b.cityId ?? '') || byStr(a.category, b.category) || byStr(a.sourceId, b.sourceId) || byStr(a.kind, b.kind) || byStr(a.originalUrl ?? '', b.originalUrl ?? '') || byStr(JSON.stringify(a.frame ?? a.crop ?? ''), JSON.stringify(b.frame ?? b.crop ?? '')) || byStr(JSON.stringify(a.provenance ?? []), JSON.stringify(b.provenance ?? [])));
  const idCounts = new Map();
  for (const row of rows) {
    const base = `${row.cityId ?? 'unknown'}:${row.sourceId}:${row.kind}`;
    const n = (idCounts.get(base) ?? 0) + 1; idCounts.set(base, n);
    row.id = n === 1 ? `source:${base}` : `source:${base}:${n}`;
    delete row._unresolved; delete row._runtimeSourceId;
    if (row.matchedMotIds) row.matchedMotIds.sort();
  }
  const dedupIssues = [...new Map(issues.map((i) => [`${i.code}\0${i.message}`, i])).values()].sort((a, b) => byStr(a.code, b.code) || byStr(a.message, b.message));
  const summary = {
    sourceRows: rows.length, motItems: motItems.length,
    matched: rows.filter((r) => r.status === 'matched').length,
    missing: rows.filter((r) => r.status === 'missing').length,
    unresolved: rows.filter((r) => r.status === 'unresolved').length,
    extra, duplicates,
  };
  const cityIds = [...new Set([...slugs, ...rows.map((r) => r.cityId), ...motItems.map((i) => i.city)].filter(Boolean))].sort(byStr);
  const cities = cityIds.map((id) => ({
    id,
    sourceRows: rows.filter((r) => r.cityId === id).length,
    matched: rows.filter((r) => r.cityId === id && r.status === 'matched').length,
    missing: rows.filter((r) => r.cityId === id && r.status === 'missing').length,
    unresolved: rows.filter((r) => r.cityId === id && r.status === 'unresolved').length,
    motItems: motItems.filter((i) => i.city === id).length,
  }));
  const catMap = new Map();
  for (const row of rows) {
    const k = `${row.cityId ?? ''}|${row.category}`;
    if (!catMap.has(k)) catMap.set(k, { cityId: row.cityId ?? null, category: row.category, sourceRows: 0, matched: 0, missing: 0, unresolved: 0 });
    const e = catMap.get(k); e.sourceRows += 1; e[row.status] += 1;
  }
  const categorySummary = [...catMap.values()].sort((a, b) => byStr(a.cityId ?? '', b.cityId ?? '') || byStr(a.category, b.category));
  const ok = summary.matched === summary.sourceRows && summary.extra === 0 && summary.duplicates === 0 && dedupIssues.length === 0;
  return { version: 1, ok, offline: true, summary, rows, issues: dedupIssues, inputs: reader.list(), cities, categorySummary, limitations: [...new Set(limitations)].sort(byStr), versions: { registryReleaseVersion: str(registry.releaseVersion) ?? null, optimizedContentVersion: str(optimized.contentVersion) ?? null, snapshotDate: str(optimized.snapshotDate) ?? null } };
}

async function cli(argv) {
  const allowed = new Set(['fcc-root', 'mot-public', 'output']);
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`invalid argument: ${flag ?? ''}`);
    const name = flag.slice(2);
    if (!allowed.has(name)) throw new Error(`invalid argument: unknown flag ${flag}`);
    if (Object.prototype.hasOwnProperty.call(args, name)) throw new Error(`invalid argument: duplicate flag ${flag}`);
    args[name] = argv[i + 1];
  }
  const fccRoot = args['fcc-root']; const motPublicRoot = args['mot-public']; const output = args.output;
  if (!fccRoot || !motPublicRoot || !output) throw new Error('usage: --fcc-root PATH --mot-public PATH --output PATH');
  const fccReal = await realpath(fccRoot).catch(() => { throw new Error('missing FCC root: root does not exist'); });
  const motReal = await realpath(motPublicRoot).catch(() => { throw new Error('missing MoT root: root does not exist'); });
  const outParent = await realpath(dirname(resolve(output))).catch(() => { throw new Error('invalid output: parent directory does not exist'); });
  const outFile = join(outParent, basename(output));
  if (inside(fccReal, outFile) || inside(motReal, outFile)) throw new Error('invalid output: report path must be outside both input roots');
  const report = await auditFccCoverage({ fccRoot, motPublicRoot });
  const tmp = join(outParent, `.${basename(output)}.tmp-${process.pid}`);
  let owned = false;
  try {
    await writeFile(tmp, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    owned = true; // only ever remove/rename a temp file this process created
    await rename(tmp, outFile);
  } catch (e) { if (owned) await rm(tmp, { force: true }).catch(() => {}); throw e; }
  process.stdout.write(`${JSON.stringify({ ok: report.ok, ...report.summary })}\n`);
  return report.ok ? 0 : 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  cli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exitCode = 1; });
}
