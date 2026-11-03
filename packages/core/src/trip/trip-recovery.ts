// Legacy trip inspection and explicit repair (G6). Legacy documents are
// validated against the shapes that were current at their own version;
// they are never relabelled before that validation has succeeded.
import * as Y from 'yjs';
import { validateLocalBallot } from './group-ballot.ts';
import { readAllCards, readAsset, readPresentations, readTripMeta, tripParts } from './model.ts';
import {
  assetSchema,
  legacyPresentationSchema,
  legacyTripCardSchema,
  legacyTripMetaSchemaV1,
  legacyTripMetaSchemaV2,
  type Asset,
  type LegacyPresentation,
  type LegacyTripCard,
  type LegacyTripMeta,
} from './schema.ts';

export interface LegacyCardGeometryIssue {
  id: string;
  x: number;
  y: number;
  width: 1200;
  height: 900;
  reason: string;
}

export interface LegacyTripInspection {
  version: 1 | 2;
  meta: LegacyTripMeta;
  cards: LegacyTripCard[];
  assets: Asset[];
  presentations: LegacyPresentation[];
  issues: LegacyCardGeometryIssue[];
}

export interface LegacyCardRepair { id: string; x: number; y: number; }

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;
const BOARD_EXTENT = 10000;

function invalidLegacy(error: unknown): Error {
  if (error instanceof Error && /legacy/i.test(error.message)) return error;
  const detail = error instanceof Error ? error.message : String(error);
  if (/unrecognized key/i.test(detail)) return new Error(`Invalid legacy trip: unknown or unsupported field: ${detail}`);
  return new Error(`Invalid legacy trip: ${detail}`);
}

function parseLegacy<T>(fn: () => T): T {
  try { return fn(); } catch (error) { throw invalidLegacy(error); }
}

