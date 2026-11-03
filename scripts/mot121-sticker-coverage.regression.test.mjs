import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { auditFccCoverage } from './audit-mot-fcc-coverage.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const generatorPath = fileURLToPath(new URL('./build-fcc-artwork.mjs', import.meta.url));
const ORIGIN = 'https://foreignclubberscorespondence.web.app';
const HEX = (char) => char.repeat(64);

async function tempRoot(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}
async function writeJson(root, relative, value) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeText(root, relative, value) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}
async function snapshot(root) {
  const rows = [];
  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, relative);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        rows.push([relative, createHash('sha256').update(bytes).digest('hex'), bytes.toString('utf8')]);
      }
    }
  }
  await walk(root);
  return rows;
}

test('generator: explicit figure kind tag/stamp becomes referenced stickers, scene stays original art', async (t) => {
  const root = await tempRoot(t, 'mot121-generator-');
  const fcc = path.join(root, 'fcc');
  const output = path.join(root, 'public', 'artwork', 'fcc');
  const tagHash = HEX('a');
  const stampHash = HEX('b');
  const sceneHash = HEX('c');
  const figures = [
    { key: 'harbour-tag', kind: 'tag', sha256: tagHash, label: 'Harbour Tag', width: 200, height: 100, frame: [0, 0, 100, 100] },
    { key: 'market-stamp', kind: 'stamp', sha256: stampHash, label: 'Market Stamp', width: 200, height: 100, frame: [100, 0, 200, 100] },
    { key: 'river-scene', kind: 'scene', sha256: sceneHash, label: 'River Scene', width: 200, height: 100, frame: [0, 0, 200, 100] },
  ];
  const gallery = figures.map((figure, index) => ({
    id: figure.sha256,
    category: 'city-illustration',
    label: figure.label,
    src: `${ORIGIN}/renditions/${figure.key}.webp`,
    thumb: `/thumbs/${figure.key}.webp`,
    original: `${ORIGIN}/originals/${figure.key}.png`,
    width: figure.width,
    height: figure.height,
    credit: 'Fixture Credit',
    rightsStatus: index === 0 ? 'restricted' : 'unknown',
  }));
  await writeJson(fcc, 'output/prototypes/city-pages/journal/city-art.json', { bangkok: gallery });
  await writeJson(fcc, 'data/optimized-assets-release.json', { contentVersion: 'fixture-v1', snapshotDate: '2026-10-31', files: [] });
  await writeJson(fcc, 'data/brush-portraits.json', { cities: [] });
  await writeJson(fcc, 'data/home-map-wall-release.json', { tshirtCollections: [] });
  await writeText(fcc, 'output/prototypes/city-pages/bangkok.html', `<script id="fcc-data" type="application/json">${JSON.stringify({ city: { figures } })}</script>`);
  const inputsBefore = await snapshot(fcc);
  const run = async () => {
    await execFileAsync(process.execPath, [generatorPath, fcc, output], { cwd: repoRoot });
    return snapshot(output);
  };
  const first = await run();
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(output, 'build-report.json'), 'utf8'));
  const bySubject = new Map(manifest.catalogs.map((catalog) => [catalog.subject, catalog]));
  assert.equal(bySubject.get('stickers')?.city, 'bangkok');
  assert.equal(bySubject.get('stickers')?.count, 2);
  assert.equal(bySubject.get('people')?.count, 1);
  assert.equal(manifest.catalogs.reduce((sum, catalog) => sum + catalog.count, 0), 3);
  assert.equal(report.entryCount, 3);
  assert.equal(report.categoryCounts.stickers, 2);
  assert.equal(report.categoryCounts.people, 1);
  const stickers = JSON.parse(await readFile(path.join(output, 'bangkok', 'stickers.json'), 'utf8'));
  const people = JSON.parse(await readFile(path.join(output, 'bangkok', 'people.json'), 'utf8'));
  assert.equal(stickers.items.length, 2);
  assert.equal(people.items.length, 1);
  const expected = [
    { hash: tagHash, kindRole: 'tag', crop: [0, 0, 0.5, 1], label: 'Harbour Tag', rightsStatus: 'restricted' },
    { hash: stampHash, kindRole: 'stamp', crop: [0.5, 0, 0.5, 1], label: 'Market Stamp', rightsStatus: 'unknown' },
  ];
  for (const want of expected) {
    const matches = stickers.items.filter((item) => item.artRef.source.sourceId === want.hash);
    assert.equal(matches.length, 1, `${want.kindRole} must appear exactly once in stickers`);
    const [item] = matches;
    assert.equal(item.subject, 'stickers');
    assert.equal(item.city, 'bangkok');
    assert.equal(item.label, want.label);
    assert.deepEqual(item.crop, want.crop);
    assert.deepEqual(item.artRef.crop ?? item.crop, want.crop);
    assert.equal(item.artRef.kind, 'sticker');
    assert.equal(item.artRef.category, 'stickers');
    assert.equal(item.artRef.role, want.kindRole);
    assert.equal(item.artRef.originCityId, 'bangkok');
    assert.equal(item.artRef.countryCode, 'TH');
    assert.equal(item.artRef.source.provider, 'fcc');
    assert.equal(item.artRef.source.cityId, 'bangkok');
    assert.equal(item.artRef.source.countryCode, 'TH');
    assert.equal(item.artRef.credit, 'Fixture Credit');
    assert.equal(item.artRef.rightsStatus, want.rightsStatus);
    assert.equal(item.original, gallery.find((record) => record.id === want.hash).original);
    assert.equal(item.artRef.originalUrl, item.original);
    assert.equal(item.artRef.sourceId, undefined);
  }
  const [scene] = people.items;
  assert.equal(scene.artRef.source.sourceId, sceneHash);
  assert.equal(scene.subject, 'people');
  assert.equal(scene.artRef.kind, 'original-art');
  assert.equal(scene.artRef.category, 'people');
  assert.equal(scene.artRef.role, undefined);
  assert.deepEqual(scene.crop, [0, 0, 1, 1]);
  assert.equal(stickers.items.some((item) => item.artRef.source.sourceId === sceneHash), false);
  const second = await run();
  assert.deepEqual(second, first, 'regeneration must be deterministic');
  assert.deepEqual(await snapshot(fcc), inputsBefore, 'generator must not mutate FCC inputs');
});

