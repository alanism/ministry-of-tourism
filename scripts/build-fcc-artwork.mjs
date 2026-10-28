// Metadata only: image bytes continue to be served by FCC's existing host.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Pass the FCC The-Aria-Bangkok directory.');
const output = fileURLToPath(new URL('../apps/web/public/artwork/fcc/', import.meta.url));
const host = 'https://foreignclubberscorespondence.web.app';
const catalog = JSON.parse(await readFile(path.join(source, 'output/prototypes/city-pages/journal/city-art.json'), 'utf8'));
const optimized = JSON.parse(await readFile(path.join(source, 'data/optimized-assets-release.json'), 'utf8'));
const thumbnails = new Map();
for (const file of optimized.files) {
  const match = file.path.match(/-([a-f0-9]{10})-480w\.webp$/);
  if (match) thumbnails.set(match[1], new URL(file.path, host).href);
}
const styleId = 'fcc-editorial';
const manifest = { version: 1, styleId, subjects: [{ id: 'places', label: 'Places & backdrops' }, { id: 'people', label: 'People' }, { id: 'objects', label: 'Objects' }], cities: [], catalogs: [] };
const humanize = value => value.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const normalizeCrop = (frame, width, height) => frame ? [frame[0] / width, frame[1] / height, (frame[2] - frame[0]) / width, (frame[3] - frame[1]) / height] : undefined;
let count = 0;
for (const [slug, records] of Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))) {
  let city;
  try {
    const html = await readFile(path.join(source, 'output/prototypes/city-pages', `${slug}.html`), 'utf8');
    city = JSON.parse(html.match(/<script id="fcc-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1] ?? 'null')?.city;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const groups = { places: [], people: [], objects: [] };
  const used = new Set();
  function add(record, subject, label, suffix = '', crop) {
    if (!record?.src) return;
    const thumb = thumbnails.get(record.id.slice(0, 10)) ?? new URL(record.thumb, `${host}/output/prototypes/city-pages/journal/`).href;
    groups[subject].push({ id: `fcc:${slug}:${record.id}${suffix}`, styleId, label, subject, city: slug,
      collection: 'fcc-city-illustrations', thumb, src: new URL(record.src, host).href,
      original: new URL(record.original, host).href, sourceHash: record.id, width: record.width, height: record.height,
      ...(crop ? { crop } : {}) });
    used.add(record.id);
  }
  const fashion = city?.fashion;
  const sheet = fashion && records.find(record => record.id === fashion.sha256);
  for (const [index, slot] of (fashion?.slots ?? []).entries()) {
    const frame = fashion.frames?.[index];
    if (frame) add(sheet, 'people', humanize(slot), `:${slot}`, normalizeCrop(frame, fashion.width, fashion.height));
  }
  for (const figure of city?.figures ?? []) {
    if (figure.kind === 'style') continue;
    const record = records.find(value => value.id === figure.sha256);
    if (!record || used.has(record.id)) continue;
    const subject = ['backdrop', 'foreground'].includes(figure.kind) ? 'places' : figure.kind === 'scene' ? 'people' : 'objects';
    add(record, subject, figure.label, '', normalizeCrop(figure.frame, figure.width, figure.height));
  }
  for (const record of records) {
    if (used.has(record.id) || ['fashion', 'fashion-men'].includes(record.category) || /sheet/i.test(record.label)) continue;
    // Unclassified illustration sheets must not appear as single figures.
    if (record.category === 'city-illustration') {
      if (/backdrop|foreground/i.test(record.label)) add(record, 'places', record.label);
      continue;
    }
    add(record, 'places', /^[a-f0-9]{10,}$/i.test(record.label) ? humanize(record.category) : record.label);
  }
  if (!Object.values(groups).some(items => items.length)) continue;
  manifest.cities.push({ id: slug, label: city?.name ?? humanize(slug) });
  for (const [subject, items] of Object.entries(groups)) {
    if (!items.length) continue;
    await mkdir(path.join(output, slug), { recursive: true });
    await writeFile(path.join(output, slug, `${subject}.json`), JSON.stringify({ version: 1, styleId, items }));
    manifest.catalogs.push({ subject, city: slug, url: `/artwork/fcc/${slug}/${subject}.json`, count: items.length });
    count += items.length;
  }
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
const registryPath = path.join(output, '..', 'index.json');
let registry = { version: 1, styles: [] };
try { registry = JSON.parse(await readFile(registryPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const pack = { id: styleId, label: 'FCC · Fashion, travel & lifestyle', manifest: '/artwork/fcc/manifest.json' };
registry.styles = [...registry.styles.filter(value => value.id !== styleId), pack];
await writeFile(registryPath, JSON.stringify(registry, null, 2));
console.log(`FCC artwork: ${count} entries, ${manifest.cities.length} cities, ${manifest.catalogs.length} metadata shards. No image bytes copied.`);
