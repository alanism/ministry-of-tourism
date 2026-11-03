import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as Y from 'yjs';
import { fromBase64, toBase64 } from '../doc/board-file.ts';
import {
  createTrip,
  readAllCards,
  readAsset,
  readPresentations,
  readTripMeta,
  tripParts,
  writeAsset,
  writeCard,
  writePresentation,
} from './model.ts';
import { encodeTrip, loadTrip, loadTripWithMigration } from './persist.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
import { inspectLegacyTrip, repairLegacyTrip } from './trip-recovery.ts';
import type { TripCard } from './schema.ts';

const BOARD_ID = 'legacy-board-1';
const FORMAT_HASH = 'a'.repeat(64);

function card(id: string, x: number, y: number, patch: Partial<TripCard> = {}): TripCard {
  return {
    id, kind: 'note', title: `Title ${id}`, body: `Body ${id}`, stage: 'plan', scope: 'private', provenance: 'traveler',
    source: { id: `source:${id}`, url: 'https://example.test/source', retrievedAt: '2026-01-02T00:00:00.000Z' },
    sourceText: `Source text ${id}`, travelerNote: `Private note ${id}`, assetIds: [], x, y,
    createdBy: 'traveler-1', updatedAt: '2026-01-02T00:00:00.000Z', ...patch,
  };
}

interface LegacyOptions {
  asset?: boolean;
  presentations?: boolean;
  mutateDoc?: (doc: Y.Doc) => void;
}

function legacyBytes(version: 1 | 2, cards: TripCard[], options: LegacyOptions = {}): Uint8Array {
  const doc = createTrip({ title: 'Legacy trip', city: 'Lisbon', cityId: 'lisbon', countryCode: 'PT', timeZone: 'Europe/Lisbon', kind: 'traveler', boardId: BOARD_ID });
  const parts = tripParts(doc);
  if (options.asset) {
    writeAsset(parts, { id: 'asset-1', hash: FORMAT_HASH, mime: 'image/png', role: 'original', caption: 'Private caption', credit: 'A. Photographer', rightsStatus: 'restricted', source: { id: 'asset:source', retrievedAt: '2026-01-02T00:00:00.000Z' } });
  }
  for (const item of cards) {
    // Write only valid schema 3 geometry, then raw-mutate the stored Y.Map.
    // This creates a genuine legacy fixture without asking the current code
    // to accept coordinates that schema 3 must reject.
    writeCard(parts, { ...item, x: 0, y: 0 });
    const stored = parts.cards.get(item.id)!;
    stored.set('x', item.x);
    stored.set('y', item.y);
  }
  if (options.presentations) {
    writePresentation(parts, { id: 'pres-1', boardId: BOARD_ID, assetId: 'asset-1', x: 0.1, y: 0.2, width: 0.4, height: 0.3, crop: [0, 0, 1, 1], rotation: 15, zIndex: 1, locked: false, scope: 'guide' });
  }
  parts.meta.set('schemaVersion', version);
  options.mutateDoc?.(doc);
  const bytes = encodeTrip(doc);
  doc.destroy();
  return bytes;
}

function thrown(fn: () => unknown): Error & { original?: Uint8Array } {
  try { fn(); } catch (error) { return error as Error & { original?: Uint8Array }; }
  throw new Error('Expected function to throw');
}

type ReadablePackage = {
  meta: Record<string, unknown>;
  cards?: Array<Record<string, unknown>>;
  presentations?: Array<Record<string, unknown>>;
};

