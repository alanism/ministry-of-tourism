// Trip document (MOT-10): its own Yjs doc, so Writer's Board boards stay untouched.
import * as Y from 'yjs';
import { SYSTEM_ORIGIN, type AgentMode } from '../doc/model.ts';
import { assetSchema, presentationSchema, TRIP_SCHEMA_VERSION, tripCardSchema, tripMetaSchema, type Asset, type BoardKind, type Presentation, type TripCard, type TripMeta } from './schema.ts';

export interface TripParts {
  meta: Y.Map<unknown>;
  cards: Y.Map<Y.Map<unknown>>;
  assets: Y.Map<Y.Map<unknown>>;
  presentations: Y.Map<Presentation>;
  /** Monotonic board revision. Never in any undo scope (MOT-11). */
  clock: Y.Map<unknown>;
  /** Per-card revision stamps. Never in any undo scope. */
  revs: Y.Map<unknown>;
  /** Applied proposal ids (idempotency). Never in any undo scope. */
  applied: Y.Map<unknown>;
}

export function tripParts(doc: Y.Doc): TripParts {
  return {
    meta: doc.getMap('tripMeta'),
    cards: doc.getMap('tripCards'),
    assets: doc.getMap('tripAssets'),
    presentations: doc.getMap('tripPresentations'),
    clock: doc.getMap('tripClock'),
    revs: doc.getMap('tripRevs'),
    applied: doc.getMap('tripApplied'),
  };
}

/** Only these are undoable. clock/revs/applied are deliberately excluded. */
export function tripUndoScopes(parts: TripParts): Y.AbstractType<unknown>[] {
  return [parts.meta, parts.cards, parts.assets, parts.presentations] as unknown as Y.AbstractType<unknown>[];
}

export interface CreateTripOptions {
  title: string;
  city: string;
  timeZone: string | null;
  cityId?: string;
  countryCode?: string;
  kind?: BoardKind;
  boardId?: string;
  dates?: { start: string; end: string };
  party?: TripMeta['party'];
  agentMode?: AgentMode;
  lineage?: TripMeta['lineage'];
  magazine?: TripMeta['magazine'];
  groupPreferences?: TripMeta['groupPreferences'];
  newId?: () => string;
}

export function isTripInitialized(doc: Y.Doc): boolean {
  return tripParts(doc).meta.has('schemaVersion');
}

export function createTrip(options: CreateTripOptions): Y.Doc {
  const doc = new Y.Doc();
  initializeTrip(doc, options);
  return doc;
}

export function initializeTrip(doc: Y.Doc, options: CreateTripOptions): void {
  if (isTripInitialized(doc)) return;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const meta: TripMeta = tripMetaSchema.parse({
    schemaVersion: TRIP_SCHEMA_VERSION,
    boardId: options.boardId ?? newId(),
    kind: options.kind ?? 'traveler',
    title: options.title, city: options.city, timeZone: options.timeZone, cityId: options.cityId, countryCode: options.countryCode,
    dates: options.dates, party: options.party,
    agentMode: options.agentMode ?? 'together',
    lineage: options.lineage,
    magazine: options.magazine,
    groupPreferences: options.groupPreferences,
  });
  const parts = tripParts(doc);
  doc.transact(() => {
    for (const [k, v] of Object.entries(meta)) if (v !== undefined) parts.meta.set(k, v);
    parts.clock.set('boardRev', 0);
  }, SYSTEM_ORIGIN);
}

export function readTripMeta(doc: Y.Doc): TripMeta {
  const parts = tripParts(doc);
  const raw: Record<string, unknown> = Object.fromEntries(parts.meta.entries());
  return tripMetaSchema.parse(raw);
}

export function cardToPlain(card: Y.Map<unknown>): TripCard {
  const body = card.get('body');
  const raw: Record<string, unknown> = Object.fromEntries(card.entries());
  raw.body = body instanceof Y.Text ? body.toString() : '';
  return tripCardSchema.parse(raw);
}

