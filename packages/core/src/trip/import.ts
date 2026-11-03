import {agentGuidanceSchema} from './guidance.ts';
// Safe import (MOT-31): every archive is hostile until proven otherwise.
import { unzipSync, strFromU8 } from 'fflate';
import * as Y from 'yjs';
import { z } from 'zod';
import { fromBase64 } from '../doc/board-file.ts';
import { loadTrip } from './persist.ts';
import {validateStoredGroupResponses} from './group-workspace.ts';
import { createTrip, readAllCards, readAsset, readPresentations, readTripMeta, tripParts, writeAsset, writeCard, writePresentation } from './model.ts';
import { sha256Hex, TRIP_PACKAGE_FORMAT, TRIP_PACKAGE_LIMITS, TRIP_PACKAGE_VERSION } from './package.ts';
import { legacyPresentationSchema, legacyTripCardSchema, legacyTripMetaSchemaV1, legacyTripMetaSchemaV2, presentationSchema, tripCardSchema, tripMetaSchema } from './schema.ts';
import { inspectLegacyTrip } from './trip-recovery.ts';

export const TRIP_IMPORT_LIMITS = TRIP_PACKAGE_LIMITS;
const MAX_FILE = TRIP_IMPORT_LIMITS.fileBytes;
const MAX_TOTAL = TRIP_IMPORT_LIMITS.totalBytes;
const manifestSchema = z.object({
  format: z.literal(TRIP_PACKAGE_FORMAT), version: z.union([z.literal(1),z.literal(TRIP_PACKAGE_VERSION)]), boardId: z.string().min(1),
  created: z.string(), assets: z.array(z.object({ id: z.string().min(1).max(200), file: z.string(), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string() }).strict()),
}).strict();

function fail(msg: string): never { throw new Error(msg); }

async function readTripPackageArchive(bytes: Uint8Array): Promise<{ files: Record<string, Uint8Array>; manifest: z.infer<typeof manifestSchema>; assets: Map<string, Uint8Array>; documentBytes: Uint8Array }> {
  if (bytes.length > MAX_TOTAL) fail('This package is too large to import.');
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
    if (a.file !== `assets/${a.id}` || /[\\/]/.test(a.id) || a.id === '.' || a.id === '..') fail('Unsafe asset path in manifest');
    if (assets.has(a.id)) fail(`Duplicate asset ${a.id}`);
    if (/(?:html|javascript|svg|xml)/i.test(a.mime)) fail(`Active MIME type for asset ${a.id}`);
    const data = files[a.file];
    if (!data) fail(`Package is missing asset ${a.id}.`);
    if (data.length !== a.size) fail(`Asset ${a.id} size does not match its manifest.`);
    if ((await sha256Hex(data)) !== a.sha256) fail(`Asset ${a.id} failed its checksum.`);
    assets.set(a.id, data);
  }
  const docB64 = files['document.b64'];
  if (!docB64) fail('Trip package is missing its document.');
  let documentBytes: Uint8Array;
  try { documentBytes = fromBase64(strFromU8(docB64).trim()); } catch { fail('Trip package document is damaged or from a newer version.'); }
  return { files, manifest, assets, documentBytes };
}

