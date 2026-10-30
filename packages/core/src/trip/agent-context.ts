// Agent context (MOT-109): what an agent may know about the open trip before choosing a workflow.
// Only non-private cards count; private cards and their facts never reach an agent.
import { readAllCards, readTripMeta } from './model.ts';
import type { TripSession } from './session.ts';
import { guideMetadata, type GuideMetadata } from './guidance.ts';
import { routeWorkflow, tripPhase, type Fact, type GroupSummary, type PreferenceAnswer, type RouteContext, type RouteRequest, type RouteResult, type TripPhase, type UnknownFact } from './workflow-routing.ts';
import type { GroupPreferences, GroupResponse } from './group-preferences.ts';

export interface AgentTripContext {
  boardId: string;
  revision: number;
  current_phase: TripPhase;
  meta: { title: string; city: string; cityId?: string; dates?: { start: string; end: string }; timeZone: string | null; party?: string; agentMode: string };
  counts: { cards: number; photos: number; dated: number; open_tasks: number };
  fixed_bookings: { id: string; title: string; day?: string; time?: string }[];
  facts: Fact[];
  guide: GuideMetadata;
}

/** Evidence a person attached to a card (current facts) and person-set booking status, as dated facts. */
function boardFacts(session: TripSession, includePrivate: boolean): Fact[] {
  return readAllCards(session.parts).filter(card => includePrivate || card.scope !== 'private').flatMap(card => [
    ...(card.currentFacts ?? []).map(fact => ({ field: `${card.title || card.id}: ${fact.field}`, value: fact.value, status: 'confirmed' as const, source: fact.evidenceUrl, observedAt: fact.observedAt, ...(fact.validUntil ? { validUntil: fact.validUntil } : {}) })),
    ...(card.booking ? [{ field: `${card.title || card.id}: booking`, value: card.booking.status, status: 'confirmed' as const, source: 'set by a person on the board' }] : []),
  ]);
}

export function agentContext(session: TripSession, options: { now?: Date; includePrivate?: boolean } = {}): AgentTripContext {
  const meta = readTripMeta(session.doc);
  const cards = readAllCards(session.parts).filter(card => options.includePrivate || card.scope !== 'private');
  return {
    boardId: meta.boardId, revision: session.boardRev, current_phase: tripPhase(meta, options.now),
    meta: { title: meta.title, city: meta.city, ...(meta.cityId ? { cityId: meta.cityId } : {}), ...(meta.dates ? { dates: meta.dates } : {}), timeZone: meta.timeZone, ...(meta.party ? { party: meta.party } : {}), agentMode: meta.agentMode },
    counts: { cards: cards.filter(card => card.kind !== 'brief').length, photos: new Set(cards.flatMap(card => card.assetIds)).size, dated: cards.filter(card => card.day).length, open_tasks: cards.filter(card => card.kind === 'task' && card.status !== 'done').length },
    fixed_bookings: cards.filter(card => card.booking?.status === 'confirmed').map(card => ({ id: card.id, title: card.title, ...(card.day ? { day: card.day } : {}), ...(card.time ? { time: card.time } : {}) })),
    facts: boardFacts(session, !!options.includePrivate),
    guide: guideMetadata(),
  };
}

const roundKey = (r: { proposal_version: number; round_id: string }) => `${r.proposal_version}:${r.round_id}`;

/** MOT-105 rounds reduced to what routing needs: kind and rank limit per round, no household names, IDs or option IDs. */
export function groupSummary(group: GroupPreferences | undefined, responses: readonly GroupResponse[] = []): GroupSummary | undefined {
  if (!group) return undefined;
  const replied = new Set(currentReplies(group, responses).map(roundKey));
  const proposal = Math.max(...group.rounds.map(round => round.proposal_version));
  const rounds = group.rounds.filter(round => round.proposal_version === proposal).sort((a, b) => a.round_id.localeCompare(b.round_id));
  return { rounds: rounds.map(r => ({ kind: r.kind, rank_limit: r.rank_limit })), rounds_with_replies: rounds.filter(r => replied.has(roundKey(r))).length };
}

/** Replies that belong to this trip's declared rounds and roster, keeping only each household's latest revision per round. */
export function currentReplies(group: GroupPreferences | undefined, responses: readonly GroupResponse[]): GroupResponse[] {
  if (!group) return [];
  const rounds = new Set(group.rounds.map(roundKey)), roster = new Set(group.households.map(h => h.household_id));
  const latest = new Map<string, GroupResponse>();
  for (const r of responses) {
    if (r.trip_id !== group.trip_id || !rounds.has(roundKey(r)) || !roster.has(r.household_id)) continue;
    const key = `${roundKey(r)}|${r.household_id}`, held = latest.get(key);
    if (!held || r.response_revision > held.response_revision) latest.set(key, r);
  }
  return [...latest.values()].sort((a, b) => a.response_id.localeCompare(b.response_id));
}

/**
 * Shared constraints from current MOT-105 replies as routing facts. Confirmed and inferred stay apart;
 * unknown stays unknown. Each reply is a numbered, anonymous source, so two households' "pace" never
 * collide, and the household's own free-text source (which may name them) is not passed on.
 */
export function responseConstraintFacts(group: GroupPreferences | undefined, responses: readonly GroupResponse[]): { facts: Fact[]; unknown: UnknownFact[] } {
  const facts: Fact[] = [], unknown: UnknownFact[] = [];
  currentReplies(group, responses).forEach((response, index) => {
    const reply = `reply ${index + 1}`;
    for (const c of response.constraints) {
      const field = `${c.id} (${reply})`;
      if (c.status === 'unknown') unknown.push({ field, reason: 'missing', detail: c.text });
      else facts.push({ field, value: c.text, status: c.status, source: `household ${reply} · round ${response.round_id}`, ...(c.source_date ? { observedAt: c.source_date } : {}) });
    }
  });
  return { facts, unknown };
}

/** Route a request against the open trip. Answers, inferences and replies come from the caller; nothing is stored. */
export function routeTripRequest(session: TripSession, request: RouteRequest, extra: { answers?: Record<string, PreferenceAnswer>; inferred?: Fact[]; responses?: readonly GroupResponse[]; tools?: RouteContext['tools']; now?: Date; includePrivate?: boolean } = {}): RouteResult {
  const meta = readTripMeta(session.doc);
  const inferred = (extra.inferred ?? []).map(fact => ({ ...fact, status: 'inferred' as const }));
  const replies = responseConstraintFacts(meta.groupPreferences, extra.responses ?? []);
  return routeWorkflow(request, { meta, now: extra.now, answers: extra.answers, tools: extra.tools, group: groupSummary(meta.groupPreferences, extra.responses), unknown: replies.unknown, facts: [...boardFacts(session, !!extra.includePrivate), ...replies.facts, ...inferred] });
}
