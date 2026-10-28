// Trip persistence bytes (MOT-15 core): same Yjs update bytes the web app stores in IndexedDB.
import * as Y from 'yjs';
import { TRIP_SCHEMA_VERSION } from './schema.ts';
import { readAllCards, readAsset, readPresentations, readTripMeta, tripParts } from './model.ts';

export function encodeTrip(doc: Y.Doc): Uint8Array { return Y.encodeStateAsUpdate(doc); }

/**
 * Migration hook (MOT-10): TRIP_MIGRATIONS[v] upgrades a version-v document to v + 1 in place.
 * None are needed while the schema is v1; a v2 schema adds TRIP_MIGRATIONS[1].
 */
export const TRIP_MIGRATIONS: Record<number, (doc: Y.Doc) => void> = { 1: () => {} };

export function loadTripWithMigration(update: Uint8Array): {doc:Y.Doc; original:Uint8Array|null; migrated:boolean} {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc,update);
    const meta=tripParts(doc).meta;
    const initial=meta.get('schemaVersion');
    let version=initial;
    while(typeof version==='number' && version<TRIP_SCHEMA_VERSION && TRIP_MIGRATIONS[version]) {
      const from=version;
      doc.transact(()=>{TRIP_MIGRATIONS[from]!(doc);meta.set('schemaVersion',from+1);});
      version=from+1;
    }
    if(version!==TRIP_SCHEMA_VERSION)throw new Error(`Unsupported trip version ${String(version)}; expected ${TRIP_SCHEMA_VERSION}`);
    const parts=tripParts(doc);
    readTripMeta(doc);readAllCards(parts);readPresentations(parts);
    for(const id of parts.assets.keys())readAsset(parts,id);
    const migrated=initial!==version;
    return {doc,original:migrated?update.slice():null,migrated};
  } catch(error) {doc.destroy();throw error;}
}

export function loadTrip(update: Uint8Array): Y.Doc {
  return loadTripWithMigration(update).doc;
}

/** Honest saved state for the UI: derived from bytes, never assumed. */
export function savedState(doc: Y.Doc, lastSavedBytes: Uint8Array | null, lastExportedAt: string | null): { saved: boolean; lastExportedAt: string | null } {
  if (!lastSavedBytes) return { saved: false, lastExportedAt };
  const now = encodeTrip(doc);
  const same = now.length === lastSavedBytes.length && now.every((b, i) => b === lastSavedBytes[i]);
  return { saved: same, lastExportedAt };
}
