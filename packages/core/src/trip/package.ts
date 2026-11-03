import {TRIP_PACKAGE_LIMITS} from './package-limits.ts';
import {sha256Hex} from './sha256.ts';
export {sha256Hex} from './sha256.ts';
import {VOTING_SEAL_PREFIX} from './voting-contract.ts';
import {validateVotingLifecycle} from './voting-lifecycle.ts';
import {agentGuidance,startHereMarkdown} from './guidance.ts';
// Trip package export (MOT-30). ZIP via fflate: small, maintained, no native deps.
import { zipSync, strToU8 } from 'fflate';
import * as Y from 'yjs';
import { assertShareableAsset, createTrip, presentationScope, readAllCards, readAsset, readMagazineApparel, readPresentations, readTripMeta, tripParts, writeAsset, writeCard, writePresentation } from './model.ts';
import { selectedAssetClosure } from './asset-closure.ts';
import { encodeTrip } from './persist.ts';
import { inspectLegacyTrip } from './trip-recovery.ts';
import { stripImageMetadata } from './image-meta.ts';
import { toBase64 } from '../doc/board-file.ts';

export const TRIP_PACKAGE_FORMAT = 'ministry-of-tourism-trip';
export interface PackageAsset { id: string; file: string; size: number; sha256: string; mime: string; }

/** Owner-private full backup at the validated document's original legacy version: native ZIP containing the exact original binary document, a readable legacy copy, and every referenced asset's available bytes. This is not a raw-document export. */
export async function exportLegacyTripPackage(bytes: Uint8Array, assetBytes: Map<string, Uint8Array> = new Map()): Promise<Uint8Array> {
  const inspected = inspectLegacyTrip(bytes);
  const files: Record<string, Uint8Array> = {};
  const assets: PackageAsset[] = [];
  for (const asset of [...inspected.assets].sort((a, b) => a.id.localeCompare(b.id))) {
    const original = assetBytes.get(asset.id);
    if (!original) throw new Error(`Missing asset bytes for ${asset.id}; nothing was exported`);
    if (original.length > TRIP_PACKAGE_LIMITS.fileBytes) throw new Error(`Asset ${asset.id} is too large for a portable package (10 MiB per file); nothing was exported`);
    if (/[\\/]/.test(asset.id) || asset.id === '.' || asset.id === '..') throw new Error(`Unsafe asset path for ${asset.id}; nothing was exported`);
    if (/(?:html|javascript|svg|xml)/i.test(asset.mime)) throw new Error(`Active MIME type for asset ${asset.id}; nothing was exported`);
    const sha256 = await sha256Hex(original);
    if (sha256 !== asset.hash) throw new Error(`Asset ${asset.id} bytes do not match its recorded hash; nothing was exported`);
    const file = `assets/${asset.id}`;
    assets.push({ id: asset.id, file, size: original.length, sha256, mime: asset.mime });
    files[file] = original;
  }
  const manifest = { format: TRIP_PACKAGE_FORMAT, version: inspected.version, boardId: inspected.meta.boardId, created: new Date().toISOString(), assets };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['document.b64'] = strToU8(toBase64(bytes.slice()));
  files['trip.json'] = strToU8(JSON.stringify({ meta: inspected.meta, cards: inspected.cards, presentations: inspected.presentations }, null, 2));
  const values = Object.values(files);
  if (values.some(data => data.length > TRIP_PACKAGE_LIMITS.fileBytes) || values.reduce((size, data) => size + data.length, 0) > TRIP_PACKAGE_LIMITS.totalBytes) throw new Error('This package exceeds its portable import limit (10 MiB per file, 50 MiB total); nothing was exported');
  const zip = zipSync(files, { level: 6 });
  if (zip.length > TRIP_PACKAGE_LIMITS.totalBytes) throw new Error('This package is too large to reopen (50 MiB total); nothing was exported');
  return zip;
}

/**
 * includePrivate: a full backup for the owner, photos byte for byte. Without it (a copy to share),
 * private cards never export and photos lose their location and other metadata (MOT-32).
 */
export interface ExportOptions { selectedCardIds?: Set<string>; created?: string; includePrivate?: boolean; variant?: 'guide'|'stay'|'private'; }
export const TRIP_PACKAGE_VERSION=2;
export {TRIP_PACKAGE_LIMITS} from './package-limits.ts';

