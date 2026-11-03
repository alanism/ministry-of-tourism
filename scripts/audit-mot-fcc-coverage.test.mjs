import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditFccCoverage } from './audit-mot-fcc-coverage.mjs';

const ORIGIN = 'https://foreignclubberscorespondence.web.app';
const CLI = fileURLToPath(new URL('./audit-mot-fcc-coverage.mjs', import.meta.url));
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

async function makeWorld() {
  const root = await mkdtemp(join(tmpdir(), 'mot-fcc-audit-'));
  const fccRoot = join(root, 'fcc');
  const motPublicRoot = join(root, 'mot');
  const outside = join(root, 'outside');
  await mkdir(fccRoot, { recursive: true });
  await mkdir(motPublicRoot, { recursive: true });
  await mkdir(outside, { recursive: true });
  const put = async (base, rel, data) => {
    const file = join(base, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  };
  return {
    root, fccRoot, motPublicRoot, outside,
    putFcc: (rel, data) => put(fccRoot, rel, data),
    putMot: (rel, data) => put(motPublicRoot, rel, data),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function cityFixture(slug, { fashion, figures, artwork, gallery = [], journalArt = {} } = {}) {
  const catalogCity = { slug, name: cap(slug), country: 'AA' };
  if (fashion) catalogCity.fashion = fashion;
  if (figures) catalogCity.figures = figures;
  if (artwork) catalogCity.artwork = artwork;
  return {
    schema: 'fcc.city-source/1',
    entry: { slug, name: cap(slug), status: 'built', file: `${slug}.html` },
    catalog: { city: catalogCity, places: [] },
    journalArt: { city: slug, ...journalArt },
    gallery,
  };
}

// Empty versions of every optional source are written unless a test opts out,
// so fixtures not concerned with a source never imply it was unavailable.
async function writeFccBase(w, {
  slugs = ['alpha'], registryAssets = [], optimizedFiles = [],
  brushCities = [], artworkMaster, cityArt = {}, magazine, collections = [],
} = {}) {
  await w.putFcc('content/cities/index.json', { schema: 'fcc.city-sources/1', slugs, manifest: 'content/cities/index.json' });
  await w.putFcc('content/assets/registry.json', { schema: 'fcc.asset-registry/1', releaseVersion: 'test-1', assets: registryAssets });
  await w.putFcc('data/optimized-assets-release.json', { contentVersion: 'test-1', snapshotDate: '2026-01-01', files: optimizedFiles });
  const brush = { schema: 'fcc.brush-portraits/1', date: '2026-01-01', cities: brushCities, unchanged: [] };
  if (artworkMaster) brush.artworkMaster = artworkMaster;
  await w.putFcc('data/brush-portraits.json', brush);
  await w.putFcc('data/home-map-wall-release.json', { tshirtCollections: ['mono', 'color'] });
  await w.putFcc('output/prototypes/city-pages/journal/city-art.json', cityArt);
  await w.putFcc('output/prototypes/city-pages/journal/collections.json', { version: 1, collections });
  if (magazine !== null) {
    await w.putFcc('output/magazine-articles/art-registry.json', magazine ?? { version: 1, cities: [] });
  }
}

async function writeCity(w, city) {
  await w.putFcc(`content/cities/${city.entry.slug}/city.json`, city);
}

// journal/bootstrap.js sources: journal/collections.json plus, per collection,
// its declared originals map (e.g. journal/art/SLUG.originals.json).
async function writeBootstrap(w, collections, originalsByRel = {}) {
  await w.putFcc('output/prototypes/city-pages/journal/collections.json', { version: 1, collections });
  for (const [rel, data] of Object.entries(originalsByRel)) {
    await w.putFcc(`output/prototypes/city-pages/journal/${rel}`, data);
  }
}

// MoT crop is normalized [x/W, y/H, width/W, height/H]; thumb/src are the
// HTTPS URLs that artRef.thumbnailUrl/renditionUrl must match exactly.
function motItem({
  id, city = 'alpha', sourceId, originalUrl, crop, kind = 'sticker', category = 'stickers',
  credit = 'Foreign Clubbers Correspondence', rightsStatus = 'unknown', countryCode = 'AA', label,
  originCityId, artKind, artCategory,
}) {
  const thumb = `${ORIGIN}/artwork/fcc/${city}/${id}-thumb.webp`;
  const src = `${ORIGIN}/artwork/fcc/${city}/${id}.webp`;
  const item = {
    id, styleId: 'fcc-editorial', label: label || id, subject: category, city,
    thumb, src, original: originalUrl, width: 100, height: 100,
    artRef: {
      assetId: id, originCityId: originCityId ?? city, countryCode, kind: artKind ?? kind, category: artCategory ?? category,
      credit, rightsStatus, thumbnailUrl: thumb, renditionUrl: src, originalUrl,
      source: { provider: 'fcc', sourceId, cityId: city, countryCode },
    },
  };
  if (crop) item.crop = crop;
  return item;
}

async function writeMot(w, { motCities = [{ id: 'alpha', name: 'Alpha', countryCode: 'AA' }], catalogs = [{ city: 'alpha', items: [] }] } = {}) {
  await w.putMot('fcc/destinations.json', { version: 1, cities: motCities.map((c) => ({ timeZone: 'UTC', ...c })), countries: [{ code: 'AA', name: 'Aland' }] });
  await w.putMot('artwork/index.json', { version: 1, styles: [{ id: 'fcc-editorial', label: 'FCC Editorial', manifest: '/artwork/fcc/manifest.json', credit: 'Foreign Clubbers Correspondence', rightsStatus: 'unknown' }] });
  const shards = catalogs.flatMap((c) => {
    const subjects = [...new Set((c.items ?? []).map((item) => item.subject))];
    if (!subjects.length) subjects.push('stickers');
    return subjects.map((subject) => ({ ...c, subject, items: c.items?.filter((item) => item.subject === subject) }));
  });
  await w.putMot('artwork/fcc/manifest.json', {
    version: 1, styleId: 'fcc-editorial',
    subjects: [...new Set(shards.map((s) => s.subject))].map((id) => ({ id, label: id })),
    cities: motCities.map((c) => ({ id: c.id, label: c.name })),
    catalogs: shards.map((c) => ({ subject: c.subject, city: c.city, url: `/artwork/fcc/${c.city}/${c.subject}.json`, count: c.count ?? (c.items ? c.items.length : 0) })),
    credit: 'Foreign Clubbers Correspondence', rightsStatus: 'unknown',
  });
  for (const c of shards) {
    if (!c.omitShard && c.items) await w.putMot(`artwork/fcc/${c.city}/${c.subject}.json`, { version: 1, styleId: 'fcc-editorial', items: c.items });
  }
}

// Source frames are raw pixels [left, top, right, bottom] on a 10x10 sheet.
const figure = (key, src, extra = {}) => ({ key, label: key, kind: 'object', src, sha256: SHA_A, frame: [0, 0, 10, 10], width: 10, height: 10, ...extra });

test('real catalog shape: style slots, SHA aliases, duplicate artwork crops and relative apparel originals', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, { brushCities: [{ slug: 'alpha', sha256: SHA_C, original: '/assets/tee.png', web: '/assets/tee.webp', thumbnail: '/assets/tee-thumb.webp', width: 100, height: 100 }] });
    const f = figure('alpha-object', '../../illustrations/object.png');
    await writeCity(w, cityFixture('alpha', {
      fashion: { src: '../../illustrations/fashion.png', width: 20, height: 10, sha256: SHA_B, frames: [[0, 0, 10, 10]], slots: ['cafe-woman'] },
      figures: [{ slot: 'cafe-woman', kind: 'style', w: 10, h: 10 }, f],
      artwork: [f],
      journalArt: { name: 'Alpha', palette: ['#ffffff'] },
      gallery: [
        { id: SHA_A, category: 'object', original: '/assets/object-master.png', src: '/assets/object.webp', thumb: '/assets/object-thumb.webp', width: 10, height: 10 },
        { id: SHA_B, category: 'fashion', original: '/assets/fashion-master.png', src: '/assets/fashion.webp', thumb: '/assets/fashion-thumb.webp', width: 20, height: 10 },
      ],
    }));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [
      motItem({ id: 'object', sourceId: SHA_A, originalUrl: `${ORIGIN}/assets/object-master.png`, crop: [0, 0, 1, 1], kind: 'original-art', category: 'objects' }),
      motItem({ id: 'fashion', sourceId: SHA_B, originalUrl: `${ORIGIN}/assets/fashion-master.png`, crop: [0, 0, 0.5, 1], kind: 'original-art', category: 'portraits' }),
      motItem({ id: 'tee', sourceId: SHA_C, originalUrl: `${ORIGIN}/assets/tee.png`, kind: 'apparel-mockup', category: 'apparel' }),
    ] }] });
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    for (const id of ['object', 'fashion', 'tee']) assert.ok(r.rows.some((row) => row.status === 'matched' && row.matchedMotIds.includes(id)), `explicit source identity must account for ${id}`);
    const crops = r.rows.filter((row) => row.crop && row.matchedMotIds.includes('object'));
    assert.equal(crops.length, 1, 'duplicate figures/artwork records are the same crop');
    assert.ok(crops[0].provenance.some((p) => /artwork/.test(p)), 'retain duplicate artwork provenance');
    assert.ok(crops[0].provenance.some((p) => /figures/.test(p)), 'retain figures provenance');
    assert.ok(r.rows.some((row) => !row.frame && !row.crop && row.originalAliases.includes(`${ORIGIN}/assets/fashion-master.png`)), 'published full fashion sheet stays visible separately from its crop');
  } finally { await w.cleanup(); }
});

