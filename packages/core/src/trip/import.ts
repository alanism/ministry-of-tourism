// Safe import (MOT-31): every archive is hostile until proven otherwise.
import { unzipSync, strFromU8 } from 'fflate';
import * as Y from 'yjs';
import { z } from 'zod';
import { fromBase64 } from '../doc/board-file.ts';
import { loadTrip } from './persist.ts';
import {validateStoredGroupResponses} from './group-workspace.ts';
import { createTrip, readAllCards, readAsset, readPresentations, readTripMeta, tripParts, writeAsset, writeCard, writePresentation } from './model.ts';
import { sha256Hex, TRIP_PACKAGE_FORMAT, TRIP_PACKAGE_LIMITS, TRIP_PACKAGE_VERSION } from './package.ts';
import { presentationSchema, tripCardSchema, tripMetaSchema } from './schema.ts';

export const TRIP_IMPORT_LIMITS = TRIP_PACKAGE_LIMITS;
const MAX_FILE = TRIP_IMPORT_LIMITS.fileBytes;
const MAX_TOTAL = TRIP_IMPORT_LIMITS.totalBytes;
const manifestSchema = z.object({
  format: z.literal(TRIP_PACKAGE_FORMAT), version: z.union([z.literal(1),z.literal(TRIP_PACKAGE_VERSION)]), boardId: z.string().min(1),
  created: z.string(), assets: z.array(z.object({ id: z.string().min(1).max(200), file: z.string(), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string() }).strict()),
}).strict();

function fail(msg: string): never { throw new Error(msg); }

/** Validate and import. Returns a NEW doc with a NEW boardId. Throws plain errors; caller's doc is never touched. */
export async function importTripPackage(bytes: Uint8Array, options: { newId?: () => string } = {}): Promise<{ doc: Y.Doc; assets: Map<string, Uint8Array>; originalPackage?:Uint8Array }> {
  if (bytes.length > MAX_TOTAL) fail('This package is too large to import.');
  // The directory's declared sizes are checked before anything inflates (#9). An entry over a
  // limit is skipped by the filter and reported; the checks below still catch a size that lied.
  let declared = 0;
  let refused = '';
  const filter = (f: { name: string; originalSize: number }) => {
    declared += f.originalSize;
    if (!refused && f.originalSize > MAX_FILE) refused = `File too large in package: ${f.name}`;
    if (!refused && declared > MAX_TOTAL) refused = 'Package expands to too much data (possible decompression bomb).';
    return !refused;
  };
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes, { filter }); } catch { fail('This file is not a trip package.'); }
  if (refused) fail(refused);
  let total = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) fail(`Unsafe path in package: ${name}`);
    if (/\.(exe|dll|sh|bat|cmd|js|mjs|html?|svg)$/i.test(name)) fail(`Active content is not allowed: ${name}`);
    if (data.length > MAX_FILE) fail(`File too large in package: ${name}`);
    total += data.length;
    if (total > MAX_TOTAL) fail('Package expands to too much data (possible decompression bomb).');
  }
  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) fail('Trip package is missing its manifest.');
  let manifest: z.infer<typeof manifestSchema>;
  try { manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestRaw))); } catch { fail('Trip package manifest is damaged or from a newer version.'); }
  const assets = new Map<string, Uint8Array>();
  for (const a of manifest.assets) {
    if(a.file!==`assets/${a.id}` || /[\\/]/.test(a.id) || a.id==='.' || a.id==='..')fail('Unsafe asset path in manifest');
    if(assets.has(a.id))fail(`Duplicate asset ${a.id}`);
    if(/(?:html|javascript|svg|xml)/i.test(a.mime))fail(`Active MIME type for asset ${a.id}`);
    const data = files[a.file];
    if (!data) fail(`Package is missing asset ${a.id}.`);
    if (data.length !== a.size) fail(`Asset ${a.id} size does not match its manifest.`);
    if ((await sha256Hex(data)) !== a.sha256) fail(`Asset ${a.id} failed its checksum.`);
    assets.set(a.id, data);
  }
  const docB64 = files['document.b64'];
  if (!docB64) fail('Trip package is missing its document.');
  let source: Y.Doc;
  try { source = loadTrip(fromBase64(strFromU8(docB64).trim())); } catch { fail('Trip package document is damaged or from a newer version.'); }
  try {
  // Rebuild into a fresh doc with a new board identity, so old tokens can never match.
  const meta = readTripMeta(source);
  await validateStoredGroupResponses(source);
  if(meta.boardId!==manifest.boardId)fail('Package board identity does not match its manifest');
  const readable=files['trip.json'];
  if(readable){
    const raw=JSON.parse(strFromU8(readable));
    if(manifest.version===1 && raw.meta?.schemaVersion===1)raw.meta.schemaVersion=2;
    const parsed=z.object({meta:tripMetaSchema,cards:z.array(tripCardSchema),presentations:z.array(presentationSchema).optional()}).strict().safeParse(raw);
    if(!parsed.success)fail('Readable trip has unknown or unsupported schema fields');
  }
  const srcParts=tripParts(source);
  for(const id of srcParts.assets.keys()) {
    const a=readAsset(srcParts,id)!;
    const entry=manifest.assets.find(e=>e.id===id);
    if(!entry || a.hash!==entry.sha256 || a.mime!==entry.mime)fail(`Asset ${id} does not match the document`);
  }
  if(assets.size!==srcParts.assets.size)fail('Package contains an unreferenced asset');
  for(const card of readAllCards(srcParts))for(const id of card.assetIds)if(!assets.has(id))fail(`Card ${card.id} references missing media ${id}`);
  for(const p of readPresentations(srcParts))if(p.boardId!==meta.boardId || (p.assetId && !assets.has(p.assetId)) || (p.cardId && !srcParts.cards.has(p.cardId)))fail('Presentation references missing media or card');
  // Imported metadata cannot grant tools (MOT-31): Autopilot never arrives switched on.
  const agentMode = meta.agentMode === 'autopilot' ? 'together' : meta.agentMode;
  if(meta.magazine?.apparelAssetIds.some(id=>!assets.has(id)||!readAsset(srcParts,id)?.apparel))fail('Magazine preference references missing apparel');
  const fresh = createTrip({ title: meta.title, city: meta.city, cityId:meta.cityId,countryCode:meta.countryCode,timeZone: meta.timeZone, kind: meta.kind, dates: meta.dates, party: meta.party, agentMode, magazine:meta.magazine,groupPreferences:meta.groupPreferences,groupBallots:meta.groupBallots,groupWorkspace:meta.groupWorkspace,newId: options.newId });
  const dstParts = tripParts(fresh);
  fresh.transact(() => {
    for(const [key,value] of srcParts.clock)if(key.startsWith('groupResponse:'))dstParts.clock.set(key,structuredClone(value));
    for (const card of readAllCards(srcParts)) writeCard(dstParts, card);
    for (const assetId of srcParts.assets.keys()) { const a = readAsset(srcParts, assetId); if (a) writeAsset(dstParts, a); }
    for(const p of readPresentations(srcParts))writePresentation(dstParts,{...p,boardId:readTripMeta(fresh).boardId});
  });
  return { doc: fresh, assets, ...(manifest.version===1?{originalPackage:bytes.slice()}:{}) };
  } finally {source.destroy();}
}
export type { Y };