/** Export a ZIP: manifest.json, document (base64 Yjs update), readable trip.json, assets/. */
export async function exportTripPackage(doc: Y.Doc, assetBytes: Map<string, Uint8Array> = new Map(), options: ExportOptions = {}): Promise<Uint8Array> {
  const sourceMeta = readTripMeta(doc);
  const parts = tripParts(doc);
  const all = readAllCards(parts);
  const variant=options.variant ?? (options.includePrivate?'private':'stay');
  const personal=variant==='private';
  const apparel=options.selectedCardIds?[]:readMagazineApparel(parts,personal);
  const preference=sourceMeta.magazine;
  const magazine=preference&&apparel.some(asset=>asset.id===preference.wornTeeAssetId)?{...preference,apparelAssetIds:apparel.map(asset=>asset.id)}:undefined;
  const {magazine:omitted,groupPreferences,groupBallots,groupWorkspace,groupVotingVersion,memoryWorkflow,keepsakeSelection,...plainMeta}=sourceMeta;
  const included=(scope:string)=>personal || (variant==='guide'?scope==='guide':scope!=='private');
  const cards = all.filter(c=>included(c.scope) && (!options.selectedCardIds || options.selectedCardIds.has(c.id)));
  const cardIds=new Set(cards.map(c=>c.id));
  const retainedReactions=Object.fromEntries(Object.entries(memoryWorkflow?.reactions??{}).filter(([id])=>cardIds.has(id)));
  if(personal)await validateVotingLifecycle(doc);
  const meta={...plainMeta,...(personal&&groupVotingVersion?{groupVotingVersion}:{}),...(personal&&groupPreferences?{groupPreferences}:{}),...(personal&&groupBallots?{groupBallots}:{}),...(personal&&groupWorkspace?{groupWorkspace}:{}),...(magazine?{magazine}:{}),...(keepsakeSelection&&cardIds.has(keepsakeSelection.cardId)?{keepsakeSelection}:{}),...(memoryWorkflow&&Object.keys(retainedReactions).length?{memoryWorkflow:{version:1 as const,reactions:retainedReactions}}:{})};
  const presentations=readPresentations(parts).filter(p=>included(presentationScope(parts,p)) && (!p.cardId || cardIds.has(p.cardId)) && (!options.selectedCardIds || !!p.cardId));
  const wantedAssets = new Set([...cards.flatMap((c) => c.assetIds),...presentations.flatMap(p=>p.assetId?[p.assetId]:[]),...apparel.map(asset=>asset.id)]);
  if (personal) for (const asset of selectedAssetClosure(parts,wantedAssets)) wantedAssets.add(asset.id);
  const assets: PackageAsset[] = [];
  const files: Record<string, Uint8Array> = {};
  const hashes = new Map<string, string>();
  for (const assetId of wantedAssets) {
    const original = assetBytes.get(assetId);
    if (!original) throw new Error(`Missing asset bytes for ${assetId}; nothing was exported`);
    if(original.length>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error(`Asset ${assetId} is too large for a portable package (10 MiB per file); nothing was exported`);
    const asset=readAsset(parts,assetId);
    if(!asset)throw new Error(`Missing asset metadata for ${assetId}`);
    if(!personal)assertShareableAsset(asset);
    const mime = asset.mime;
    const bytes = personal ? original : stripImageMetadata(original, mime);
    const file = `assets/${assetId}`;
    const sha256 = await sha256Hex(bytes);
    hashes.set(assetId, sha256);
    assets.push({ id: assetId, file, size: bytes.length, sha256, mime });
    files[file] = bytes;
  }
  const manifest = { format: TRIP_PACKAGE_FORMAT, version: TRIP_PACKAGE_VERSION, boardId: meta.boardId, created: options.created ?? new Date().toISOString(), assets };
  const readable = { meta, cards, presentations, agent_guidance:agentGuidance() };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  // The document must contain only exported cards: encoding the live doc would leak private cards.
  const filtered = createTrip({ title: meta.title, city: meta.city, cityId:meta.cityId,countryCode:meta.countryCode,timeZone: meta.timeZone, kind: meta.kind, boardId: meta.boardId, dates: meta.dates, party: meta.party, agentMode: meta.agentMode, lineage: meta.lineage,magazine:meta.magazine,groupPreferences:meta.groupPreferences,groupBallots:meta.groupBallots,groupWorkspace:meta.groupWorkspace,groupVotingVersion:meta.groupVotingVersion,memoryWorkflow:meta.memoryWorkflow,keepsakeSelection:meta.keepsakeSelection });
  const filteredParts = tripParts(filtered);
  filtered.transact(() => {
    if(personal)for(const [key,value] of parts.clock)if(key.startsWith('groupResponse:')||key.startsWith(VOTING_SEAL_PREFIX))filteredParts.clock.set(key,structuredClone(value));
    for (const c of cards) writeCard(filteredParts, c);
    // A stripped photo is new bytes, so its metadata carries the new hash.
    for (const assetId of wantedAssets) { const a = readAsset(parts, assetId); if (a) {const hash=hashes.get(assetId)??a.hash;writeAsset(filteredParts, { ...a, hash,...(a.apparel?{apparel:{...a.apparel,hash}}:{}) });} }
    for(const p of presentations)writePresentation(filteredParts,p);
  });
  files['document.b64'] = strToU8(toBase64(encodeTrip(filtered)));
  filtered.destroy();
  files['trip.json'] = strToU8(JSON.stringify(readable, null, 2));
  files['layout.json'] = strToU8(JSON.stringify({cards:cards.map((c) => ({ id: c.id, stage: c.stage, x: c.x, y: c.y })),presentations}, null, 2));
  files['guidance.json']=strToU8(JSON.stringify(agentGuidance(),null,2));
  files['START-HERE.md']=strToU8(startHereMarkdown(Object.keys(files).concat('START-HERE.md')));
  const values=Object.values(files);
  if(values.some(bytes=>bytes.length>TRIP_PACKAGE_LIMITS.fileBytes)||values.reduce((size,bytes)=>size+bytes.length,0)>TRIP_PACKAGE_LIMITS.totalBytes)throw new Error('This package exceeds its portable import limit (10 MiB per file, 50 MiB total); nothing was exported');
  const zip=zipSync(files,{level:6});
  if(zip.length>TRIP_PACKAGE_LIMITS.totalBytes)throw new Error('This package is too large to reopen (50 MiB total); nothing was exported');
  return zip;
}
