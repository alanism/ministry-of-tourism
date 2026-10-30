// Monotonic revisions outside undo (MOT-11). See docs/REVISIONS.md.
import * as Y from 'yjs';
import { readAllCards, readPresentations, tripParts, type TripParts } from './model.ts';
import { syncedSnapshot, type TripCard } from './schema.ts';

export const REVISION_ORIGIN = Object.freeze({ revision: true });

export interface ComparisonToken { boardId: string; cardRevs: Record<string, number>; }

export function boardRev(parts: TripParts): number {
  return (parts.clock.get('boardRev') as number | undefined) ?? 0;
}
export function cardRev(parts: TripParts, cardId: string): number {
  return (parts.revs.get(cardId) as number | undefined) ?? 0;
}
export function tokenFor(parts: TripParts, boardId: string, cardIds: string[]): ComparisonToken {
  const cardRevs: Record<string, number> = {};
  for (const id of cardIds) cardRevs[id] = cardRev(parts, id);
  return { boardId, cardRevs };
}
/** ownRevs: revisions this proposal's own applied ops left behind; those are not someone else's edit. */
export function tokenMatches(parts: TripParts, boardId: string, token: ComparisonToken, liveIds?: Set<string>, ownRevs: Record<string, number> = {}): boolean {
  if (token.boardId !== boardId) return false;
  for (const [id, rev] of Object.entries(token.cardRevs)) {
    if (liveIds && !liveIds.has(id)) return false;
    const now = cardRev(parts, id);
    if (now !== rev && now !== ownRevs[id]) return false;
  }
  return true;
}

function snapshot(parts: TripParts): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of readAllCards(parts)) m.set(c.id, syncedSnapshot(c as TripCard) + '|' + (c.travelerNote ?? '') + '|' + (c.status ?? '') + '|' + (c.day ?? '') + '|' + (c.time ?? '') + '|' + c.x + ',' + c.y + '|' + JSON.stringify(c.booking??null) + '|' + JSON.stringify(c.bookingAttention??null));
  m.set('@meta',JSON.stringify([...parts.meta.entries()].sort(([a],[b])=>a.localeCompare(b))));
  m.set('@assets',JSON.stringify([...parts.assets.entries()].map(([id,a])=>[id,a.toJSON()]).sort(([a],[b])=>String(a).localeCompare(String(b)))));
  for(const p of readPresentations(parts))m.set(`@presentation:${p.id}`,JSON.stringify(p));
  return m;
}

/** Diff card snapshots; bump board rev once and stamp changed cards. Returns new board rev. */
export function bumpChangedRevisions(doc: Y.Doc, before: Map<string, string>): number {
  const parts = tripParts(doc);
  const after = snapshot(parts);
  const changed: string[] = [];
  for (const [id, s] of after) if (before.get(id) !== s) changed.push(id);
  for (const id of before.keys()) if (!after.has(id)) changed.push(id);
  if (!changed.length) return boardRev(parts);
  const next = boardRev(parts) + 1;
  doc.transact(() => {
    parts.clock.set('boardRev', next);
    for (const id of changed) parts.revs.set(id, next);
  }, REVISION_ORIGIN);
  return next;
}
export function snapshotCards(doc: Y.Doc): Map<string, string> { return snapshot(tripParts(doc)); }

/** A partly approved proposal: which ops landed, and the card revisions they left. */
export interface AppliedPart { ops: number[]; revs: Record<string, number>; }

export function hasApplied(parts: TripParts, proposalId: string): boolean {
  return parts.applied.get(proposalId) === true;
}
export function appliedPart(parts: TripParts, proposalId: string): AppliedPart | undefined {
  const v = parts.applied.get(proposalId);
  return v && typeof v === 'object' ? (v as AppliedPart) : undefined;
}
/** Without `part`, the whole proposal is done. */
export function markApplied(doc: Y.Doc, proposalId: string, part?: AppliedPart): void {
  const parts = tripParts(doc);
  doc.transact(() => { parts.applied.set(proposalId, part ?? true); }, REVISION_ORIGIN);
}
