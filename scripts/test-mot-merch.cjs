// Synthetic classified metadata tests real transport and issue assembly, not live FCC classification.
const { chromium } = require(process.env.MOT_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createTripThroughDestination, exportThroughSurface } = require('./mot-browser-contracts.cjs');

const origin = process.env.MOT_TEST_ORIGIN || 'http://127.0.0.1:5173';
const output = process.env.MOT_EVIDENCE_DIR || path.join(require('node:os').tmpdir(), 'mot-merch-evidence');
fs.mkdirSync(output, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const fcc = 'https://foreignclubberscorespondence.web.app';
const city = 'san-sebastian';
const roles = ['apparel-brush', 'apparel-map-mono', 'apparel-map-color'];
const photos = roles.map((role, index) => ({
  assetId: `fixture-tee-${index}`, category: 'tee', kind: 'apparel-mockup', role,
  originCityId: city, label: `Fixture tee ${index + 1}`,
  thumbnailUrl: `${fcc}/assets/generated/${city}/fixture-tee-${index}.png`,
  renditionUrl: `${fcc}/assets/generated/${city}/fixture-tee-${index}.png`,
  width: 1, height: 1, mimeType: 'image/png', rightsStatus: 'unknown',
  credit: 'Synthetic fixture attribution',
  source: { provider: 'fcc', sourceId: `fixture-${index}`, canonicalUrl: `${fcc}/${city}.html`,
    cityId: city, kind: 'artwork', retrievedAt: '2026-10-28', origin: 'artwork' },
}));

(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], shop = [];
  page.on('pageerror', error => errors.push(error.message));
  const json = (route, value) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
  await page.route('**/fcc/destinations.json', route => json(route, { version: 1,
    cities: [{ id: city, name: 'San Sebastián', countryCode: 'ES', timeZone: 'Europe/Madrid' }] }));
  await page.route('**/artwork/index.json', route => json(route, { version: 1,
    styles: [{ id: 'fixture', label: 'Fixture', manifest: '/artwork/fixture/manifest.json' }] }));
  await page.route('**/artwork/fixture/manifest.json', route => json(route, { version: 1, styleId: 'fixture',
    subjects: [{ id: 'apparel', label: 'Apparel' }], cities: [{ id: city, label: 'San Sebastián' }],
    catalogs: [{ subject: 'apparel', city, url: '/artwork/fixture/tees.json', count: 4 }] }));
  await page.route('**/artwork/fixture/tees.json', route => json(route, { version: 1, styleId: 'fixture',
    items: [...photos, { kind: 'map', assetId: 'not-apparel' }] }));
  await context.route(`${fcc}/assets/generated/${city}/fixture-tee-*.png`, route => route.fulfill({
    headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' }, body: png,
  }));
  await context.route(`${fcc}/shop/**`, route => {
    shop.push({ url: route.request().url(), referer: route.request().headers().referer ?? null });
    return route.fulfill({ contentType: 'text/html', body: '<title>Synthetic shop transport fixture</title>' });
  });
  try {
    await page.goto(origin + '/?view=trip');
    await createTripThroughDestination(page, { city: 'San Sebastián', registry: true });
    assert.equal(await page.evaluate(() => window.motTrip.read().meta.cityId), city);
    await page.getByLabel('New card title').fill('A fictional traveler note');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await page.getByRole('button', { name: 'Keepsakes', exact: true }).click();
    await page.locator('.mot-issue-spread img').first().waitFor();

    // Inspect the production builder against the durably saved board, never fabricate preview pages.
    const issue = await page.evaluate(async () => {
      await window.motTrip.persist();
      const code = await (await fetch('/src/trip/trip-store.ts')).text();
      const coreUrl = code.match(/from\s+["']([^"']*packages\/core\/src\/index\.ts[^"']*)["']/)?.[1];
      if (!coreUrl) throw new Error('Could not find the Vite core module for the saved issue.');
      const core = await import(coreUrl);
      const storage = await import('/src/trip/trip-store.ts');
      const { prepareMagazine } = await import('/src/trip/artifacts.ts');
      const opened = await storage.openTrip(window.motTrip.probe().boardId);
      const session = new core.TripSession(opened.doc);
      try {
        const magazine = await prepareMagazine(session, undefined, false);
        return { cityId: magazine.cityId, revision: magazine.revision,
          apparel: (magazine.apparel ?? []).map(art => art.assetId),
          pages: magazine.pages.map(({ id, section, pattern, assetIds, links, slots, folio }) =>
            ({ id, section, pattern, assetIds, links, slots, folio })) };
      } finally { session.destroy(); opened.destroy(); }
    });
    assert.equal(issue.cityId, city);
    assert.equal(issue.pages[0].section, 'front-cover');
    assert.equal(issue.pages.at(-1).section, 'back-cover');
    assert(issue.pages.length > 3, 'Integrated issue must include its real front, inside spreads and back');
    assert.deepEqual(issue.apparel, photos.map(photo => photo.assetId), 'Keep all three real catalog choices');
    const apparelIds = new Set(issue.apparel);
    const usedApparel = issue.pages.flatMap(page => page.assetIds.filter(id => apparelIds.has(id)));
    assert.deepEqual([...usedApparel].sort(), ['fixture-tee-0', 'fixture-tee-2'],
      'Use distinct brush and color tees once each; the mono tee remains an available choice');
    assert(!issue.pages.some(page => page.assetIds.includes('not-apparel')), 'A map cannot become a garment');
    const linkedPages = issue.pages.filter(page => page.links?.length);
    assert.deepEqual(linkedPages.map(page => page.section), ['style', 'back-cover']);
    for (const page of linkedPages) {
      assert.equal(page.links.length, 1);
      assert.equal(page.links[0].url, `${fcc}/shop/?city=${city}`);
      const link = page.links[0];
      assert([link.x, link.y, link.width, link.height].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      assert(link.x + link.width <= 1 && link.y + link.height <= 1);
    }
    assert.equal(await page.locator('.mot-issue-paper img').count(), issue.pages.length);
    assert.equal(await page.locator('.mot-issue-tee img').count(), photos.length);
    await page.screenshot({ path: path.join(output, 'merch-ui.png') });

    const orderLink = page.getByRole('link', { name: 'Order on FCC →', exact: true }).first();
    await orderLink.waitFor();
    assert.equal(await orderLink.getAttribute('target'), '_blank');
    assert.match(await orderLink.getAttribute('rel'), /noopener/);
    assert.match(await orderLink.getAttribute('rel'), /noreferrer/);
    assert.equal(await orderLink.getAttribute('referrerpolicy'), 'no-referrer');
    const popup = context.waitForEvent('page');
    await orderLink.click();
    const opened = await popup;
    await opened.waitForLoadState('domcontentloaded');
    assert.equal(opened.url(), `${fcc}/shop/?city=${city}`);
    await opened.close();
    assert.equal(shop.length, 1);
    assert.equal(shop[0].referer, null);

    const uiPdf = await exportThroughSurface(page, 'pdf');
    const downloadEvent = page.waitForEvent('download');
    await uiPdf.card.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadEvent;
    const pdfPath = path.join(output, 'merch-fixture.pdf');
    await download.saveAs(pdfPath);
    const pdf = fs.readFileSync(pdfPath), text = pdf.toString('latin1');
    assert.equal(pdf.length, uiPdf.receipt.bytes);
    assert(text.startsWith('%PDF-'));
    assert.equal((text.match(/\/Subtype \/Link/g) || []).length, 2);
    assert(text.includes(`/URI (${fcc}/shop/?city=${city})`));
    assert(!text.includes('/URI (A fictional traveler note'));

    // Agent exports retain the shared audience and actual PDF links of the visible export.
    const result = await page.evaluate(async () => {
      const receipt = await window.motTrip.exportArtifact('pdf');
      const bytes = new Uint8Array(await (await fetch(receipt.url)).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { receipt, base64: btoa(binary) };
    });
    const agentPdf = Buffer.from(result.base64, 'base64'), agentText = agentPdf.toString('latin1');
    assert.equal(result.receipt.scope, 'stay');
    assert.equal(agentPdf.length, result.receipt.byteCount);
    assert(agentText.startsWith('%PDF-'));
    assert.equal((agentText.match(/\/Subtype \/Link/g) || []).length, 2);
    assert(agentText.includes(`/URI (${fcc}/shop/?city=${city})`));
    assert(!agentText.includes('/URI (A fictional traveler note'));
    fs.writeFileSync(path.join(output, 'merch-agent-fixture.pdf'), agentPdf);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
      syntheticMetadata: true, liveApparelClassification: false, issue,
      availableApparel: issue.apparel.length, usedApparel, pdfBytes: pdf.length,
      uiReceipt: uiPdf.receipt, agentReceipt: result.receipt, linkAnnotations: 2, shop, errors,
    }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
