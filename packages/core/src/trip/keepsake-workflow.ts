// Post-trip memory selection (MOT-115): orchestration over existing keepsakes, composition and the
// native JSON/ZIP package. No renderer, editor, PDF or print proof is added here.
import { readAllCards, readAsset, readPresentations, readTripMeta, presentationScope } from './model.ts';
import type { Asset, TripCard } from './schema.ts';
import type { TripSession } from './session.ts';

export type Reaction = 'keep' | 'maybe' | 'skip';
export interface MemoryItem { cardId: string; title: string; kind: TripCard['kind']; assetId?: string; note: string; day?: string; reaction?: Reaction; why: string; }
export interface MemoryShortlist { items: MemoryItem[]; skipped: string[]; more: number; }

const MEMORY_KINDS = new Set<TripCard['kind']>(['photo', 'note', 'place']);
const rank = (item: MemoryItem) => (item.reaction === 'keep' ? 0 : item.reaction === 'maybe' ? 1 : 2) * 10 + (item.assetId ? 0 : 1);

/** A first shortlist from permitted photos and notes. Every photo is welcome; nothing is judged by quality. */
export function memoryShortlist(session: TripSession, options: { reactions?: Readonly<Record<string, Reaction>>; includePrivate?: boolean; limit?: number } = {}): MemoryShortlist {
  const reactions = options.reactions ?? {};
  const candidates = readAllCards(session.parts).filter(card => (options.includePrivate || card.scope !== 'private') && MEMORY_KINDS.has(card.kind) && (card.assetIds.length > 0 || card.kind === 'note' && card.body.trim().length > 0));
  const skipped = candidates.filter(card => reactions[card.id] === 'skip').map(card => card.id).sort();
  const items = candidates.filter(card => reactions[card.id] !== 'skip').map((card): MemoryItem => ({
    cardId: card.id, title: card.title, kind: card.kind, ...(card.assetIds.length ? { assetId: card.assetIds[card.assetIds.length - 1] } : {}),
    note: (card.travelerNote ?? card.body).trim().slice(0, 400), ...(card.day ? { day: card.day } : {}), ...(reactions[card.id] ? { reaction: reactions[card.id] } : {}),
    why: card.assetIds.length ? (card.stage === 'remember' ? 'A photo you filed under Remember.' : 'A photo from your trip.') : 'A note in your own words.',
  })).sort((a, b) => rank(a) - rank(b) || (a.day ?? '9999').localeCompare(b.day ?? '9999') || a.title.localeCompare(b.title) || a.cardId.localeCompare(b.cardId));
  const limit = Math.max(1, Math.min(500, options.limit ?? 12));
  return { items: items.slice(0, limit), skipped, more: Math.max(0, items.length - limit) };
}

export interface ReusableArt { assetId: string; credit?: string; rightsStatus?: Asset['rightsStatus']; origin: string; scope: 'guide' | 'stay' | 'private'; kind: 'fcc-artwork' | 'apparel' | 'map' | 'decoration'; }
/** Art the trip already holds, with its credit and origin, offered before anything new is generated. */
export function reusableArt(session: TripSession, options: { includePrivate?: boolean } = {}): ReusableArt[] {
  const seen = new Map<string, ReusableArt>();
  const order = { guide: 0, stay: 1, private: 2 } as const;
  for (const p of readPresentations(session.parts)) {
    if (!p.assetId) continue;
    const scope = presentationScope(session.parts, p);
    if (scope === 'private' && !options.includePrivate) continue;
    const asset = readAsset(session.parts, p.assetId);
    if (!asset) continue;
    const kind: ReusableArt['kind'] = asset.apparel ? 'apparel' : p.magazineRole === 'map' ? 'map' : asset.source?.provider === 'fcc' ? 'fcc-artwork' : 'decoration';
    if (kind === 'decoration' && !asset.credit) continue;
    const previous = seen.get(asset.id);
    // The same art placed twice reports its narrowest audience.
    if (previous) { if (order[scope] > order[previous.scope]) previous.scope = scope; continue; }
    seen.set(asset.id, { assetId: asset.id, ...(asset.credit ? { credit: asset.credit } : {}), ...(asset.rightsStatus ? { rightsStatus: asset.rightsStatus } : {}), origin: asset.source?.cityId ? `FCC · ${asset.source.cityId}` : asset.source?.provider === 'fcc' ? 'FCC' : 'Your upload', scope, kind });
  }
  return [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.assetId.localeCompare(b.assetId));
}