async function nativePackage(version: 1 | 2): Promise<Uint8Array> {
  const assetBytes = strToU8('fictional image bytes');
  const hash = await sha256Hex(assetBytes);
  const doc = createTrip({ title: 'Native legacy trip', city: 'Lisbon', cityId: 'lisbon', countryCode: 'PT', timeZone: 'Europe/Lisbon', kind: 'traveler', boardId: BOARD_ID });
  const parts = tripParts(doc);
  writeAsset(parts, { id: 'asset-1', hash, mime: 'image/png', role: 'original', caption: 'Private caption', credit: 'A. Photographer', rightsStatus: 'restricted', source: { id: 'asset:source', retrievedAt: '2026-01-02T00:00:00.000Z' } });
  writeCard(parts, card('card-1', 10, 20, { assetIds: ['asset-1'] }));
  writePresentation(parts, { id: 'pres-1', boardId: BOARD_ID, cardId: 'card-1', assetId: 'asset-1', x: 0.1, y: 0.2, width: 0.4, height: 0.3, crop: [0, 0, 1, 1], rotation: 15, zIndex: 1, locked: false, scope: 'private' });
  const exported = await exportTripPackage(doc, new Map([['asset-1', assetBytes]]), { includePrivate: true, created: '2026-01-03T00:00:00.000Z' });
  doc.destroy();

  const files = unzipSync(exported);
  const inner = new Y.Doc();
  Y.applyUpdate(inner, fromBase64(strFromU8(files['document.b64']!).trim()));
  tripParts(inner).meta.set('schemaVersion', version);
  files['document.b64'] = strToU8(toBase64(Y.encodeStateAsUpdate(inner)));
  inner.destroy();

  const readable = JSON.parse(strFromU8(files['trip.json']!)) as ReadablePackage;
  readable.meta.schemaVersion = version;
  delete readable.meta.boardWidth; delete readable.meta.boardHeight; delete readable.meta.boardStack;
  for (const item of readable.cards ?? []) { delete item.boardWidth; delete item.boardHeight; delete item.boardStack; }
  for (const item of readable.presentations ?? []) delete item.surface;
  files['trip.json'] = strToU8(JSON.stringify(readable, null, 2));
  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>;
  manifest.version = version;
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files);
}

