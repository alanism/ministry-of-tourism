// App-only real-browser origin test (WP6).
// Reuses the immutable settings/negativeCorsTest helpers from test-mot-origins.cjs.
// No PDF or export surface is exercised by this runner.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {negativeCorsTest, settings} = require('./test-mot-origins.cjs');
const {createTripThroughDestination} = require('./mot-browser-contracts.cjs');

const playwright = () => require(process.env.MOT_PLAYWRIGHT_MODULE || 'playwright');

function gitSha() {
  const fromEnv = process.env.MOT_GIT_SHA || process.env.GIT_SHA;
  if (fromEnv && /^[a-f0-9]{7,64}$/i.test(fromEnv.trim())) return fromEnv.trim();
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[a-f0-9]{40,64}$/i.test(sha) ? sha : 'unknown';
  } catch {
    return 'unknown';
  }
}

function evidenceDir() {
  const output = process.env.MOT_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mot-app-only-evidence-'));
  fs.mkdirSync(output, {recursive: true});
  return output;
}

async function testOrigin(browser, config) {
  const output = evidenceDir();
  const sha = gitSha();
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const errors = [];
  let page;
  try {
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${config.origin}/?view=trip`, {waitUntil: 'domcontentloaded', timeout: 15000});

    // Follow the real current destination UI, via the shared contract helper,
    // rather than the retired bootstrap selectors used by the legacy runner.
    if (!await page.evaluate(() => !!window.motTrip?.probe()?.boardId)) {
      await createTripThroughDestination(page, {
        city: process.env.MOT_TEST_CITY || 'San Sebastián',
        country: process.env.MOT_TEST_COUNTRY || 'Spain',
      });
    }
    await page.waitForFunction(() => !!window.motTrip?.probe()?.boardId);

    // Real cross-origin feed/manifest/art fetch from inside the app origin,
    // plus a canvas non-taint proof for the downloaded artwork.
    const fetched = await page.evaluate(async resources => {
      const read = async url => {
        try {
          return await fetch(url, {credentials: 'omit', signal: AbortSignal.timeout(12000)});
        } catch {
          throw new Error(`Public FCC fetch blocked or unavailable: ${url}`);
        }
      };
      const json = async url => {
        const response = await read(url);
        if (!response.ok) throw new Error(`Source HTTP ${response.status}: ${url}`);
        const value = await response.json();
        if (!value || typeof value !== 'object') throw new Error('Source JSON is not an object');
        return {url, status: response.status, bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength};
      };
      const [feed, manifest] = await Promise.all([json(resources.feed), json(resources.manifest)]);
      const response = await read(resources.art);
      if (!response.ok) throw new Error(`Artwork HTTP ${response.status}: ${resources.art}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width, height = bitmap.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      let encoded;
      try {
        encoded = canvas.toDataURL('image/png');
      } catch {
        throw new Error('Canvas tainted by cross-origin artwork');
      }
      if (encoded === 'data:,' || encoded.length < 40) throw new Error('Canvas export contains no image bytes');
      const original = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return {
        feed,
        manifest,
        art: {url: resources.art, status: response.status, mime: blob.type, bytes: blob.size, width, height, canvasBytes: encoded.length},
        canvasNonTainted: true,
        original,
      };
    }, config.resources);

    const before = await page.evaluate(() => window.motTrip.probe());
    const title = 'FCC origin proof';
    await page.evaluate(({title, url}) => {
      const api = window.motTrip, {boardId, revision} = api.probe();
      api.execute({boardId, revision, ops: [{command: 'trip_card_create', input: {kind: 'photo', title, body: url}}]});
    }, {title, url: config.resources.art});

    // Actual UI photo import, fed with the exact bytes downloaded above.
    await page.getByRole('button', {name: `Actions for ${title}`, exact: true}).click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', {name: 'Add photo', exact: true}).click();
    const original = Buffer.from(fetched.original, 'base64');
    delete fetched.original;
    await (await choosing).setFiles({name: 'fcc-original.png', mimeType: fetched.art.mime, buffer: original});
    const originalSha256 = createHash('sha256').update(original).digest('hex');
    await page.waitForFunction(hash => window.motTrip.read().assets.some(asset => asset.hash === hash), originalSha256);
    await page.getByText('Photo added', {exact: true}).waitFor();

    const hashBeforeReload = await page.evaluate(() => window.motTrip.read().assets.map(asset => asset.hash));
    assert.deepEqual(hashBeforeReload, [originalSha256]);

    // Save / reload hash stability.
    await page.evaluate(() => window.motTrip.persist());
    await page.reload({waitUntil: 'domcontentloaded', timeout: 15000});
    await page.waitForFunction(hash => window.motTrip?.read().assets.some(asset => asset.hash === hash), originalSha256);
    const stored = await page.evaluate(() => window.motTrip.read());
    assert.equal(stored.assets.length, 1);
    assert.equal(stored.assets[0].hash, originalSha256, 'Asset hash must be stable across save/reload');
    assert.deepEqual(stored.assets.map(asset => asset.hash), hashBeforeReload);
    assert.ok(!/blob:|[?&](?:token|expires|signature)=/i.test(JSON.stringify(stored)), 'Document media must use hashes or stable URLs');

    await page.locator('.m-card-photo img').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.m-card-photo img')].some(image => image.complete && image.naturalWidth > 0));
    const probe = await page.evaluate(() => window.motTrip.probe());
    assert.equal(probe.boardId, before.boardId);
    assert.ok(probe.revision > before.revision, 'Imported artwork must change the visible TripSession');

    const screenshotPath = path.join(output, 'trip-app-only.png');
    await page.screenshot({path: screenshotPath});
    assert.deepEqual(errors, [], 'Application errors occurred');

    return {
      ok: true,
      appOnly: true,
      origin: config.origin,
      at: new Date().toISOString(),
      gitSha: sha,
      title: await page.title(),
      fetched,
      canvasNonTainted: true,
      photoImport: {viaUiFileChooser: true, fileName: 'fcc-original.png', mime: fetched.art.mime},
      storedOriginalSha256: originalSha256,
      hashBeforeReload,
      hashAfterReload: stored.assets.map(asset => asset.hash),
      hashStableAcrossReload: true,
      persistedAndReopened: true,
      boardId: probe.boardId,
      revisionBefore: before.revision,
      revisionAfter: probe.revision,
      runtimeErrors: errors,
      screenshot: screenshotPath,
      evidenceDirectory: output,
    };
  } catch (error) {
    // Retain failed receipts (and a failure screenshot when possible).
    let failureScreenshot = null;
    if (page) {
      try {
        failureScreenshot = path.join(output, 'trip-app-only-failure.png');
        await page.screenshot({path: failureScreenshot});
      } catch { failureScreenshot = null; }
    }
    const failure = {
      ok: false,
      appOnly: true,
      origin: config.origin,
      at: new Date().toISOString(),
      gitSha: sha,
      error: error.message,
      runtimeErrors: errors,
      screenshot: failureScreenshot,
      evidenceDirectory: output,
    };
    try { fs.writeFileSync(path.join(output, 'app-only-origin-result.json'), JSON.stringify(failure, null, 2)); } catch {}
    error.evidenceDirectory = output;
    error.receiptPath = path.join(output, 'app-only-origin-result.json');
    throw error;
  } finally {
    await context.close();
  }
}