/** Validate and import. Returns a NEW doc with a NEW boardId. Throws plain errors; caller's doc is never touched. */
export async function importTripPackage(bytes: Uint8Array, options: { newId?: () => string } = {}): Promise<{ doc: Y.Doc; assets: Map<string, Uint8Array>; originalPackage?:Uint8Array }> {
  const { files, manifest, assets, documentBytes } = await readTripPackageArchive(bytes);
  let source: Y.Doc;
  try { source = loadTrip(documentBytes); } catch { fail('Trip package document is damaged or from a newer version.'); }
  try {
  // Rebuild into a fresh doc with a new board identity, so old tokens can never match.
  const meta = readTripMeta(source);
  let binaryVersion: number = meta.schemaVersion;
  try { binaryVersion = inspectLegacyTrip(documentBytes).version; } catch { /* Current v3 documents are not legacy documents. */ }
  await validateStoredGroupResponses(source);
  if(meta.boardId!==manifest.boardId)fail('Package board identity does not match its manifest');
  const readable=files['trip.json'];
  if(meta.groupVotingVersion&&!readable)fail('Managed voting package is missing its readable capability marker');
  if(readable){
    let raw:unknown;
    try { raw=JSON.parse(strFromU8(readable)); } catch { fail('Readable trip has unknown or unsupported schema fields'); }
    const readableVersion=(raw as {meta?:{schemaVersion?:unknown}})?.meta?.schemaVersion;
    const legacyMeta=readableVersion===1?legacyTripMetaSchemaV1:readableVersion===2?legacyTripMetaSchemaV2:null;
    const parsed=legacyMeta
      ? z.object({meta:legacyMeta,cards:z.array(legacyTripCardSchema),presentations:z.array(legacyPresentationSchema).optional(),agent_guidance:agentGuidanceSchema.optional()}).strict().safeParse(raw)
      : readableVersion===3
        ? z.object({meta:tripMetaSchema,cards:z.array(tripCardSchema),presentations:z.array(presentationSchema).optional(),agent_guidance:agentGuidanceSchema.optional()}).strict().safeParse(raw)
        : {success:false as const};
    if(!parsed.success)fail('Readable trip has unknown or unsupported schema fields');
    if(parsed.data.meta.groupVotingVersion!==meta.groupVotingVersion)fail('Readable voting capability marker differs from its document');
    if(readableVersion!==binaryVersion || parsed.data.meta.boardId!==meta.boardId || parsed.data.meta.schemaVersion!==binaryVersion)fail('Readable trip version or board identity does not match its document');
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
  const fresh = createTrip({ title: meta.title, city: meta.city, cityId:meta.cityId,countryCode:meta.countryCode,timeZone: meta.timeZone, kind: meta.kind, dates: meta.dates, party: meta.party, agentMode, magazine:meta.magazine,groupPreferences:meta.groupPreferences,groupBallots:meta.groupBallots,groupWorkspace:meta.groupWorkspace,groupVotingVersion:meta.groupVotingVersion,memoryWorkflow:meta.memoryWorkflow,keepsakeSelection:meta.keepsakeSelection,newId: options.newId });
  const dstParts = tripParts(fresh);
  fresh.transact(() => {
    for(const [key,value] of srcParts.clock)if(key.startsWith('groupResponse:')||key.startsWith('votingSeal:'))dstParts.clock.set(key,structuredClone(value));
    for (const card of readAllCards(srcParts)) writeCard(dstParts, card);
    for (const assetId of srcParts.assets.keys()) { const a = readAsset(srcParts, assetId); if (a) writeAsset(dstParts, a); }
    for(const p of readPresentations(srcParts))writePresentation(dstParts,{...p,boardId:readTripMeta(fresh).boardId});
  });
  return { doc: fresh, assets, ...((binaryVersion===1||binaryVersion===2)?{originalPackage:bytes.slice()}:{}) };
  } finally {source.destroy();}
}
/** Fully validates a legacy native package (archive paths, active content, sizes, checksums, manifest/document identity, strict version-specific readable data, and all document references) without migrating it. Returns the exact original package and document bytes plus the referenced media, so a caller may offer geometry repair. */
export async function inspectLegacyTripPackage(bytes: Uint8Array): Promise<{ version: 1 | 2; inspection: ReturnType<typeof inspectLegacyTrip>; snapshot: ReturnType<typeof inspectLegacyTrip>; assetMetadata: ReturnType<typeof inspectLegacyTrip>['assets']; assets: Map<string, Uint8Array>; documentBytes: Uint8Array; originalPackage: Uint8Array }> {
  const { files, manifest, assets, documentBytes } = await readTripPackageArchive(bytes);
  let inspection: ReturnType<typeof inspectLegacyTrip>;
  try { inspection = inspectLegacyTrip(documentBytes); } catch { fail('Trip package document is damaged or from a newer version.'); }
  if (inspection.meta.boardId !== manifest.boardId) fail('Package board identity does not match its manifest');
  const readable = files['trip.json'];
  if (readable) { let raw: unknown; try { raw = JSON.parse(strFromU8(readable)); } catch { fail('Readable trip has unknown or unsupported schema fields'); } const metaSchema = inspection.version === 1 ? legacyTripMetaSchemaV1 : legacyTripMetaSchemaV2; const parsed = z.object({ meta: metaSchema, cards: z.array(legacyTripCardSchema), presentations: z.array(legacyPresentationSchema).optional(), agent_guidance: agentGuidanceSchema.optional() }).strict().safeParse(raw); if (!parsed.success) fail('Readable trip has unknown or unsupported schema fields'); if (parsed.data.meta.boardId !== inspection.meta.boardId || parsed.data.meta.schemaVersion !== inspection.version) fail('Readable trip version or board identity does not match its document'); }
  if (assets.size !== inspection.assets.length) fail('Package contains an unreferenced asset');
  for (const asset of inspection.assets) { const entry = manifest.assets.find(e => e.id === asset.id); if (!entry || asset.hash !== entry.sha256 || asset.mime !== entry.mime || !assets.has(asset.id)) fail(`Asset ${asset.id} does not match the document`); }
  for (const card of inspection.cards) for (const assetId of card.assetIds) if (!assets.has(assetId)) fail(`Card ${card.id} references missing media ${assetId}`);
  for (const p of inspection.presentations) if (p.boardId !== inspection.meta.boardId || (p.assetId && !assets.has(p.assetId))) fail('Presentation references missing media or card');
  if (inspection.meta.magazine?.apparelAssetIds.some(assetId => !assets.has(assetId))) fail('Magazine preference references missing apparel');
  return { version: inspection.version, inspection, snapshot: inspection, assetMetadata: inspection.assets, assets, documentBytes: documentBytes.slice(), originalPackage: bytes.slice() };
}
export type { Y };