describe('G6 legacy inspection', () => {
  it.each([1, 2] as const)('inspects in-bounds v%s preserving private/source/credit/rights as detached plain data', (version) => {
    const bytes = legacyBytes(version, [card('card-1', 1200, 900, { assetIds: ['asset-1'] }), card('card-2', 5000, 4000)], { asset: true, presentations: true });
    const before = bytes.slice();
    const result = inspectLegacyTrip(bytes);
    expect(result.version).toBe(version);
    expect(result.meta).toMatchObject({ schemaVersion: version, boardId: BOARD_ID, title: 'Legacy trip' });
    expect(result.meta).not.toHaveProperty('boardWidth');
    expect(result.meta).not.toHaveProperty('boardHeight');
    expect(result.meta).not.toHaveProperty('boardStack');
    expect(result.issues).toEqual([]);
    expect(result.cards.find((item) => item.id === 'card-1')).toMatchObject({ x: 1200, y: 900, scope: 'private', sourceText: 'Source text card-1', travelerNote: 'Private note card-1', source: { id: 'source:card-1', url: 'https://example.test/source' } });
    expect(result.assets.find((item) => item.id === 'asset-1')).toMatchObject({ caption: 'Private caption', credit: 'A. Photographer', rightsStatus: 'restricted', source: { id: 'asset:source' } });
    expect(result.presentations.find((item) => item.id === 'pres-1')).toMatchObject({ boardId: BOARD_ID, assetId: 'asset-1', rotation: 15 });
    result.cards.find((item) => item.id === 'card-1')!.title = 'Mutated outside';
    result.meta.title = 'Mutated outside';
    const again = inspectLegacyTrip(bytes);
    expect(again.cards.find((item) => item.id === 'card-1')!.title).toBe('Title card-1');
    expect(again.meta.title).toBe('Legacy trip');
    expect(bytes).toEqual(before);
  });

  it('reports only negative/default-footprint-overflow cards as issues, using 1200x900 and no invented coordinates', () => {
    const bytes = legacyBytes(2, [
      card('valid-low', 1200, 900),
      card('valid-far', 5000, 4000),
      card('negative', -25, 20),
      card('x-overflow', 8801, 0),
      card('y-overflow', 0, 9101),
    ]);
    const result = inspectLegacyTrip(bytes);
    expect(result.issues.map((issue) => issue.id).sort()).toEqual(['negative', 'x-overflow', 'y-overflow']);
    for (const issue of result.issues) {
      expect(issue).toMatchObject({ width: 1200, height: 900 });
      expect(issue.reason).toMatch(/geometry|bounds|outside|overflow/i);
    }
    expect(result.issues.find((issue) => issue.id === 'negative')).toMatchObject({ x: -25, y: 20 });
    expect(result.issues.find((issue) => issue.id === 'x-overflow')).toMatchObject({ x: 8801, y: 0 });
    expect(result.issues.find((issue) => issue.id === 'y-overflow')).toMatchObject({ x: 0, y: 9101 });
    expect(result.cards.find((item) => item.id === 'negative')).toMatchObject({ x: -25, y: 20 });
  });

  it('rejects corrupt and unknown/missing versions in the inspector; loadTrip rejects only non-current unknown/missing versions', () => {
    expect(() => inspectLegacyTrip(new Uint8Array([255, 255, 255, 255]))).toThrow();
    expect(() => inspectLegacyTrip(strToU8('not a trip document'))).toThrow();
    for (const version of [0, 3, 4, 999]) {
      const bytes = legacyBytes(2, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).meta.set('schemaVersion', version) });
      expect(() => inspectLegacyTrip(bytes)).toThrow(/version|unsupported|legacy/i);
    }
    for (const version of [0, 4, 999]) {
      const bytes = legacyBytes(2, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).meta.set('schemaVersion', version) });
      expect(() => loadTrip(bytes)).toThrow(/version|unsupported/i);
    }
    const missing = legacyBytes(1, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).meta.delete('schemaVersion') });
    expect(() => inspectLegacyTrip(missing)).toThrow(/version|unsupported/i);
    expect(() => loadTrip(missing)).toThrow(/version|unsupported/i);
  });

  it('strictly rejects v3-only and unknown fields in legacy meta, cards, and presentations', () => {
    const metaBoard = legacyBytes(2, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).meta.set('boardWidth', 1600) });
    expect(() => inspectLegacyTrip(metaBoard)).toThrow(/unknown|unsupported|legacy|boardWidth/i);
    const cardBoard = legacyBytes(2, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).cards.get('card-1')!.set('boardWidth', 1600) });
    expect(() => inspectLegacyTrip(cardBoard)).toThrow(/unknown|unsupported|legacy|boardWidth/i);
    const unknownMeta = legacyBytes(1, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).meta.set('futureLayout', { lost: true }) });
    expect(() => inspectLegacyTrip(unknownMeta)).toThrow(/unknown|unsupported/i);
    const unknownCard = legacyBytes(2, [card('card-1', 0, 0)], { mutateDoc: (doc) => tripParts(doc).cards.get('card-1')!.set('futureField', true) });
    expect(() => inspectLegacyTrip(unknownCard)).toThrow(/unknown|unsupported/i);
    const surface = legacyBytes(2, [card('card-1', 0, 0, { assetIds: ['asset-1'] })], { asset: true, presentations: true, mutateDoc: (doc) => { const value = tripParts(doc).presentations.get('pres-1')!; tripParts(doc).presentations.set('pres-1', { ...value, surface: 'board' }); } });
    expect(() => inspectLegacyTrip(surface)).toThrow(/unknown|unsupported|legacy|surface/i);
  });

  it('rejects incomplete card, asset, presentation, and board references', () => {
    const missingAsset = legacyBytes(2, [card('card-1', 0, 0, { assetIds: ['missing-asset'] })]);
    expect(() => inspectLegacyTrip(missingAsset)).toThrow(/missing|reference|asset/i);
    const wrongBoard = legacyBytes(2, [card('card-1', 0, 0, { assetIds: ['asset-1'] })], { asset: true, presentations: true, mutateDoc: (doc) => { const value = tripParts(doc).presentations.get('pres-1')!; tripParts(doc).presentations.set('pres-1', { ...value, boardId: 'another-board' }); } });
    expect(() => inspectLegacyTrip(wrongBoard)).toThrow(/board|reference/i);
    const missingPresentationAsset = legacyBytes(1, [card('card-1', 0, 0, { assetIds: ['asset-1'] })], { asset: true, presentations: true, mutateDoc: (doc) => { const value = tripParts(doc).presentations.get('pres-1')!; tripParts(doc).presentations.set('pres-1', { ...value, assetId: 'missing-asset' }); } });
    expect(() => inspectLegacyTrip(missingPresentationAsset)).toThrow(/missing|reference|asset/i);
    const missingCard = legacyBytes(1, [card('card-1', 0, 0, { assetIds: ['asset-1'] })], { asset: true, presentations: true, mutateDoc: (doc) => { const value = tripParts(doc).presentations.get('pres-1')!; tripParts(doc).presentations.set('pres-1', { ...value, cardId: 'missing-card' }); } });
    expect(() => inspectLegacyTrip(missingCard)).toThrow(/missing|reference|card/i);
  });
});