test('tile order and registry relative renditions do not create false gaps', async () => {
  const w = await makeWorld();
  try {
    const record = { id: 'gal', category: 'city-illustrations', src: '/assets/gal.webp', thumb: '/assets/gal-thumb.webp', original: '/assets/gal.png', width: 10, height: 10 };
    const optimizedFiles = [240, 800, 1200].map((size) => ({ path: `/assets/home-map-wall-v2/tiles/mono/${size}/alpha.webp`, sha256: size === 1200 ? SHA_C : SHA_A, bytes: size }));
    const registryAssets = [{ id: 'gal-thumb', url: '/assets/gal-thumb.webp', release: { sha256: SHA_B }, uses: [{ city: 'alpha', scope: 'gallery', pointer: '/gallery/0/thumb' }] }];
    await writeFccBase(w, { optimizedFiles, registryAssets });
    await writeCity(w, cityFixture('alpha', { gallery: [record] }));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [
      motItem({ id: 'tee', sourceId: SHA_C, originalUrl: `${ORIGIN}/assets/home-map-wall-v2/tiles/mono/1200/alpha.webp`, kind: 'apparel-mockup', category: 'apparel' }),
      motItem({ id: 'gal', sourceId: 'gal', originalUrl: `${ORIGIN}/assets/gal.png`, kind: 'original-art', category: 'city-illustrations' }),
    ] }] });
    const a = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.equal(a.summary.sourceRows, 2, 'a known thumbnail is not an unresolved extra design');
    assert.equal(a.summary.matched, 2);
    await writeFccBase(w, { optimizedFiles: [...optimizedFiles].reverse(), registryAssets });
    const b = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.deepEqual(b.rows, a.rows, 'largest explicit rendition selection is independent of input order');
  } finally { await w.cleanup(); }
});