export type PageProblemKind = 'missing_image' | 'clipped_text' | 'wrong_detail' | 'collision' | 'needs_credit';
export interface PageProblem { kind: PageProblemKind; ids: string[]; detail: string; }
/** Heuristic text limits for one memory page; the real renderer still decides the final fit. */
export const MEMORY_TEXT_LIMITS = Object.freeze({ title: 120, note: 900 });

/**
 * Check the pages a keepsake would use before it is kept: missing image bytes, text likely to clip,
 * details outside the trip, overlapping art and credits a share would need.
 */
export function reviewKeepsakePages(session: TripSession, input: { cardIds: readonly string[]; hasBytes: (assetId: string) => boolean; includePrivate?: boolean }): { ok: boolean; problems: PageProblem[] } {
  const meta = readTripMeta(session.doc);
  const wanted = new Set(input.cardIds);
  const cards = readAllCards(session.parts).filter(card => wanted.has(card.id) && (input.includePrivate || card.scope !== 'private'));
  const problems: PageProblem[] = [];
  for (const card of cards) {
    const missing = card.assetIds.filter(id => !input.hasBytes(id));
    if (missing.length) problems.push({ kind: 'missing_image', ids: [card.id, ...missing], detail: `${card.title || 'A memory'} is missing ${missing.length === 1 ? 'its photo' : `${missing.length} photos`} in this browser. Restore the original or leave it out.` });
    if (card.title.length > MEMORY_TEXT_LIMITS.title) problems.push({ kind: 'clipped_text', ids: [card.id], detail: `The title of ${card.title.slice(0, 40)}… is long and may be cut off.` });
    if ((card.travelerNote ?? card.body).length > MEMORY_TEXT_LIMITS.note) problems.push({ kind: 'clipped_text', ids: [card.id], detail: `The note on ${card.title || 'a memory'} is long and may be cut off. Shorten it or use a memory page.` });
    if (card.day && meta.dates && (card.day < meta.dates.start || card.day > meta.dates.end)) problems.push({ kind: 'wrong_detail', ids: [card.id], detail: `${card.title || 'A memory'} is dated ${card.day}, outside the trip (${meta.dates.start} to ${meta.dates.end}).` });
    for (const id of card.assetIds) { const asset = readAsset(session.parts, id); if (asset && (asset.rightsStatus === 'unknown' || asset.rightsStatus === 'restricted') && !asset.credit?.trim()) problems.push({ kind: 'needs_credit', ids: [card.id, id], detail: `${card.title || 'A memory'} uses art without its credit; add it before sharing.` }); }
  }
  const art = readPresentations(session.parts).filter(p => (!p.cardId || wanted.has(p.cardId)) && (input.includePrivate || presentationScope(session.parts, p) !== 'private'));
  for (const p of art) if (p.assetId && !input.hasBytes(p.assetId)) problems.push({ kind: 'missing_image', ids: [p.id, p.assetId], detail: 'A placed artwork is missing its image in this browser.' });
  const front = art.filter(p => p.magazineRole !== 'backdrop' && !p.locked);
  for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
    const a = front[i]!, b = front[j]!;
    if ((a.magazineLayout?.pageId ?? '') !== (b.magazineLayout?.pageId ?? '')) continue;
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (w > .02 && h > .02) problems.push({ kind: 'collision', ids: [a.id, b.id], detail: 'Two pieces of art overlap. Move one in Composition, or lock it if the overlap is intended.' });
  }
  return { ok: problems.length === 0, problems };
}