const AUDIT_HASH = '0123456789abcdef'.repeat(4);
const OTHER_HASH = HEX('f');
const SOURCE_PATH = '/source/sheet.png';
const ALIAS_PATH = '/alias/sheet.png';
const SOURCE_URL = ORIGIN + SOURCE_PATH;
const ALIAS_URL = ORIGIN + ALIAS_PATH;

function auditFixtureData(mutate) {
  const data = {
    releaseFiles: [
      { path: SOURCE_PATH, sha256: AUDIT_HASH, bytes: 123 },
      { path: ALIAS_PATH, sha256: AUDIT_HASH, bytes: 123 },
    ],
    candidateOriginal: ALIAS_URL,
    crop: [0, 0, 0.5, 1],
    city: 'bangkok',
    subject: 'objects',
    kind: 'original-art',
    category: 'objects',
  };
  mutate?.(data);
  const thumb = `${ORIGIN}/thumbs/fixture-480w.webp`;
  const src = `${ORIGIN}/renditions/fixture.webp`;
  const item = {
    id: 'fixture-art', styleId: 'fcc-editorial', label: 'Object', city: data.city, subject: data.subject,
    thumb, src, original: data.candidateOriginal, width: 100, height: 100, crop: data.crop,
    artRef: {
      assetId: 'fixture-art', originCityId: data.city, countryCode: 'TH', kind: data.kind, category: data.category,
      thumbnailUrl: thumb, renditionUrl: src, originalUrl: data.candidateOriginal, credit: 'FCC', rightsStatus: 'unknown',
      source: { provider: 'fcc', sourceId: AUDIT_HASH, cityId: data.city, countryCode: 'TH' },
    },
  };
  return { data, item };
}