describe('G6 migration through loadTripWithMigration', () => {
  it.each([1, 2] as const)('migrates in-bounds v%s in a detached copy, retains original bytes, and changes no card or meta data except version', (version) => {
    const bytes = legacyBytes(version, [card('card-1', 1200, 900, { assetIds: ['asset-1'] }), card('card-2', 5000, 4000)], { asset: true, presentations: true });
    const before = bytes.slice();
    const inspected = inspectLegacyTrip(bytes);
    const migrated = loadTripWithMigration(bytes);
    expect(migrated.migrated).toBe(true);
    expect(migrated.original).toEqual(before);
    expect(bytes).toEqual(before);
    expect(readTripMeta(migrated.doc)).toMatchObject({ schemaVersion: 3, boardId: BOARD_ID });
    expect(readTripMeta(migrated.doc)).not.toHaveProperty('boardWidth');
    expect(readTripMeta(migrated.doc)).not.toHaveProperty('boardHeight');
    expect(readTripMeta(migrated.doc)).not.toHaveProperty('boardStack');
    const migratedCards = [...readAllCards(tripParts(migrated.doc))].sort((a, b) => a.id.localeCompare(b.id));
    const inspectedCards = [...inspected.cards].sort((a, b) => a.id.localeCompare(b.id));
    expect(migratedCards).toEqual(inspectedCards);
    expect(readAsset(tripParts(migrated.doc), 'asset-1')).toMatchObject({ credit: 'A. Photographer', rightsStatus: 'restricted', caption: 'Private caption' });
    expect(readPresentations(tripParts(migrated.doc))[0]).toMatchObject({ id: 'pres-1', boardId: BOARD_ID, assetId: 'asset-1', rotation: 15 });
    migrated.doc.destroy();
  });

  it('refuses out-of-bounds legacy geometry with a recoverable error carrying untouched original bytes', () => {
    const bytes = legacyBytes(2, [card('inside', 10, 10), card('outside', 8801, 0)]);
    const before = bytes.slice();
    const error = thrown(() => loadTripWithMigration(bytes));
    expect(error.message).toMatch(/geometry|bounds|recover/i);
    expect(error.original).toEqual(before);
    expect(bytes).toEqual(before);
    expect(inspectLegacyTrip(bytes).issues.map((issue) => issue.id)).toEqual(['outside']);
  });
});

describe('G6 explicit legacy repair', () => {
  function repairable(): Uint8Array {
    return legacyBytes(1, [card('inside', 10, 10, { assetIds: ['asset-1'] }), card('left', -25, 20), card('edge', 8801, 30)], { asset: true, presentations: true });
  }
  const good = [{ id: 'left', x: 1200, y: 900 }, { id: 'edge', x: 5000, y: 4000 }];

  it.each([
    { name: 'missing all repairs', repairs: [] },
    { name: 'missing one offending card', repairs: [good[0]!] },
    { name: 'non-offending card included', repairs: [...good, { id: 'inside', x: 0, y: 0 }] },
    { name: 'unknown card included', repairs: [...good, { id: 'ghost', x: 0, y: 0 }] },
    { name: 'duplicate offending card', repairs: [good[0]!, good[0]!, good[1]!] },
    { name: 'NaN replacement', repairs: [{ id: 'left', x: Number.NaN, y: 0 }, good[1]!] },
    { name: 'infinite replacement', repairs: [{ id: 'left', x: Number.POSITIVE_INFINITY, y: 0 }, good[1]!] },
    { name: 'negative replacement', repairs: [{ id: 'left', x: -25, y: 0 }, good[1]!] },
    { name: 'x8801 default-footprint overflow replacement', repairs: [{ id: 'left', x: 8801, y: 0 }, good[1]!] },
    { name: 'y9101 default-footprint overflow replacement', repairs: [{ id: 'left', x: 0, y: 9101 }, good[1]!] },
  ])('rejects repair set with $name', ({ repairs }) => {
    expect(() => repairLegacyTrip(repairable(), repairs)).toThrow(/repair|finite|bounds|geometry|offending|missing|unknown|duplicate|only/i);
  });

  it('accepts x1200 y900 and x5000 y4000 repairs, changes only approved x/y, preserves all private metadata, and leaves source bytes untouched', () => {
    const bytes = repairable();
    const before = bytes.slice();
    const inspected = inspectLegacyTrip(bytes);
    const repaired = repairLegacyTrip(bytes, good);
    expect(bytes).toEqual(before);
    expect(inspectLegacyTrip(bytes).issues).toHaveLength(2);
    expect(readTripMeta(repaired)).toMatchObject({ schemaVersion: 3, boardId: BOARD_ID });
    expect(readTripMeta(repaired)).not.toHaveProperty('boardWidth');
    const expectedCards = inspected.cards.map((item) => {
      const repair = good.find((entry) => entry.id === item.id);
      return repair ? { ...item, x: repair.x, y: repair.y } : item;
    });
    const actualCards = [...readAllCards(tripParts(repaired))].sort((a, b) => a.id.localeCompare(b.id));
    expect(actualCards).toEqual([...expectedCards].sort((a, b) => a.id.localeCompare(b.id)));
    expect(actualCards.find((item) => item.id === 'left')).toMatchObject({ x: 1200, y: 900, scope: 'private', sourceText: 'Source text left', travelerNote: 'Private note left', source: { id: 'source:left' } });
    expect(actualCards.find((item) => item.id === 'inside')).toMatchObject({ x: 10, y: 10 });
    expect(readAsset(tripParts(repaired), 'asset-1')).toMatchObject({ credit: 'A. Photographer', rightsStatus: 'restricted', caption: 'Private caption' });
    expect(readPresentations(tripParts(repaired))[0]).toMatchObject({ id: 'pres-1', boardId: BOARD_ID, assetId: 'asset-1', rotation: 15 });
    const loaded = loadTrip(encodeTrip(repaired));
    expect(readTripMeta(loaded).schemaVersion).toBe(3);
    loaded.destroy();
    repaired.destroy();
  });
});