export function writeCard(parts: TripParts, card: TripCard): void {
  const valid = tripCardSchema.parse(card);
  let map = parts.cards.get(valid.id);
  if (!map) { map = new Y.Map<unknown>(); parts.cards.set(valid.id, map); }
  map.set('id', valid.id); map.set('kind', valid.kind); map.set('title', valid.title);
  const existing = map.get('body');
  if (existing instanceof Y.Text) {
    const cur = existing.toString();
    if (cur !== valid.body) { existing.delete(0, cur.length); if (valid.body) existing.insert(0, valid.body); }
  } else map.set('body', new Y.Text(valid.body));
  map.set('stage', valid.stage); map.set('scope', valid.scope); map.set('provenance', valid.provenance);
  map.set('assetIds', [...valid.assetIds]); map.set('x', valid.x); map.set('y', valid.y);
  map.set('createdBy', valid.createdBy); map.set('updatedAt', valid.updatedAt);
  const setOrDel = (k: string, v: unknown) => { if (v === undefined) map!.delete(k); else map!.set(k, v); };
  setOrDel('status', valid.status); setOrDel('day', valid.day); setOrDel('time', valid.time);
  setOrDel('placeId', valid.placeId); setOrDel('location', valid.location);
  setOrDel('source', valid.source); setOrDel('lineage', valid.lineage);
  setOrDel('sourceText', valid.sourceText); setOrDel('travelerNote', valid.travelerNote); setOrDel('currentFacts', valid.currentFacts);
}

export function readCard(parts: TripParts, id: string): TripCard | undefined {
  const card = parts.cards.get(id);
  return card ? cardToPlain(card) : undefined;
}

export function readAllCards(parts: TripParts): TripCard[] {
  return [...parts.cards.values()].map(cardToPlain).sort((a, b) => a.id.localeCompare(b.id));
}

/** Asset metadata only. The bytes live outside the doc, keyed by asset id. */
export function writeAsset(parts: TripParts, asset: Asset): void {
  const valid = assetSchema.parse(asset);
  const existing=readAsset(parts,valid.id);
  if(existing){
    if(JSON.stringify(existing)!==JSON.stringify(valid))throw new Error(`Asset ${valid.id} is immutable; register changed media with a new ID`);
    return;
  }
  const map = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(valid)) if (v !== undefined) map.set(k, v);
  parts.assets.set(valid.id, map);
}

export function readAsset(parts: TripParts, id: string): Asset | undefined {
  const map = parts.assets.get(id);
  return map ? assetSchema.parse(Object.fromEntries(map.entries())) : undefined;
}

export function readPresentation(parts: TripParts, id: string): Presentation | undefined {
  const raw = parts.presentations.get(id);
  return raw ? presentationSchema.parse(raw) : undefined;
}

export function readPresentations(parts: TripParts): Presentation[] {
  return [...parts.presentations.values()].map(value => presentationSchema.parse(value)).sort((a,b) => a.zIndex-b.zIndex || a.id.localeCompare(b.id));
}

export function writePresentation(parts: TripParts, presentation: Presentation): void {
  const valid = presentationSchema.parse(presentation);
  if (valid.boardId !== parts.meta.get('boardId')) throw new Error('Presentation belongs to another board');
  if (valid.assetId && !readAsset(parts, valid.assetId)) throw new Error(`Missing asset ${valid.assetId}`);
  if (valid.cardId && !parts.cards.has(valid.cardId)) throw new Error(`Missing card ${valid.cardId}`);
  parts.presentations.set(valid.id, valid);
}

/** The card's privacy can only narrow the visibility of a linked placement. */
export function presentationScope(parts: TripParts, presentation: Presentation): Presentation['scope'] {
  const card = presentation.cardId ? readCard(parts, presentation.cardId) : undefined;
  const rank = {guide:0,stay:1,private:2};
  return card && rank[card.scope] > rank[presentation.scope] ? card.scope : presentation.scope;
}

/** Owner policy: unknown/restricted artwork may be shared with its real credit. */
export function assertShareableAsset(asset: Asset): void {
  if ((asset.rightsStatus === 'unknown' || asset.rightsStatus === 'restricted') && !asset.credit?.trim()) throw new Error(`Artwork ${asset.id} needs its credit before sharing`);
}

/** Explicit issue apparel is public catalog media; a private owner still narrows its visibility. */
export function readMagazineApparel(parts:TripParts,includePrivate=false):Asset[]{
  const meta=tripMetaSchema.parse(Object.fromEntries(parts.meta.entries()));
  const hidden=new Set([...readAllCards(parts).filter(c=>c.scope==='private').flatMap(c=>c.assetIds),...readPresentations(parts).filter(p=>presentationScope(parts,p)==='private').flatMap(p=>p.assetId?[p.assetId]:[])]);
  if(!includePrivate&&meta.magazine&&hidden.has(meta.magazine.wornTeeAssetId))return[];
  return (meta.magazine?.apparelAssetIds??[]).flatMap(id=>{
    const asset=readAsset(parts,id);
    return asset?.apparel&&asset.apparel.originCityId===meta.cityId&&(includePrivate||!hidden.has(id))?[asset]:[];
  });
}