test('unprovable crop remains unresolved and known source rights are retained', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { figures: [figure('unknown-size', 'art/unknown.png', { width: undefined, height: undefined, credit: 'Actual source artist', rightsStatus: 'restricted' })] }));
    await writeMot(w);
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.equal(r.rows[0].status, 'unresolved');
    assert.equal(r.rows[0].credit, 'Actual source artist');
    assert.equal(r.rows[0].rightsStatus, 'restricted');
    assert.deepEqual(r.rows[0].frame, [0, 0, 10, 10]);
    assert.equal(r.rows[0].crop, undefined);
  } finally { await w.cleanup(); }
});

test('outside-city gallery and malformed records cannot disappear from the denominator', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, { cityArt: { omega: [{ id: 'outside', src: '/outside.webp', original: '/outside.png' }] } });
    await writeCity(w, cityFixture('alpha'));
    await writeMot(w);
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.ok(r.rows.some((row) => row.cityId === 'omega' && row.status === 'unresolved'));
    await writeCity(w, cityFixture('alpha', { gallery: [null] }));
    await assert.rejects(() => auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot }), /malformed|invalid|schema/i);
  } finally { await w.cleanup(); }
});

test('explicit null journal slots and later source rights remain visible', async () => {
  const w = await makeWorld();
  try {
    const art = { id: 'policy-art', category: 'city-illustrations', original: '/policy.png', src: '/policy.webp', thumb: '/policy-thumb.webp', width: 10, height: 10 };
    await writeFccBase(w, { cityArt: { alpha: [{ ...art, credit: 'Actual artist', rightsStatus: 'restricted' }] } });
    await writeCity(w, cityFixture('alpha', { gallery: [art], journalArt: { 'city-ink': null } }));
    await writeMot(w);
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    const slot = r.rows.find((row) => row.category === 'city-ink');
    assert.ok(slot && slot.status === 'unresolved' && /unavailable|empty|null/i.test(slot.reason));
    const policy = r.rows.find((row) => row.sourceId === 'policy-art');
    assert.equal(policy.rightsStatus, 'restricted');
    assert.equal(policy.credit, 'Actual artist');
  } finally { await w.cleanup(); }
});

test('invalid MoT artRef identity cannot count as a coverage match', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { figures: [figure('fig', 'one.png')] }));
    const item = motItem({ id: 'good-id', sourceId: 'fig', originalUrl: `${ORIGIN}/output/prototypes/city-pages/one.png`, crop: [0, 0, 1, 1] });
    item.artRef.assetId = 'different-id';
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [item] }] });
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.equal(r.summary.matched, 0);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => /assetId|identity/i.test(i.message)));
  } finally { await w.cleanup(); }
});

test('inline image locators remain unresolved without copying payloads into the report', async () => {
  const w = await makeWorld();
  try {
    const inline = 'data:image/png;base64,' + 'A'.repeat(20_000);
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { fashion: { src: inline, width: 10, height: 10, frames: [[0, 0, 10, 10]], slots: ['one'] } }));
    await writeBootstrap(w, [{ id: 'alpha', type: 'city', city: 'alpha', originals: 'art/alpha.originals.json', stickers: [{ index: 0, key: 'figure-0', src: 'art/alpha/0.webp' }] }], { 'art/alpha.originals.json': { assets: [inline], frames: [{ asset: 0, frame: [0, 0, 10, 10] }] } });
    await writeMot(w);
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes('A'.repeat(100)), 'inline payload is never copied to rows, aliases or errors');
    assert.ok(serialized.length < 20_000, 'report must not amplify inline payloads');
    assert.ok(/inline/.test(serialized));
    assert.equal(r.summary.matched, 0);
    assert.ok(r.summary.unresolved > 0);
  } finally { await w.cleanup(); }
});

test('valid alternative crop roles are coverage gaps, not invalid-origin issues', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', {
      figures: [figure('scene', '../../illustrations/scene.png', { kind: 'scene', frame: [0, 0, 5, 10] })],
      gallery: [{ id: SHA_A, category: 'city-illustrations', original: '/scene.png', src: '/scene.webp', width: 10, height: 10 }],
    }));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [motItem({ id: 'scene', sourceId: SHA_A, originalUrl: `${ORIGIN}/scene.png`, crop: [0, 0, 0.5, 1], kind: 'original-art', category: 'people' })] }] });
    const r = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assert.equal(r.summary.matched, 1);
    assert.equal(r.summary.missing, 1, 'full sheet is separately uncovered');
    assert.ok(!r.issues.some((i) => i.code === 'origin-role-mismatch'), 'different crop identity is not a malformed origin/role');
  } finally { await w.cleanup(); }
});