async function writeAuditFixture(root, mutate) {
  const { data, item } = auditFixtureData(mutate);
  const fcc = path.join(root, 'fcc');
  const mot = path.join(root, 'mot');
  const city = {
    schema: 'fcc.city-source/1', entry: { slug: 'bangkok' },
    catalog: { city: { slug: 'bangkok', figures: [{ key: 'figure-1', kind: 'object', src: SOURCE_PATH, sha256: AUDIT_HASH, width: 100, height: 100, frame: [0, 0, 50, 100] }] } },
    journalArt: { city: 'bangkok' }, gallery: [],
  };
  await writeJson(fcc, 'content/cities/index.json', { schema: 'fcc.city-sources/1', slugs: ['bangkok'] });
  await writeJson(fcc, 'content/cities/bangkok/city.json', city);
  await writeJson(fcc, 'content/assets/registry.json', { schema: 'fcc.asset-registry/1', releaseVersion: 'test', assets: [] });
  await writeJson(fcc, 'data/optimized-assets-release.json', { contentVersion: 'test', snapshotDate: '2026-10-31', files: data.releaseFiles });
  await writeJson(fcc, 'data/brush-portraits.json', { schema: 'fcc.brush-portraits/1', cities: [] });
  await writeJson(fcc, 'data/home-map-wall-release.json', { tshirtCollections: [] });
  await writeJson(fcc, 'output/prototypes/city-pages/journal/collections.json', { version: 1, collections: [] });
  await writeJson(fcc, 'output/magazine-articles/art-registry.json', { version: 1, cities: [] });
  await writeJson(mot, 'fcc/destinations.json', { version: 1, cities: [{ id: 'bangkok', name: 'Bangkok', countryCode: 'TH', timeZone: 'Asia/Bangkok' }], countries: [{ code: 'TH', name: 'Thailand' }] });
  await writeJson(mot, 'artwork/index.json', { version: 1, styles: [{ id: 'fcc-editorial', label: 'FCC', manifest: '/artwork/fcc/manifest.json' }] });
  await writeJson(mot, 'artwork/fcc/manifest.json', {
    version: 1, styleId: 'fcc-editorial',
    subjects: [{ id: data.subject, label: data.subject === 'apparel' ? 'Apparel' : 'Objects' }],
    cities: [{ id: 'bangkok', label: 'Bangkok' }],
    catalogs: [{ city: 'bangkok', subject: data.subject, url: `/artwork/fcc/bangkok/${data.subject}.json`, count: 1 }],
  });
  await writeJson(mot, `artwork/fcc/bangkok/${data.subject}.json`, { version: 1, styleId: 'fcc-editorial', items: [item] });
  return { fcc, mot, item, candidateOriginal: data.candidateOriginal, subject: data.subject };
}

async function runAudit(fcc, mot) {
  const result = await auditFccCoverage({ fccRoot: fcc, motPublicRoot: mot });
  return { ok: result.ok, report: result };
}
function assertCommon(report, matched) {
  assert.ok(report, 'audit must return report');
  assert.ok(report.inputs, 'report.inputs must be present');
  assert.ok(Array.isArray(report.rows));
  assert.ok(Array.isArray(report.issues));
  assert.equal(report.summary.sourceRows, 1);
  assert.equal(report.rows.length, 1);
  assert.equal(report.summary.matched, matched);
  assert.equal(report.summary.matched + report.summary.missing + report.summary.unresolved, report.summary.sourceRows, 'status partition must equal sourceRows');
  assert.equal(report.rows[0].originalUrl, SOURCE_URL, 'original source URL must be unchanged');
  assert.ok(Array.isArray(report.rows[0].originalAliases));
}
function assertMatched(report, aliasUrl) {
  assert.equal(report.ok, true);
  assertCommon(report.report, 1);
  if (aliasUrl) assert.ok(report.report.rows[0].originalAliases.includes(aliasUrl), `proven alias ${aliasUrl} must be recorded on the source row`);
}
function assertUnproven(report, candidateUrl) {
  assert.equal(report.ok, false);
  assertCommon(report.report, 0);
  assert.equal(report.report.rows[0].originalAliases.includes(candidateUrl), false, 'unproven candidate URL must not be added to source row aliases');
}
function assertRejectedDespiteProvenRelease(report) {
  assert.equal(report.ok, false);
  assertCommon(report.report, 0);
}