function inspectionFromDoc(doc: Y.Doc): LegacyTripInspection {
  const parts = tripParts(doc);
  const version = parts.meta.get('schemaVersion');
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported legacy trip version ${String(version)}; expected legacy version 1 or 2`);
  }
  const meta = parseLegacy(() => (version === 1 ? legacyTripMetaSchemaV1 : legacyTripMetaSchemaV2).parse(Object.fromEntries(parts.meta.entries())));
  // Current local group validation remains part of a complete legacy read.
  try {
    for (const ballot of meta.groupBallots ?? []) validateLocalBallot(ballot, meta.groupPreferences);
  } catch (error) { throw invalidLegacy(error); }
  if (meta.groupWorkspace && (!meta.groupPreferences || (meta.groupWorkspace.ledger && meta.groupWorkspace.ledger.trip_id !== meta.groupPreferences.trip_id))) {
    throw new Error('Invalid legacy trip: Workspace belongs to another group');
  }

  const cards: LegacyTripCard[] = [];
  const cardIds = new Set<string>();
  for (const [key, stored] of parts.cards.entries()) {
    if (!(stored instanceof Y.Map)) throw new Error(`Invalid legacy trip: Card ${key} is not a stored map`);
    const raw: Record<string, unknown> = Object.fromEntries(stored.entries());
    const body = stored.get('body');
    if (!(body instanceof Y.Text) && typeof body !== 'string') throw new Error(`Invalid legacy trip: Card ${key} body must be stored text`);
    raw.body = body instanceof Y.Text ? body.toString() : body;
    const card = parseLegacy(() => legacyTripCardSchema.parse(raw));
    if (card.id !== key) throw new Error(`Invalid legacy trip: Card map key ${key} does not match card id ${card.id}`);
    if (cardIds.has(card.id)) throw new Error(`Invalid legacy trip: Duplicate card id ${card.id}`);
    cardIds.add(card.id);
    cards.push(card);
  }

  const assets: Asset[] = [];
  const assetIds = new Set<string>();
  for (const [key, stored] of parts.assets.entries()) {
    if (!(stored instanceof Y.Map)) throw new Error(`Invalid legacy trip: Asset ${key} is not a stored map`);
    const asset = parseLegacy(() => assetSchema.parse(Object.fromEntries(stored.entries())));
    if (asset.id !== key) throw new Error(`Invalid legacy trip: Asset map key ${key} does not match asset id ${asset.id}`);
    if (assetIds.has(asset.id)) throw new Error(`Invalid legacy trip: Duplicate asset id ${asset.id}`);
    assetIds.add(asset.id);
    assets.push(asset);
  }
  for (const asset of assets) {
    if (asset.derivedFrom && !assetIds.has(asset.derivedFrom)) throw new Error(`Invalid legacy trip: Asset ${asset.id} references missing asset ${asset.derivedFrom}`);
  }

  const presentations: LegacyPresentation[] = [];
  const presentationIds = new Set<string>();
  for (const [key, stored] of parts.presentations.entries()) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || stored instanceof Y.AbstractType) {
      throw new Error(`Invalid legacy trip: Presentation ${key} is not stored plain data`);
    }
    const presentation = parseLegacy(() => legacyPresentationSchema.parse(structuredClone(stored)));
    if (presentation.id !== key) throw new Error(`Invalid legacy trip: Presentation map key ${key} does not match presentation id ${presentation.id}`);
    if (presentationIds.has(presentation.id)) throw new Error(`Invalid legacy trip: Duplicate presentation id ${presentation.id}`);
    presentationIds.add(presentation.id);
    presentations.push(presentation);
  }

  for (const card of cards) {
    for (const assetId of card.assetIds) {
      if (!assetIds.has(assetId)) throw new Error(`Invalid legacy trip: Card ${card.id} references missing asset ${assetId}`);
    }
  }
  if (meta.magazine) {
    for (const assetId of meta.magazine.apparelAssetIds) {
      if (!assetIds.has(assetId)) throw new Error(`Invalid legacy trip: Magazine preference references missing asset ${assetId}`);
    }
  }
  for (const presentation of presentations) {
    if (presentation.boardId !== meta.boardId) throw new Error(`Invalid legacy trip: Presentation ${presentation.id} belongs to another board`);
    if (presentation.cardId && !cardIds.has(presentation.cardId)) throw new Error(`Invalid legacy trip: Presentation ${presentation.id} references missing card ${presentation.cardId}`);
    if (presentation.assetId && !assetIds.has(presentation.assetId)) throw new Error(`Invalid legacy trip: Presentation ${presentation.id} references missing asset ${presentation.assetId}`);
  }

  cards.sort((a, b) => a.id.localeCompare(b.id));
  assets.sort((a, b) => a.id.localeCompare(b.id));
  presentations.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const issues: LegacyCardGeometryIssue[] = [];
  for (const card of cards) {
    if (card.x < 0 || card.y < 0 || card.x + DEFAULT_WIDTH > BOARD_EXTENT || card.y + DEFAULT_HEIGHT > BOARD_EXTENT) {
      issues.push({ id: card.id, x: card.x, y: card.y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, reason: 'Card geometry is outside the 10000 board bounds using the default 1200x900 footprint' });
    }
  }
  return { version, meta, cards, assets, presentations, issues };
}

/** Strictly inspect a version 1 or 2 trip document. Returns detached plain data and does not modify the input bytes. Only cards outside the board with the legacy default footprint are reported as geometry issues. */
export function inspectLegacyTrip(bytes: Uint8Array): LegacyTripInspection {
  const doc = new Y.Doc();
  try {
    try { Y.applyUpdate(doc, bytes); } catch { throw new Error('Invalid legacy trip: document bytes are damaged'); }
    return inspectionFromDoc(doc);
  } finally { doc.destroy(); }
}

function validateRepairs(input: unknown): LegacyCardRepair[] {
  if (!Array.isArray(input)) throw new Error('Legacy repair requires an array of repairs for exactly the offending cards');
  const repairs: LegacyCardRepair[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Legacy repair entries must contain only id, x and y');
    const keys = Object.keys(item).sort();
    if (keys.length !== 3 || keys[0] !== 'id' || keys[1] !== 'x' || keys[2] !== 'y') throw new Error('Legacy repair entries must contain only id, x and y');
    const repair = item as Record<string, unknown>;
    if (typeof repair.id !== 'string' || !repair.id) throw new Error('Legacy repair id must be a nonempty string');
    if (typeof repair.x !== 'number' || !Number.isFinite(repair.x) || typeof repair.y !== 'number' || !Number.isFinite(repair.y)) throw new Error(`Legacy repair for ${repair.id} must use finite x and y coordinates`);
    repairs.push({ id: repair.id, x: repair.x, y: repair.y });
  }
  return repairs;
}

/** Explicitly repair only the offending legacy cards. The repair set must name every offending card exactly once and no other card, and each replacement must fit the board with the default footprint. All validation happens before any write; the returned document is a separate clone whose only changes are the approved x/y values and the schema version. */
export function repairLegacyTrip(bytes: Uint8Array, repairsInput: readonly LegacyCardRepair[]): Y.Doc {
  const repairs = validateRepairs(repairsInput);
  const inspection = inspectLegacyTrip(bytes);
  const offending = new Set(inspection.issues.map(issue => issue.id));
  const seen = new Set<string>();
  for (const repair of repairs) {
    if (seen.has(repair.id)) throw new Error(`Legacy repair has duplicate card ${repair.id}; repairs must cover only the offending cards exactly once`);
    seen.add(repair.id);
    if (!offending.has(repair.id)) throw new Error(`Legacy repair for ${repair.id} is not an offending card; repairs must cover only the offending cards exactly once`);
    if (repair.x < 0 || repair.y < 0 || repair.x + DEFAULT_WIDTH > BOARD_EXTENT || repair.y + DEFAULT_HEIGHT > BOARD_EXTENT) {
      throw new Error(`Legacy repair for ${repair.id} has geometry outside the board bounds`);
    }
  }
  for (const id of offending) if (!seen.has(id)) throw new Error(`Legacy repair is missing offending card ${id}`);

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, bytes);
    const parts = tripParts(doc);
    const byId = new Map(repairs.map(repair => [repair.id, repair]));
    doc.transact(() => {
      for (const repair of repairs) {
        const stored = parts.cards.get(repair.id);
        if (!stored) throw new Error(`Legacy repair is missing offending card ${repair.id}`);
        stored.set('x', byId.get(repair.id)!.x);
        stored.set('y', byId.get(repair.id)!.y);
      }
      parts.meta.set('schemaVersion', 3);
    });
    readTripMeta(doc);
    readAllCards(parts);
    readPresentations(parts);
    for (const id of parts.assets.keys()) readAsset(parts, id);
    return doc;
  } catch (error) { doc.destroy(); throw error; }
}
