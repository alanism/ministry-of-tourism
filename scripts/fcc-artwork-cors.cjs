// Preserve the live FCC files/routing; release only a public-image CORS header.
// Uses the already-installed Firebase CLI and its signed-in account; no keys.
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const lib = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
const auth = require(path.join(lib, 'auth'));
const { requireAuth } = require(path.join(lib, 'requireAuth'));
const { Client } = require(path.join(lib, 'apiv2'));
const hosting = require(path.join(lib, 'hosting/api'));
const site = 'foreignclubberscorespondence';

(async () => {
  const email = process.env.WB_FIREBASE_ACCOUNT;
  const account = auth.getAllAccounts().find(value => value.user.email === email);
  if (!account) throw new Error('Set WB_FIREBASE_ACCOUNT to an account signed into the Firebase CLI.');
  await requireAuth({ project: 'nonhumanintelligence', ...account });
  const client = new Client({ urlPrefix: 'https://firebasehosting.googleapis.com', apiVersion: 'v1beta1', auth: true });
  const live = await hosting.getChannel('nonhumanintelligence', site, 'live');
  const version = (await client.get(live.release.version.name)).body;
  console.log(JSON.stringify({ site, version: version.name, files: version.fileCount, headers: version.config.headers.length, redirects: version.config.redirects?.length }));
  const header = { glob: '/assets/generated/**', headers: { 'Access-Control-Allow-Origin': '*' } };
  if ((version.config.headers ?? []).some(value => value.glob === header.glob && value.headers['Access-Control-Allow-Origin'] === '*')) {
    console.log('Public artwork CORS already configured.'); return;
  }
  if (!process.argv.includes('--apply')) return;
  const auditPath = process.env.WB_CORS_AUDIT;
  if (!auditPath) throw new Error('Set WB_CORS_AUDIT to an audit JSON file outside the repository.');
  await fs.writeFile(auditPath, JSON.stringify({ previousVersion: version.name, previousConfig: version.config }, null, 2));
  const config = { ...version.config, headers: [...(version.config.headers ?? []), header] };
  const recent = (await client.get(`projects/-/sites/${site}/versions`, { queryParams: { pageSize: 10 } })).body.versions ?? [];
  // A previous invocation may have finalized successfully before statistics were ready.
  const ready = recent.find(value => value.status === 'FINALIZED' && value.fileCount === version.fileCount && isDeepStrictEqual(value.config, config));
  const clone = ready ?? await hosting.cloneVersion(site, version.name, false);
  if (!ready) await hosting.updateVersion(site, clone.name.split('/').at(-1), { config, status: 'FINALIZED' });
  // PATCH returns a partial Version; read the finalized resource for its counts.
  let updated = (await client.get(clone.name)).body;
  for (let attempt = 0; !updated.fileCount && attempt < 8; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    updated = (await client.get(clone.name)).body;
  }
  assert.equal(updated.fileCount, version.fileCount, 'All live files are retained');
  assert.deepEqual(updated.config, config, 'Only the public-image header is changed');
  assert.deepEqual(updated.config.redirects, version.config.redirects, 'All redirects are retained');
  assert.deepEqual(updated.config.rewrites, version.config.rewrites, 'All rewrites are retained');
  const current = await hosting.getChannel('nonhumanintelligence', site, 'live');
  assert.equal(current.release.version.name, version.name, 'Stop if another FCC release happened during the update');
  const release = await hosting.createRelease(site, 'live', clone.name, { message: 'Allow public optimized artwork reads for the Writer’s Board picker' });
  await fs.writeFile(auditPath, JSON.stringify({ previousVersion: version.name, previousConfig: version.config, newVersion: clone.name, release: release.name, files: updated.fileCount }, null, 2));
  console.log(JSON.stringify({ released: release.name, version: clone.name, files: updated.fileCount, header }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