test('audit: exact source URL remains a positive control', async (t) => {
  const root = await tempRoot(t, 'mot121-audit-exact-');
  const { fcc, mot } = await writeAuditFixture(root, (d) => { d.candidateOriginal = SOURCE_URL; });
  assertMatched(await runAudit(fcc, mot));
});

test('audit: release-proven same-SHA/same-bytes alias matches without changing source URL', async (t) => {
  const root = await tempRoot(t, 'mot121-audit-alias-');
  const { fcc, mot } = await writeAuditFixture(root);
  const report = await runAudit(fcc, mot);
  assertMatched(report, ALIAS_URL);
  const shardAfter = JSON.parse(await readFile(path.join(mot, 'artwork/fcc/bangkok/objects.json'), 'utf8'));
  assert.equal(shardAfter.items[0].original, ALIAS_URL);
  assert.equal(shardAfter.items[0].artRef.originalUrl, ALIAS_URL);
});

const unprovenCases = [
  ['changed alias SHA', (d) => { d.releaseFiles[1].sha256 = OTHER_HASH; }],
  ['changed alias byte count', (d) => { d.releaseFiles[1].bytes = 124; }],
  ['omitted source release record', (d) => { d.releaseFiles = d.releaseFiles.filter((f) => f.path !== SOURCE_PATH); }],
  ['omitted alias release record', (d) => { d.releaseFiles = d.releaseFiles.filter((f) => f.path !== ALIAS_PATH); }],
  ['invalid alias SHA', (d) => { d.releaseFiles[1].sha256 = 'not-a-sha256'; }],
  ['missing alias SHA', (d) => { delete d.releaseFiles[1].sha256; }],
  ['invalid alias byte count', (d) => { d.releaseFiles[1].bytes = 0; }],
  ['missing alias byte count', (d) => { delete d.releaseFiles[1].bytes; }],
  ['non-integer alias byte count', (d) => { d.releaseFiles[1].bytes = '123'; }],
  ['foreign-origin candidate with same pathname', (d) => { d.candidateOriginal = `https://example.com${ALIAS_PATH}`; }],
  ['conflicting duplicate alias release path', (d) => { d.releaseFiles.push({ path: ALIAS_PATH, sha256: OTHER_HASH, bytes: 999 }); }],
  ['conflicting duplicate source release path', (d) => { d.releaseFiles.push({ path: SOURCE_PATH, sha256: OTHER_HASH, bytes: 999 }); }],
  ['foreign URL used as release alias path', (d) => { d.releaseFiles[1].path = `https://example.com${ALIAS_PATH}`; }],
  ['protocol-relative foreign authority release alias path', (d) => { d.releaseFiles[1].path = `//example.com${ALIAS_PATH}`; }],
  ['query in release alias path', (d) => { d.releaseFiles[1].path = `${ALIAS_PATH}?download=1`; }],
  ['fragment in release alias path', (d) => { d.releaseFiles[1].path = `${ALIAS_PATH}#fragment`; }],
];
for (const [name, mutate] of unprovenCases) {
  test(`audit negative (unproven alias): ${name}`, async (t) => {
    const root = await tempRoot(t, 'mot121-audit-negative-');
    const { fcc, mot, candidateOriginal } = await writeAuditFixture(root, mutate);
    assertUnproven(await runAudit(fcc, mot), candidateOriginal);
  });
}

const provenButRejectedCases = [
  ['same-content alias with wrong crop', (d) => { d.crop = [0, 0, 1, 1]; }],
  ['same-content alias with wrong city', (d) => { d.city = 'austin'; }],
  ['same-content alias with wrong kind/category', (d) => { d.subject = 'apparel'; d.kind = 'apparel-mockup'; d.category = 'apparel'; }],
];
for (const [name, mutate] of provenButRejectedCases) {
  test(`audit negative (valid release alias, rejected candidate): ${name}`, async (t) => {
    const root = await tempRoot(t, 'mot121-audit-rejected-');
    const { fcc, mot } = await writeAuditFixture(root, mutate);
    assertRejectedDespiteProvenRelease(await runAudit(fcc, mot));
  });
}