function assertPartition(report) {
  assert.equal(report.version, 1);
  assert.equal(report.offline, true);
  assert.equal(report.summary.sourceRows, report.rows.length);
  const by = { matched: 0, missing: 0, unresolved: 0 };
  for (const row of report.rows) by[row.status] += 1;
  assert.equal(by.matched, report.summary.matched);
  assert.equal(by.missing, report.summary.missing);
  assert.equal(by.unresolved, report.summary.unresolved);
  assert.equal(by.matched + by.missing + by.unresolved, report.rows.length);
  for (const row of report.rows) {
    for (const v of Object.values(row.eligibility)) assert.equal(typeof v, 'string', 'eligibility must use explicit strings, never a boolean');
  }
}

test('matches a city outside any familiar sample, with provenance and honest eligibility', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, { slugs: ['zeta'], magazine: null });
    await writeCity(w, cityFixture('zeta', { figures: [figure('fig-zeta', 'stickers/zeta.png')] }));
    const originalUrl = `${ORIGIN}/output/prototypes/city-pages/stickers/zeta.png`;
    await writeMot(w, {
      motCities: [{ id: 'zeta', name: 'Zeta', countryCode: 'AA' }],
      catalogs: [{ city: 'zeta', items: [motItem({ id: 'mot-zeta-1', city: 'zeta', sourceId: 'fig-zeta', originalUrl, crop: [0, 0, 1, 1] })] }],
    });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.ok, true);
    assert.deepEqual(
      { sourceRows: report.summary.sourceRows, motItems: report.summary.motItems, matched: report.summary.matched, missing: report.summary.missing, unresolved: report.summary.unresolved, extra: report.summary.extra, duplicates: report.summary.duplicates },
      { sourceRows: 1, motItems: 1, matched: 1, missing: 0, unresolved: 0, extra: 0, duplicates: 0 },
    );
    const row = report.rows[0];
    assert.equal(row.cityId, 'zeta');
    assert.equal(row.sourceId, 'fig-zeta');
    assert.equal(row.status, 'matched');
    assert.deepEqual(row.matchedMotIds, ['mot-zeta-1']);
    assert.equal(row.originalUrl, originalUrl);
    assert.deepEqual(row.frame, [0, 0, 10, 10], 'raw source frame is preserved separately');
    assert.deepEqual(row.crop, [0, 0, 1, 1], 'full 10x10 frame normalizes to [0,0,1,1]');
    assert.equal(row.sha256, SHA_A);
    assert.equal(row.credit, 'Foreign Clubbers Correspondence');
    assert.equal(row.rightsStatus, 'unknown');
    assert.equal(row.eligibility.embed, 'unresolved', 'unknown embedding permission stays unresolved, distinct from credited sharing');
    assert.ok(report.limitations.some((x) => /magazine/i.test(x) && /unavailable|absent|not present/i.test(x)), 'absent optional magazine source must be reported, not silently treated as a full universe');
    assert.ok(report.inputs.length > 0 && report.inputs.every((i) => /^[0-9a-f]{64}$/.test(i.sha256) && Number.isInteger(i.bytes)));
  } finally { await w.cleanup(); }
});

test('renditions and the gallery/city-art copy of one record do not inflate design counts', async () => {
  const w = await makeWorld();
  try {
    const record = { id: 'gal-1', category: 'city-illustrations', label: 'Gal One', src: 'art/gal-1.webp', thumb: 'art/gal-1-thumb.webp', original: 'art/gal-1.png', width: 100, height: 80 };
    await writeFccBase(w, {
      cityArt: { alpha: [record] },
      optimizedFiles: [
        { path: '/art/gal-1.webp', sha256: SHA_A, bytes: 10 },
        { path: '/art/gal-1-thumb.webp', sha256: SHA_B, bytes: 5 },
        { path: '/art/gal-1.png', sha256: SHA_C, bytes: 20 },
      ],
    });
    await writeCity(w, cityFixture('alpha', { gallery: [record] }));
    const originalUrl = `${ORIGIN}/output/prototypes/city-pages/journal/art/gal-1.png`;
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [motItem({ id: 'mot-gal-1', sourceId: 'gal-1', originalUrl, kind: 'original-art', category: 'city-illustrations' })] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.summary.sourceRows, 1, 'thumb/src/original renditions and the duplicated city-art copy are one source design');
    assert.equal(report.summary.matched, 1);
    assert.equal(report.ok, true);
  } finally { await w.cleanup(); }
});

