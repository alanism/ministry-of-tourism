import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { auditFccCoverage } from './audit-mot-fcc-coverage.mjs';

const ORIGIN = 'https://foreignclubberscorespondence.web.app';

async function makeWorld() {
  const root = await mkdtemp(join(tmpdir(), 'mot-fcc-audit-'));
  const fccRoot = join(root, 'fcc');
  const motPublicRoot = join(root, 'mot');
  await mkdir(fccRoot, { recursive: true });
  await mkdir(motPublicRoot, { recursive: true });
  const put = async (base, rel, data) => {
    const file = join(base, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  };
  return {
    root,
    fccRoot,
    motPublicRoot,
    putFcc: (rel, data) => put(fccRoot, rel, data),
    putMot: (rel, data) => put(motPublicRoot, rel, data),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function cityFixture(slug) {
  return {
    schema: 'fcc.city-source/1',
    entry: { slug, name: cap(slug), status: 'built', file: `${slug}.html` },
    catalog: { city: { slug, name: cap(slug), country: 'AA' }, places: [] },
    journalArt: { city: slug },
    gallery: [],
  };
}

async function writeFccBase(w, { magazine } = {}) {
  await w.putFcc('content/cities/index.json', { schema: 'fcc.city-sources/1', slugs: ['alpha'], manifest: 'content/cities/index.json' });
  await w.putFcc('content/assets/registry.json', { schema: 'fcc.asset-registry/1', releaseVersion: 'test-1', assets: [] });
  await w.putFcc('data/optimized-assets-release.json', { contentVersion: 'test-1', snapshotDate: '2026-01-01', files: [] });
  await w.putFcc('data/brush-portraits.json', { schema: 'fcc.brush-portraits/1', date: '2026-01-01', cities: [], unchanged: [] });
  await w.putFcc('data/home-map-wall-release.json', { tshirtCollections: ['mono', 'color'] });
  await w.putFcc('output/prototypes/city-pages/journal/city-art.json', {});
  await w.putFcc('output/prototypes/city-pages/journal/collections.json', { version: 1, collections: [] });
  await w.putFcc('output/magazine-articles/art-registry.json', magazine ?? { version: 1, cities: [] });
  await w.putFcc('content/cities/alpha/city.json', cityFixture('alpha'));
}

function motItem({ id, city = 'alpha', sourceId, originalUrl, crop, kind = 'original-art', category = 'restaurants' }) {
  const thumb = `${ORIGIN}/artwork/fcc/${city}/${id}-thumb.webp`;
  const src = `${ORIGIN}/artwork/fcc/${city}/${id}.webp`;
  const item = {
    id,
    styleId: 'fcc-editorial',
    label: id,
    subject: category,
    city,
    thumb,
    src,
    original: originalUrl,
    width: 100,
    height: 100,
    artRef: {
      assetId: id,
      originCityId: city,
      countryCode: 'AA',
      kind,
      category,
      credit: 'Foreign Clubbers Correspondence',
      rightsStatus: 'unknown',
      thumbnailUrl: thumb,
      renditionUrl: src,
      originalUrl,
      source: { provider: 'fcc', sourceId, cityId: city, countryCode: 'AA' },
    },
  };
  if (crop) item.crop = crop;
  return item;
}

async function writeMot(w, { candidateCity = 'alpha', items = [] } = {}) {
  const motCities = [
    { id: 'alpha', name: 'Alpha', countryCode: 'AA', timeZone: 'UTC' },
    { id: 'beta', name: 'Beta', countryCode: 'AA', timeZone: 'UTC' },
  ];
  await w.putMot('fcc/destinations.json', { version: 1, cities: motCities, countries: [{ code: 'AA', name: 'Aland' }] });
  await w.putMot('artwork/index.json', { version: 1, styles: [{ id: 'fcc-editorial', label: 'FCC Editorial', manifest: '/artwork/fcc/manifest.json', credit: 'Foreign Clubbers Correspondence', rightsStatus: 'unknown' }] });
  const subjects = [...new Set(items.map((item) => item.subject))];
  if (!subjects.length) subjects.push('stickers');
  const shards = subjects.map((subject) => ({ subject, city: candidateCity, items: items.filter((item) => item.subject === subject) }));
  await w.putMot('artwork/fcc/manifest.json', {
    version: 1,
    styleId: 'fcc-editorial',
    subjects: subjects.map((id) => ({ id, label: id })),
    cities: motCities.map((c) => ({ id: c.id, label: c.name })),
    catalogs: shards.map((c) => ({ subject: c.subject, city: c.city, url: `/artwork/fcc/${c.city}/${c.subject}.json`, count: c.items.length })),
    credit: 'Foreign Clubbers Correspondence',
    rightsStatus: 'unknown',
  });
  for (const c of shards) {
    await w.putMot(`artwork/fcc/${c.city}/${c.subject}.json`, { version: 1, styleId: 'fcc-editorial', items: c.items });
  }
}

// Each case has exactly one magazine source row (city alpha, no gallery,
// fashion or figures sources) and exactly one MoT candidate. The magazine
// credit/rights are deliberately stronger than the MoT candidate's, so a
// match must retain the source policy rather than the candidate's.
// The existing normCategory mapping is restaurant -> restaurants and
// hotel -> hotels, so expectedCategory is plural for those source types.
const CASES = [
  {
    name: 'restaurant type under food section matches MoT restaurants',
    section: 'food',
    entry: { type: 'restaurant' },
    file: 'dish.jpg',
    candidate: { kind: 'original-art', category: 'restaurants' },
    expectedCategory: 'restaurants',
    matched: true,
  },
  {
    name: 'hotel type under feature-two section matches MoT hotels',
    section: 'feature-two',
    entry: { type: 'hotel' },
    file: 'hotel.jpg',
    candidate: { kind: 'original-art', category: 'hotels' },
    expectedCategory: 'hotels',
    matched: true,
  },
  {
    name: 'explicit category wins over recognized type',
    section: 'food',
    entry: { type: 'restaurant', category: 'cafe' },
    file: 'cafe.jpg',
    candidate: { kind: 'original-art', category: 'cafe' },
    expectedCategory: 'cafe',
    matched: true,
  },
  {
    name: 'explicit category cafe does not also match restaurants suggested by type',
    section: 'food',
    entry: { type: 'restaurant', category: 'cafe' },
    file: 'cafe-not-restaurant.jpg',
    candidate: { kind: 'original-art', category: 'restaurants' },
    expectedCategory: 'cafe',
    matched: false,
  },
  {
    name: 'unknown type falls back to section category',
    section: 'cafe',
    entry: { type: 'mystery' },
    file: 'cafe-plate.jpg',
    candidate: { kind: 'original-art', category: 'cafe' },
    expectedCategory: 'cafe',
    matched: true,
  },
  {
    name: 'missing type does not infer restaurant from food section or URL',
    section: 'food',
    entry: {},
    file: 'restaurant-dish.jpg',
    candidate: { kind: 'original-art', category: 'restaurants' },
    expectedCategory: 'food',
    matched: false,
  },
  {
    name: 'journal-sticker type keeps section fallback and is not loosened to sticker role',
    section: 'food',
    entry: { type: 'journal-sticker' },
    file: 'sticker-sheet.jpg',
    candidate: { kind: 'sticker', category: 'stickers' },
    expectedCategory: 'food',
    matched: false,
  },
  {
    name: 'recognized restaurant type does not match a candidate from the wrong city',
    section: 'food',
    entry: { type: 'restaurant' },
    file: 'wrong-city-dish.jpg',
    candidate: { kind: 'original-art', category: 'restaurants', city: 'beta' },
    expectedCategory: 'restaurants',
    matched: false,
  },
  {
    name: 'recognized restaurant type does not match a candidate with the wrong crop',
    section: 'food',
    entry: { type: 'restaurant' },
    file: 'wrong-crop-dish.jpg',
    candidate: { kind: 'original-art', category: 'restaurants', crop: [0, 0, 0.5, 0.5] },
    expectedCategory: 'restaurants',
    matched: false,
  },
];

for (const tc of CASES) {
  test(`magazine type: ${tc.name}`, async () => {
    const w = await makeWorld();
    try {
      const sourceId = `alpha-${tc.file.replace(/\.[^.]+$/, '')}`;
      const originalUrl = `${ORIGIN}/output/magazine-articles/art/${tc.file}`;
      const magazine = {
        version: 1,
        cities: [
          {
            slug: 'alpha',
            sections: {
              [tc.section]: [
                {
                  id: sourceId,
                  src: `art/${tc.file}`,
                  credit: 'Fixture origin',
                  referencePermissions: 'restricted',
                  ...tc.entry,
                },
              ],
            },
          },
        ],
      };
      await writeFccBase(w, { magazine });
      const candidateCity = tc.candidate.city ?? 'alpha';
      await writeMot(w, {
        candidateCity,
        items: [
          motItem({
            id: `mot-${sourceId}`,
            city: candidateCity,
            sourceId,
            originalUrl,
            crop: tc.candidate.crop,
            kind: tc.candidate.kind,
            category: tc.candidate.category,
          }),
        ],
      });

      const report = await auditFccCoverage({ fccRoot: w.fccRoot, motPublicRoot: w.motPublicRoot });

      const rows = report.rows;
      assert.equal(report.summary.sourceRows, 1, 'the single magazine source row is retained');
      assert.equal(rows.length, report.summary.sourceRows, 'row list partitions the retained source total');
      assert.equal(
        (report.summary.matched ?? 0) + (report.summary.missing ?? 0) + (report.summary.unresolved ?? 0),
        report.summary.sourceRows,
        'matched + missing + unresolved partitions sourceRows',
      );

      const row = rows.find((r) => r.sourceId === sourceId);
      assert.ok(row, `source row ${sourceId} is present`);
      assert.equal(row.originalUrl, originalUrl, 'source original is retained');
      assert.equal(row.credit, 'Fixture origin', 'source credit survives over the MoT credit');
      assert.equal(row.rightsStatus, 'restricted', 'source rights survive over the MoT unknown rights');
      assert.equal(row.category, tc.expectedCategory);
      assert.equal(row.status, tc.matched ? 'matched' : 'missing');
      assert.equal(report.summary.matched ?? 0, tc.matched ? 1 : 0);
      assert.equal(report.ok, tc.matched);
      if (tc.matched) {
        assert.doesNotMatch(JSON.stringify(row), /role mismatch/i, 'no false role error for an exact city/original/role match');
      }
    } finally {
      await w.cleanup();
    }
  });
}