async function main() {
  const negativeOnly = process.argv.includes('--negative-self-test');
  const validateOnly = process.argv.includes('--validate-config') || process.argv.includes('--check-config');

  // Fail-fast config validation: no browser, no network, no fixture guessing.
  if (validateOnly) {
    const config = settings();
    console.log(JSON.stringify({ok: true, configValid: true, origin: config.origin, resources: Object.keys(config.resources), gitSha: gitSha()}, null, 2));
    return;
  }

  // The negative self-test must run without any MOT_FCC_* / MOT_TEST_ORIGIN values.
  const config = negativeOnly ? null : settings();
  const browser = await playwright().chromium.launch({headless: true, chromiumSandbox: true});
  let deadline;
  try {
    const negative = await negativeCorsTest(browser);
    if (negativeOnly) {
      console.log(JSON.stringify({ok: true, negative}));
      return;
    }
    const result = await Promise.race([
      testOrigin(browser, config),
      new Promise((resolve, reject) => { deadline = setTimeout(() => reject(new Error('App-only origin test exceeded its 55-second budget')), 55000); }),
    ]);
    const receipt = {...result, negative};
    fs.writeFileSync(path.join(result.evidenceDirectory, 'app-only-origin-result.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ok: false, error: error.message, evidenceDirectory: error.evidenceDirectory || null, receiptPath: error.receiptPath || null}));
    process.exitCode = 1;
  });
}

module.exports = {negativeCorsTest, settings, createTripThroughDestination, gitSha, testOrigin};