test('a fashion sheet matched for one exact crop slot does not prove the other slot', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    const fashion = { src: 'sheets/alpha-fashion.png', width: 20, height: 10, sha256: SHA_B, frames: [[0, 0, 10, 10], [10, 0, 20, 10]], slots: ['left', 'right'] };
    await writeCity(w, cityFixture('alpha', { fashion }));
    const originalUrl = `${ORIGIN}/output/prototypes/city-pages/sheets/alpha-fashion.png`;
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [motItem({ id: 'mot-fashion-left', sourceId: 'alpha-fashion', originalUrl, crop: [0, 0, 0.5, 1], kind: 'original-art', category: 'portraits' })] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.summary.sourceRows, 2);
    assert.equal(report.summary.matched, 1);
    assert.equal(report.summary.missing + report.summary.unresolved, 1);
    assert.equal(report.ok, false);
    const matched = report.rows.find((r) => r.status === 'matched');
    assert.deepEqual(matched.frame, [0, 0, 10, 10]);
    assert.deepEqual(matched.crop, [0, 0, 0.5, 1], 'left half of a 20x10 sheet');
    const gap = report.rows.find((r) => r.status !== 'matched');
    assert.deepEqual(gap.frame, [10, 0, 20, 10], 'gap preserves the raw uncovered frame');
    assert.deepEqual(gap.crop, [0.5, 0, 0.5, 1], 'gap identifies the exact uncovered normalized crop');
    assert.equal(gap.originalUrl, originalUrl);
  } finally { await w.cleanup(); }
});

test('relative sticker paths resolve once, and a crop derivative does not match its full source sheet', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    const sheet = { id: 'sheet-1', category: 'city-illustrations', label: 'Full sheet', src: 'sheets/full.webp', thumb: 'sheets/full-thumb.webp', original: 'sheets/full.png', width: 100, height: 100 };
    await writeCity(w, cityFixture('alpha', { figures: [figure('fig-1', 'stickers/one.png')], gallery: [sheet] }));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [
      motItem({ id: 'mot-fig-1', sourceId: 'fig-1', originalUrl: `${ORIGIN}/output/prototypes/city-pages/stickers/one.png`, crop: [0, 0, 1, 1] }),
      motItem({ id: 'mot-sheet-crop', sourceId: 'sheet-1', originalUrl: `${ORIGIN}/output/prototypes/city-pages/journal/sheets/full.png`, crop: [0, 0, 0.5, 0.5], kind: 'original-art', category: 'city-illustrations' }),
    ] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    const figRow = report.rows.find((r) => r.sourceId === 'fig-1');
    assert.equal(figRow.status, 'matched');
    assert.equal(figRow.originalUrl, `${ORIGIN}/output/prototypes/city-pages/stickers/one.png`, 'catalog paths resolve once against city-pages, never double-prefixed');
    const sheetRow = report.rows.find((r) => r.sourceId === 'sheet-1');
    assert.ok(sheetRow, 'the full sheet itself must never be silently omitted');
    assert.notEqual(sheetRow.status, 'matched', 'a cropped derivative is related provenance, not interchangeable with the sheet: distinct identities');
    assert.ok(sheetRow.reason || report.issues.length > 0, 'sheet/derivative discoverability difference must be explained');
  } finally { await w.cleanup(); }
});

test('brush portraits and home-map tiles are apparel, while only an explicit artwork master is original art', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, {
      brushCities: [{ slug: 'alpha', name: 'Alpha', sha256: SHA_A, original: 'https://example.invalid/alpha-tee.png', web: '/alpha-tee.webp', thumbnail: '/alpha-tee-thumb.webp', width: 100, height: 100 }],
      artworkMaster: { original: 'https://example.invalid/master.png', web: '/master.webp', thumbnail: '/master-thumb.webp', sha256: SHA_B, width: 200, height: 100 },
      optimizedFiles: [400, 800, 1200].map((s) => ({ path: `/assets/home-map-wall-v2/tiles/mono/${s}/alpha.webp`, sha256: SHA_C, bytes: s })),
    });
    await writeCity(w, cityFixture('alpha'));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [motItem({ id: 'mot-tee-1', sourceId: 'alpha', originalUrl: 'https://example.invalid/alpha-tee.png', kind: 'apparel-mockup', category: 'apparel' })] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    const apparel = report.rows.filter((r) => r.kind === 'apparel-mockup');
    assert.ok(apparel.length >= 1, 'brush-portrait city must be classified as apparel, not flat art');
    assert.ok(apparel.some((r) => r.category === 'apparel' && r.status === 'matched'), 'garment matches only an apparel-mockup/apparel MoT item');
    assert.ok(apparel.every((r) => !/400|800|1200/.test(String(r.sourceId))), 'tile sizes are renditions of a family, not separate designs');
    assert.ok(!report.rows.some((r) => r.kind === 'original-art' && r.sourceId === 'alpha'), 'an apparel portrait must not be relabelled original art');
    const master = report.rows.find((r) => r.kind === 'original-art');
    assert.ok(master, 'explicit artworkMaster must be visible');
    assert.equal(master.status, 'unresolved', 'artwork master without a provable source city stays unresolved; no guessed city');
  } finally { await w.cleanup(); }
});

