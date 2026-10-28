// Projections (MOT-13): pure functions of the trip doc. None mutates it.
import type * as Y from 'yjs';
import { readAllCards, readTripMeta, tripParts } from './model.ts';
import { cardRev } from './revisions.ts';
import { localDateFor, STAGES, type Stage, type TripCard } from './schema.ts';

export interface RevCard extends TripCard { rev: number; }

function withRev(doc: Y.Doc, cards: TripCard[]): RevCard[] {
  const parts = tripParts(doc);
  return cards.map((c) => ({ ...c, rev: cardRev(parts, c.id) }));
}

export function boardProjection(doc: Y.Doc): Record<Stage, RevCard[]> {
  const out = {} as Record<Stage, RevCard[]>;
  for (const s of STAGES) out[s] = [];
  for (const c of withRev(doc, readAllCards(tripParts(doc)))) out[c.stage].push(c);
  for (const s of STAGES) out[s].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  return out;
}

export function todayProjection(doc: Y.Doc, instant: Date = new Date()): RevCard[] {
  const meta = readTripMeta(doc);
  if (meta.timeZone === null) return [];
  const day = localDateFor(instant, meta.timeZone);
  return withRev(doc, readAllCards(tripParts(doc)).filter((c) => c.day === day))
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id.localeCompare(b.id));
}

export function mapProjection(doc: Y.Doc): RevCard[] {
  return withRev(doc, readAllCards(tripParts(doc)).filter((c) => c.location !== undefined));
}

/** Compact agent view: Trip brief first, then open tasks, then cards by stage. Private cards are never included. */
export function agentView(doc: Y.Doc): { boardId: string; boardRev: number; brief: RevCard[]; openTasks: RevCard[]; byStage: Record<Stage, RevCard[]> } {
  const parts = tripParts(doc);
  const all = withRev(doc, readAllCards(parts)).filter((c) => c.scope !== 'private');
  const byStage = boardProjection(doc);
  for (const s of STAGES) byStage[s] = byStage[s].filter((c) => c.scope !== 'private');
  return {
    boardId: readTripMeta(doc).boardId,
    boardRev: (parts.clock.get('boardRev') as number | undefined) ?? 0,
    brief: all.filter((c) => c.kind === 'brief'),
    openTasks: all.filter((c) => c.kind === 'task' && c.status !== 'done'),
    byStage,
  };
}