describe('G6 native v1/v2 package regression', () => {
  it.each([1, 2] as const)('imports a full old v%s package whose binary and readable copies contain only old fields', async (version) => {
    const pkg = await nativePackage(version);
    const before = pkg.slice();
    const files = unzipSync(pkg);
    const readable = JSON.parse(strFromU8(files['trip.json']!)) as ReadablePackage;
    expect(readable.meta.schemaVersion).toBe(version);
    expect(readable.meta).not.toHaveProperty('boardWidth');
    for (const item of readable.cards ?? []) {
      expect(item).not.toHaveProperty('boardWidth');
      expect(item).not.toHaveProperty('boardHeight');
      expect(item).not.toHaveProperty('boardStack');
    }
    for (const item of readable.presentations ?? []) expect(item).not.toHaveProperty('surface');
    const binaryBytes = fromBase64(strFromU8(files['document.b64']!).trim());
    expect(inspectLegacyTrip(binaryBytes).version).toBe(version);

    const imported = await importTripPackage(pkg, { newId: () => `fresh-board-${version}` });
    expect(pkg).toEqual(before);
    expect(readTripMeta(imported.doc)).toMatchObject({ schemaVersion: 3, boardId: `fresh-board-${version}` });
    expect(readTripMeta(imported.doc).boardId).not.toBe(BOARD_ID);
    expect(readTripMeta(imported.doc)).not.toHaveProperty('boardWidth');
    expect(readAllCards(tripParts(imported.doc))[0]).toMatchObject({ id: 'card-1', scope: 'private', sourceText: 'Source text card-1', travelerNote: 'Private note card-1', assetIds: ['asset-1'] });
    const assetBytes = strToU8('fictional image bytes');
    expect(readAsset(tripParts(imported.doc), 'asset-1')).toMatchObject({ hash: await sha256Hex(assetBytes), credit: 'A. Photographer', rightsStatus: 'restricted', caption: 'Private caption' });
    expect(readPresentations(tripParts(imported.doc))[0]).toMatchObject({ assetId: 'asset-1', boardId: `fresh-board-${version}`, rotation: 15 });
    expect(imported.assets.get('asset-1')).toEqual(assetBytes);
    imported.doc.destroy();
  });

  it('does not merely relabel a v2 package whose readable card carries a v3-only board field', async () => {
    const pkg = await nativePackage(2);
    const files = unzipSync(pkg);
    const readable = JSON.parse(strFromU8(files['trip.json']!)) as ReadablePackage;
    readable.cards![0]!.boardWidth = 1600;
    files['trip.json'] = strToU8(JSON.stringify(readable));
    await expect(importTripPackage(zipSync(files))).rejects.toThrow(/readable|unknown|unsupported|schema|boardWidth/i);
  });

  it('does not merely relabel a v1 package whose binary document carries an unknown field', async () => {
    const pkg = await nativePackage(1);
    const files = unzipSync(pkg);
    const inner = new Y.Doc();
    Y.applyUpdate(inner, fromBase64(strFromU8(files['document.b64']!).trim()));
    tripParts(inner).meta.set('futureLayout', { lost: true });
    files['document.b64'] = strToU8(toBase64(Y.encodeStateAsUpdate(inner)));
    inner.destroy();
    await expect(importTripPackage(zipSync(files))).rejects.toThrow(/document|unknown|unsupported|damaged|newer/i);
  });
});