test('registry catch-all: unaccounted uses, outside-city uses and magazine records remain visible', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, {
      registryAssets: [{
        id: 'asset-mystery', url: 'https://example.invalid/mystery.png', local: '../../outside-secret.png',
        release: { sha256: SHA_A, bytes: 12 }, availability: 'local-and-release',
        uses: [
          { city: 'alpha', scope: 'catalog', pointer: '/city/unknown/src' },
          { city: 'omega', scope: 'gallery', pointer: '/gallery/0/src' },
        ],
      }],
      magazine: { version: 1, cities: [{ slug: 'alpha', sections: { cafe: [{ type: 'art', src: 'mag/cafe.webp', thumb: 'mag/cafe-thumb.webp', width: 10, height: 10, source: 'editorial', referencePermissions: 'unknown' }] } }] },
    });
    await writeCity(w, cityFixture('alpha'));
    await writeMot(w);
    // Resolving at all also proves the untrusted local path outside the FCC root was not followed.
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.ok, false);
    assert.ok(report.rows.some((r) => r.status === 'unresolved' && /asset-mystery|\/city\/unknown\/src/.test(JSON.stringify(r))), 'an unrecognized canonical-family registry use must not vanish');
    assert.ok(report.rows.some((r) => r.status === 'unresolved' && /omega/.test(JSON.stringify(r))), 'a use for an undeclared city must be reported as a gap');
    assert.ok(report.rows.some((r) => r.status !== 'matched' && /mag\/cafe/.test(JSON.stringify(r))), 'available magazine-registry records are enumerated, not silently omitted');
    assert.ok(report.issues.some((i) => /registry|undeclared|unaccounted|outside/i.test(`${i.code} ${i.message}`)));
  } finally { await w.cleanup(); }
});

test('manifest count mismatch and a missing referenced shard are reported gaps, not success', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha'));
    await writeMot(w, {
      motCities: [{ id: 'alpha', name: 'Alpha', countryCode: 'AA' }, { id: 'beta', name: 'Beta', countryCode: 'AA' }],
      catalogs: [
        { city: 'alpha', count: 2, items: [motItem({ id: 'mot-extra', sourceId: 'no-such-source', originalUrl: `${ORIGIN}/x.png` })] },
        { city: 'beta', count: 1, omitShard: true },
      ],
    });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.ok, false);
    assert.equal(report.summary.motItems, 1);
    assert.ok(report.issues.some((i) => /count/i.test(`${i.code} ${i.message}`)), 'declared count vs actual shard items must be flagged');
    assert.ok(report.issues.some((i) => /shard|missing/i.test(`${i.code} ${i.message}`)), 'failure to load a declared shard is not successful coverage');
  } finally { await w.cleanup(); }
});

test('duplicate MoT identity is counted and blocks ok', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { figures: [figure('fig-1', 'stickers/one.png')] }));
    const dup = motItem({ id: 'mot-dup', sourceId: 'fig-1', originalUrl: `${ORIGIN}/output/prototypes/city-pages/stickers/one.png`, crop: [0, 0, 1, 1] });
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [dup, { ...dup }] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.ok, false);
    assert.ok(report.summary.duplicates >= 1);
    assert.ok(report.issues.some((i) => /duplicate/i.test(`${i.code} ${i.message}`)));
  } finally { await w.cleanup(); }
});

test('rights/credit stay truthful and origin or role mismatch never matches on a weak label', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { figures: [figure('fig-1', 'stickers/one.png'), figure('fig-2', 'stickers/two.png', { sha256: SHA_B })] }));
    const url = (n) => `${ORIGIN}/output/prototypes/city-pages/stickers/${n}.png`;
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [
      motItem({ id: 'mot-fig-1', sourceId: 'fig-1', originalUrl: url('one'), crop: [0, 0, 1, 1], credit: 'F. Clubber', rightsStatus: 'restricted' }),
      // Same label/original as fig-2 but wrong origin city and wrong role.
      motItem({ id: 'mot-fig-2-wrong', sourceId: 'fig-2', originalUrl: url('two'), crop: [0, 0, 1, 1], label: 'fig-2', originCityId: 'zeta', artKind: 'original-art', artCategory: 'city-illustrations' }),
    ] }] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    const row = report.rows.find((r) => r.sourceId === 'fig-1');
    assert.equal(row.status, 'matched', 'credited unknown/restricted art is not erased by policy');
    assert.equal(row.credit, 'F. Clubber');
    assert.equal(row.rightsStatus, 'restricted');
    assert.notEqual(row.rightsStatus, 'licensed');
    assert.notEqual(row.license, 'licensed');
    assert.equal(row.eligibility.embed, 'unresolved');
    const wrong = report.rows.find((r) => r.sourceId === 'fig-2');
    assert.notEqual(wrong.status, 'matched', 'origin/role mismatch must not match by label alone');
    assert.ok(report.issues.some((i) => /origin|role|kind|mismatch/i.test(`${i.code} ${i.message}`)));
  } finally { await w.cleanup(); }
});

test('missing roots, unsafe slugs, malformed JSON and oversized bounded files fail clearly', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w, { slugs: ['../escape'] });
    await writeMot(w);
    await assert.rejects(() => auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot }), /unsafe|traversal|slug|invalid/i);
    await assert.rejects(() => auditFccCoverage({ fccRoot: join(w.root, 'does-not-exist'), motPublicRoot: w.motPublicRoot }), /missing|not exist|no such|invalid|ENOENT/i);
    await writeFccBase(w);
    await w.putFcc('content/cities/alpha/city.json', '{not json');
    await assert.rejects(() => auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot }), /invalid|json|parse|malformed/i);
    // The real snapshot's largest city is 2,512,419 bytes: bounded support is 4 MiB.
    await w.putFcc('content/cities/alpha/city.json', JSON.stringify({ schema: 'fcc.city-source/1', padding: 'x'.repeat(5_000_000) }));
    await assert.rejects(() => auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot }), /too large|size|limit|bounded|exceed/i);
  } finally { await w.cleanup(); }
});

