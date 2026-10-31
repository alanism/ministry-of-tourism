import { boardCardRect } from './board-geometry.ts';
import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
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
import { TRIP_PACKAGE_LIMITS, TRIP_PACKAGE_VERSION, exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
import {
  TRIP_SCHEMA_VERSION,
  presentationSchema,
  tripMetaSchema,
  type Presentation,
  type TripCard,
} from './schema.ts';

const baseMeta = {
  schemaVersion: TRIP_SCHEMA_VERSION,
  boardId: 'board-1',
  kind: 'traveler',
  title: 'Trip',
  city: 'Lisbon',
  timeZone: 'Europe/Lisbon',
  agentMode: 'together',
} as const;

function card(id: string, x: number, y: number, patch: Partial<TripCard> = {}): TripCard {
  return {
    id,
    kind: 'note',
    title: `Title ${id}`,
    body: `Body ${id}`,
    stage: 'plan',
    scope: 'guide',
    provenance: 'traveler',
    assetIds: [],
    x,
    y,
    createdBy: 'traveler-1',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  };
}

function legacyVersionBytes(doc: Parameters<typeof encodeTrip>[0], version: 1 | 2): Uint8Array {
  tripParts(doc).meta.set('schemaVersion', version);
  return encodeTrip(doc);
}

describe('G6 schema 3 foundation using existing APIs', () => {
  it('makes schema 3 current while the native outer package remains version 2 with unchanged limits', () => {
    expect(TRIP_SCHEMA_VERSION).toBe(3);
    expect(TRIP_PACKAGE_VERSION).toBe(2);
    expect(TRIP_PACKAGE_LIMITS).toEqual({ fileBytes: 10 * 1024 * 1024, totalBytes: 50 * 1024 * 1024 });
  });

  it('accepts a valid current schema 3 document through loadTrip', () => {
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'board-v3' });
    writeCard(tripParts(doc), card('card-1', 1200, 900));
    const loaded = loadTrip(encodeTrip(doc));
    expect(readTripMeta(loaded)).toMatchObject({ schemaVersion: 3, boardId: 'board-v3' });
    expect(readAllCards(tripParts(loaded))[0]).toMatchObject({ id: 'card-1', x: 1200, y: 900 });
    loaded.destroy();
    doc.destroy();
  });

  it.each([
    { name: 'default footprint at x1200 y900', input: { x: 1200, y: 900 }, expected: { x: 1200, y: 900, width: 1200, height: 900, stack: 0 } },
    { name: 'default footprint at x5000 y4000', input: { x: 5000, y: 4000 }, expected: { x: 5000, y: 4000, width: 1200, height: 900, stack: 0 } },
    { name: 'explicit footprint and integer stack', input: { x: 8000, y: 8000, boardWidth: 1600, boardHeight: 1000, boardStack: 2 }, expected: { x: 8000, y: 8000, width: 1600, height: 1000, stack: 2 } },
    { name: 'explicit footprint exactly fitting the 10000 board', input: { x: 8400, y: 9000, boardWidth: 1600, boardHeight: 1000, boardStack: -3 }, expected: { x: 8400, y: 9000, width: 1600, height: 1000, stack: -3 } },
  ])('boardCardRect accepts $name', ({ input, expected }) => {
    expect(boardCardRect(input)).toEqual(expected);
  });

  it.each([
    { name: 'negative x', input: { x: -25, y: 0 } },
    { name: 'negative y', input: { x: 0, y: -25 } },
    { name: 'default footprint x overflow at 8801', input: { x: 8801, y: 0 } },
    { name: 'default footprint y overflow at 9101', input: { x: 0, y: 9101 } },
    { name: 'boardWidth below minimum', input: { x: 0, y: 0, boardWidth: 399 } },
    { name: 'boardHeight above maximum', input: { x: 0, y: 0, boardHeight: 5001 } },
    { name: 'non-integer stack', input: { x: 0, y: 0, boardStack: 1.5 } },
    { name: 'array stack', input: { x: 0, y: 0, boardStack: [2] } },
    { name: 'non-finite coordinate', input: { x: Number.NaN, y: 0 } },
  ])('boardCardRect rejects $name', ({ input }) => {
    expect(() => boardCardRect(input as unknown as Parameters<typeof boardCardRect>[0])).toThrow(RangeError);
  });

  it('keeps TripCard board fields optional, preserves explicit values through write/read/roundtrip, and does not invent defaults', () => {
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'board-cards' });
    const parts = tripParts(doc);
    writeCard(parts, card('explicit', 100, 200, { boardWidth: 1600, boardHeight: 1000, boardStack: 2 }));
    writeCard(parts, card('defaulted', 1200, 900));

    const written = readAllCards(parts);
    expect(written.find((item) => item.id === 'explicit')).toMatchObject({ boardWidth: 1600, boardHeight: 1000, boardStack: 2 });
    const defaulted = written.find((item) => item.id === 'defaulted')!;
    expect(defaulted).not.toHaveProperty('boardWidth');
    expect(defaulted).not.toHaveProperty('boardHeight');
    expect(defaulted).not.toHaveProperty('boardStack');
    expect(boardCardRect(defaulted)).toEqual({ x: 1200, y: 900, width: 1200, height: 900, stack: 0 });

    const loaded = loadTrip(encodeTrip(doc));
    const roundTripped = readAllCards(tripParts(loaded));
    expect(roundTripped.find((item) => item.id === 'explicit')).toMatchObject({ boardWidth: 1600, boardHeight: 1000, boardStack: 2 });
    expect(roundTripped.find((item) => item.id === 'defaulted')).not.toHaveProperty('boardWidth');
    loaded.destroy();
    doc.destroy();
  });

  it('does not put board geometry on TripMeta and rejects board or unknown fields there', () => {
    const parsed = tripMetaSchema.parse(baseMeta);
    expect(parsed).toMatchObject({ schemaVersion: 3, boardId: 'board-1' });
    expect(parsed).not.toHaveProperty('boardWidth');
    expect(parsed).not.toHaveProperty('boardHeight');
    expect(parsed).not.toHaveProperty('boardStack');
    expect(() => tripMetaSchema.parse({ ...baseMeta, boardWidth: 1600 })).toThrow();
    expect(() => tripMetaSchema.parse({ ...baseMeta, boardHeight: 1000 })).toThrow();
    expect(() => tripMetaSchema.parse({ ...baseMeta, boardStack: 2 })).toThrow();
    expect(() => tripMetaSchema.parse({ ...baseMeta, unknownField: true })).toThrow();
  });

  it('treats absent presentation surface as magazine and allows magazine rotation 15 unchanged', () => {
    const magazine: Presentation = {
      id: 'pres-magazine', boardId: 'board-1', cardId: 'card-1', x: 0.1, y: 0.2, width: 0.4, height: 0.3,
      crop: [0, 0, 1, 1], rotation: 15, zIndex: 1, locked: false, scope: 'guide',
    };
    expect(presentationSchema.parse(magazine)).toEqual(magazine);
    expect(presentationSchema.parse(magazine).surface).toBeUndefined();
    expect(presentationSchema.parse({ ...magazine, surface: 'magazine' })).toMatchObject({ surface: 'magazine', rotation: 15 });
  });

  it.each([
    { name: 'valid board asset at rotation 0', patch: {}, valid: true },
    { name: 'board rotation 15', patch: { rotation: 15 }, valid: false },
    { name: 'board presentation with cardId', patch: { cardId: 'card-1' }, valid: false },
    { name: 'board presentation without assetId', patch: { assetId: undefined }, valid: false },
    { name: 'unknown surface', patch: { surface: 'poster' }, valid: false },
    { name: 'board width below the 100 board-unit minimum', patch: { width: 0.009 }, valid: false },
    { name: 'board height below the 100 board-unit minimum', patch: { height: 0.009 }, valid: false },
    { name: 'board rectangle overflowing the 10000 board in x', patch: { x: 0.99, width: 0.02 }, valid: false },
    { name: 'board rectangle overflowing the 10000 board in y', patch: { y: 0.99, height: 0.02 }, valid: false },
    { name: 'board rectangle exactly fitting the board', patch: { x: 0.9, y: 0.9, width: 0.1, height: 0.1 }, valid: true },
  ])('validates board presentation: $name', ({ patch, valid }) => {
    const board = {
      id: 'pres-board', boardId: 'board-1', assetId: 'asset-1', surface: 'board', x: 0.25, y: 0.25, width: 0.5, height: 0.5,
      crop: [0, 0, 1, 1], rotation: 0, zIndex: 2, locked: true, scope: 'guide', ...patch,
    } as unknown as Presentation;
    if (valid) expect(presentationSchema.parse(board)).toMatchObject({ surface: 'board', rotation: 0 });
    else expect(() => presentationSchema.parse(board)).toThrow();
  });

  it('preserves explicit card geometry and both presentation surfaces through revision and native export/import', async () => {
    const assetBytes = strToU8('surface image bytes');
    const hash = await sha256Hex(assetBytes);
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'board-surfaces' });
    const parts = tripParts(doc);
    writeAsset(parts, { id: 'asset-1', hash, mime: 'image/png', role: 'original', credit: 'Creator', rightsStatus: 'approved', source: { id: 'asset-source', retrievedAt: '2026-01-02T00:00:00.000Z' } });
    writeCard(parts, { ...card('card-1', 20, 30, { boardWidth: 1600, boardHeight: 1000, boardStack: 2 }), assetIds: ['asset-1'] });
    writeCard(parts, { ...card('card-1', 20, 30, { boardWidth: 1600, boardHeight: 1000, boardStack: 2, title: 'Revised title' }), assetIds: ['asset-1'] });
    writePresentation(parts, { id: 'pres-magazine', boardId: 'board-surfaces', cardId: 'card-1', assetId: 'asset-1', x: 0.1, y: 0.1, width: 0.3, height: 0.3, crop: [0, 0, 1, 1], rotation: 15, zIndex: 1, locked: false, scope: 'guide' });
    writePresentation(parts, { id: 'pres-board', boardId: 'board-surfaces', assetId: 'asset-1', surface: 'board', x: 0.5, y: 0.5, width: 0.25, height: 0.25, crop: [0, 0, 1, 1], rotation: 0, zIndex: 2, locked: false, scope: 'guide' });

    expect(readAllCards(parts)[0]).toMatchObject({ title: 'Revised title', boardWidth: 1600, boardHeight: 1000, boardStack: 2 });
    expect(() => writePresentation(parts, { id: 'bad-board', boardId: 'board-surfaces', assetId: 'asset-1', surface: 'board', x: 0, y: 0, width: 0.2, height: 0.2, crop: [0, 0, 1, 1], rotation: 15, zIndex: 3, locked: false, scope: 'guide' })).toThrow();

    const pkg = await exportTripPackage(doc, new Map([['asset-1', assetBytes]]), { includePrivate: true });
    const imported = await importTripPackage(pkg, { newId: () => 'board-imported' });
    const importedParts = tripParts(imported.doc);
    expect(readTripMeta(imported.doc)).toMatchObject({ schemaVersion: 3, boardId: 'board-imported' });
    expect(readTripMeta(imported.doc)).not.toHaveProperty('boardWidth');
    expect(readAllCards(importedParts)[0]).toMatchObject({ boardWidth: 1600, boardHeight: 1000, boardStack: 2 });
    expect(readAsset(importedParts, 'asset-1')).toMatchObject({ hash, credit: 'Creator', rightsStatus: 'approved' });
    const presentations = readPresentations(importedParts);
    expect(presentations.find((item) => item.id === 'pres-magazine')).toMatchObject({ rotation: 15, boardId: 'board-imported' });
    expect(presentations.find((item) => item.id === 'pres-magazine')!.surface).toBeUndefined();
    expect(presentations.find((item) => item.id === 'pres-board')).toMatchObject({ surface: 'board', assetId: 'asset-1', rotation: 0, boardId: 'board-imported' });
    imported.doc.destroy();
    doc.destroy();
  });

  it.each([1, 2] as const)('migrates in-bounds legacy v%s changing only the schema version and preserving original bytes', (version) => {
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: `board-v${version}` });
    writeCard(tripParts(doc), card('at-default-origin', 1200, 900));
    writeCard(tripParts(doc), card('far-inside', 5000, 4000));
    const bytes = legacyVersionBytes(doc, version);
    const before = bytes.slice();
    const migrated = loadTripWithMigration(bytes);
    expect(migrated.migrated).toBe(true);
    expect(migrated.original).toEqual(before);
    expect(bytes).toEqual(before);
    expect(readTripMeta(migrated.doc)).toMatchObject({ schemaVersion: 3, boardId: `board-v${version}` });
    expect(readTripMeta(migrated.doc)).not.toHaveProperty('boardWidth');
    const cards = readAllCards(tripParts(migrated.doc));
    expect(cards.find((item) => item.id === 'at-default-origin')).toMatchObject({ x: 1200, y: 900 });
    expect(cards.find((item) => item.id === 'far-inside')).toMatchObject({ x: 5000, y: 4000 });
    for (const item of cards) {
      expect(item).not.toHaveProperty('boardWidth');
      expect(item).not.toHaveProperty('boardHeight');
      expect(item).not.toHaveProperty('boardStack');
    }
    migrated.doc.destroy();
    doc.destroy();
  });

  it('refuses legacy migration when a raw-mutated legacy card is outside the 10000 board', () => {
    const doc = createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'board-outside' });
    const parts = tripParts(doc);
    writeCard(parts, card('outside', 0, 0));
    parts.cards.get('outside')!.set('y', 9101);
    const bytes = legacyVersionBytes(doc, 2);
    const before = bytes.slice();
    let caught: unknown;
    try { loadTripWithMigration(bytes); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/geometry|bounds|recover/i);
    expect((caught as Error & { original?: Uint8Array }).original).toEqual(before);
    expect(bytes).toEqual(before);
    doc.destroy();
  });
});