test('logical results are order-independent, raw input digests are not, and byte-identical copies are location-independent', async () => {
  async function build(reverse) {
    const w = await makeWorld();
    const slugs = reverse ? ['beta', 'alpha'] : ['alpha', 'beta'];
    const assets = [
      { id: 'asset-1', url: 'https://example.invalid/1.png', local: 'a.png', release: { sha256: SHA_A, bytes: 1 }, availability: 'local-and-release', uses: [{ city: 'alpha', scope: 'catalog', pointer: '/city/unknown/one' }] },
      { id: 'asset-2', url: 'https://example.invalid/2.png', local: 'b.png', release: { sha256: SHA_B, bytes: 2 }, availability: 'local-and-release', uses: [{ city: 'beta', scope: 'catalog', pointer: '/city/unknown/two' }] },
    ];
    if (reverse) assets.reverse();
    const files = [{ path: '/a.webp', sha256: SHA_A, bytes: 1 }, { path: '/b.webp', sha256: SHA_B, bytes: 2 }];
    if (reverse) files.reverse();
    await writeFccBase(w, { slugs, registryAssets: assets, optimizedFiles: files });
    for (const slug of ['alpha', 'beta']) await writeCity(w, cityFixture(slug, { figures: [figure(`fig-${slug}`, `stickers/${slug}.png`)] }));
    const itemsFor = (slug) => [motItem({ id: `mot-${slug}`, city: slug, sourceId: `fig-${slug}`, originalUrl: `${ORIGIN}/output/prototypes/city-pages/stickers/${slug}.png`, crop: [0, 0, 1, 1] })];
    await writeMot(w, {
      motCities: [{ id: 'alpha', name: 'Alpha', countryCode: 'AA' }, { id: 'beta', name: 'Beta', countryCode: 'AA' }],
      catalogs: [{ city: 'alpha', items: itemsFor('alpha') }, { city: 'beta', items: itemsFor('beta') }],
    });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    return { w, report };
  }
  const a = await build(false);
  const b = await build(true);
  const c = await build(false);
  try {
    assertPartition(a.report);
    assert.ok(a.report.inputs.every((i) => !i.path.startsWith('/') && !i.path.includes(a.w.root) && !i.path.includes('\\')), 'input paths must be canonical relative paths, not absolute fixture locations');
    const logical = (r) => ({ rows: r.rows, summary: r.summary, issues: r.issues, cities: r.cities });
    assert.deepEqual(logical(b.report), logical(a.report), 'logical rows/summary/issues/cities are identical across input order');
    assert.notDeepEqual(b.report.inputs, a.report.inputs, 'sha256 hashes exact raw bytes: shuffling input arrays changes raw file digests, and that evidence must not be normalized away');
    assert.deepEqual(c.report, a.report, 'byte-identical fixtures copied to a different root produce the identical complete report');
  } finally { await a.w.cleanup(); await b.w.cleanup(); await c.w.cleanup(); }
});

test('CLI writes the report outside the input roots and exits 2 when the completed audit has gaps', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { gallery: [{ id: 'gal-missing', category: 'city-illustrations', label: 'Missing', src: 'art/m.webp', thumb: 'art/m-thumb.webp', original: 'art/m.png', width: 10, height: 10 }] }));
    await writeMot(w);
    const output = join(w.outside, 'report.json');
    const run = spawnSync(process.execPath, [CLI, '--fcc-root', w.fccRoot, '--mot-public', w.motPublicRoot, '--output', output], { encoding: 'utf8' });
    assert.equal(run.status, 2, `expected exit 2 for a completed audit with gaps; stdout=${run.stdout} stderr=${run.stderr}`);
    const parsed = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.summary.missing + parsed.summary.unresolved, 1);
    const inside = spawnSync(process.execPath, [CLI, '--fcc-root', w.fccRoot, '--mot-public', w.motPublicRoot, '--output', join(w.fccRoot, 'report.json')], { encoding: 'utf8' });
    assert.equal(inside.status, 1, 'a report path inside an input root must be rejected with exit 1');
  } finally { await w.cleanup(); }
});

test('an unreferenced shard file cannot satisfy a missing manifest item', async () => {
  const w = await makeWorld();
  try {
    await writeFccBase(w);
    await writeCity(w, cityFixture('alpha', { figures: [figure('fig-1', 'stickers/one.png')] }));
    await writeMot(w, { catalogs: [{ city: 'alpha', items: [] }] });
    await w.putMot('artwork/fcc/alpha/unreferenced.json', { version: 1, styleId: 'fcc-editorial', items: [motItem({ id: 'mot-hidden', sourceId: 'fig-1', originalUrl: `${ORIGIN}/output/prototypes/city-pages/stickers/one.png`, crop: [0, 0, 1, 1] })] });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.summary.matched, 0);
    assert.equal(report.summary.missing, 1);
    assert.equal(report.ok, false);
  } finally { await w.cleanup(); }
});

test('journal bootstrap derivatives and originals: provable crops, unresolved unknowns, and unsafe references', async () => {
  const w = await makeWorld();
  try {
    const slugs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    await writeFccBase(w, { slugs });
    // Sheet dimensions for alpha are provable from matching catalog fashion metadata (10x10).
    await writeCity(w, cityFixture('alpha', { fashion: { src: '../../illustrations/sheet.png', width: 10, height: 10, sha256: SHA_A, frames: [[0, 0, 10, 10]], slots: ['figure-0'] } }));
    for (const slug of ['beta', 'gamma', 'delta', 'epsilon']) await writeCity(w, cityFixture(slug));
    const sticker = (city, key = 'figure-0') => ({ index: 0, key, label: key, kind: 'object', slot: 'cafe-woman', w: 206, h: 520, src: `art/${city}/0.webp` });
    await writeBootstrap(w, [
      { id: 'alpha', name: 'Alpha', type: 'city', city: 'alpha', originals: 'art/alpha.originals.json', stickers: [sticker('alpha')] },
      { id: 'beta', name: 'Beta', type: 'city', city: 'beta', originals: 'art/beta.originals.json', stickers: [sticker('beta')] },
      { id: 'gamma', name: 'Gamma', type: 'city', city: 'gamma', originals: 'art/gamma.originals.json', stickers: [sticker('gamma')] },
      { id: 'delta', name: 'Delta', type: 'city', city: 'delta', originals: 'art/delta.originals.json', stickers: [sticker('delta')] },
      { id: 'epsilon', name: 'Epsilon', type: 'city', city: 'epsilon', originals: 'escape/epsilon.originals.json', stickers: [sticker('epsilon')] },
      { id: 'world', name: 'World', type: 'world', originals: 'art/alpha.originals.json', stickers: [{ ...sticker('alpha'), key: 'world-0' }] },
    ], {
      'art/alpha.originals.json': { assets: ['../../illustrations/sheet.png'], frames: [{ asset: 0, frame: [0, 0, 10, 10] }] },
      'art/beta.originals.json': { assets: ['../../illustrations/beta-sheet.png'], frames: [{ asset: 0, frame: [0, 0, 5, 5] }] },
      'art/gamma.originals.json': { assets: ['../../../../outside-secret.png'], frames: [{ asset: 0, frame: [0, 0, 10, 10] }] },
      // delta originals deliberately not written: a declared source that fails to load.
    });
    // epsilon's originals map is a symlink escaping the FCC root; it must be read safely, never followed.
    const secret = join(w.outside, 'epsilon.originals.json');
    await writeFile(secret, JSON.stringify({ assets: ['../../illustrations/sheet.png'], frames: [{ asset: 0, frame: [0, 0, 10, 10] }] }));
    // Windows junctions exercise the same realpath escape without symlink privileges.
    await symlink(w.outside, join(w.fccRoot, 'output/prototypes/city-pages/journal/escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const sheetUrl = `${ORIGIN}/output/illustrations/sheet.png`;
    await writeMot(w, {
      motCities: slugs.map((id) => ({ id, name: cap(id), countryCode: 'AA' })),
      catalogs: [
        { city: 'alpha', items: [motItem({ id: 'mot-alpha-0', city: 'alpha', sourceId: 'figure-0', originalUrl: sheetUrl, crop: [0, 0, 1, 1] })] },
        ...['beta', 'gamma', 'delta', 'epsilon'].map((city) => ({ city, items: [] })),
      ],
    });
    const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });
    assertPartition(report);
    assert.equal(report.ok, false);
    const alpha = report.rows.find((r) => r.cityId === 'alpha' && r.sourceId === 'figure-0');
    assert.equal(alpha.status, 'matched');
    assert.equal(alpha.derivativeUrl, `${ORIGIN}/output/prototypes/city-pages/journal/art/alpha/0.webp`, 'derivative src resolves at the journal base');
    assert.equal(alpha.originalUrl, sheetUrl, 'original asset resolves at the city-pages catalog source base: a different base');
    assert.deepEqual(alpha.frame, [0, 0, 10, 10], 'raw source frame retained');
    assert.deepEqual(alpha.crop, [0, 0, 1, 1], 'normalized crop retained when sheet dimensions are provable');
    const beta = report.rows.find((r) => r.cityId === 'beta' && r.sourceId === 'figure-0');
    assert.equal(beta.status, 'unresolved', 'dimensions absent: do not guess, do not bulk-read images');
    assert.deepEqual(beta.frame, [0, 0, 5, 5], 'raw frame is preserved even when unresolved');
    assert.equal(beta.crop, undefined);
    assert.equal(beta.originalUrl, `${ORIGIN}/output/illustrations/beta-sheet.png`);
    const gamma = report.rows.find((r) => r.cityId === 'gamma');
    assert.equal(gamma.status, 'unresolved', 'malicious originals reference is contained, never followed');
    assert.ok(report.issues.some((i) => /traversal|containment|unsafe|escape/i.test(`${i.code} ${i.message}`)));
    const delta = report.rows.find((r) => r.cityId === 'delta');
    assert.ok(delta && delta.status === 'unresolved', 'a declared originals map that fails to load is a visible gap, not successful coverage or a silently omitted record');
    assert.ok(report.issues.some((i) => /missing|originals|load/i.test(`${i.code} ${i.message}`)));
    const epsilon = report.rows.find((r) => r.cityId === 'epsilon');
    assert.ok(epsilon && epsilon.status !== 'matched', 'a symlink escaping the root must not satisfy coverage');
    assert.ok(report.issues.some((i) => /symlink|containment|escape|unsafe/i.test(`${i.code} ${i.message}`)));
    const world = report.rows.find((r) => /world/.test(JSON.stringify(r)));
    assert.ok(world && world.status === 'unresolved', 'non-city/world collections retain an unresolved origin; none is manufactured');
  } finally { await w.cleanup(); }
});
