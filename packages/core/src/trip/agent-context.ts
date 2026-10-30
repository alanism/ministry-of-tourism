// Agent context (MOT-109): what an agent may know about the open trip before choosing a workflow.
// Only non-private cards count; private cards and their facts never reach an agent.
import {mergeResponseLedger} from './response-ledger.ts';
import {confirmedFact} from './planning-constraints.ts';
import {localDateFor} from './schema.ts';
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
    fixed_bookings: cards.filter(card => (card.booking?.status === 'confirmed'||card.booking?.status === 'held')).map(card => ({ id: card.id, title: card.title, ...(card.day ? { day: card.day } : {}), ...(card.time ? { time: card.time } : {}) })),
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

/** Native MOT-107 current projection. Narrow edits and memories do not inspect group planning. */
export async function routeTripRequestWithGroup(session:TripSession,request:RouteRequest,extra:Parameters<typeof routeTripRequest>[2]={}):Promise<RouteResult>{
 const base=routeTripRequest(session,request,extra);if(base.workflow==='small_edit'||base.workflow==='keepsake'||base.workflow==='trip_change')return base;
 const meta=readTripMeta(session.doc),group=meta.groupPreferences,workspace=meta.groupWorkspace,now=extra.now??new Date();
 if(!group)return base.workflow==='plan'?{...base,tentative:true,facts:{...base.facts,unknown:[...base.facts.unknown,{field:'planning facts',reason:'missing'}]}}:base;
 const merged=await mergeResponseLedger(group,workspace?.ledger,[]),version=Math.max(...group.rounds.map(r=>r.proposal_version)),rounds=group.rounds.filter(r=>r.proposal_version===version).sort((a,b)=>a.round_id.localeCompare(b.round_id));
 const perRound=rounds.map(r=>merged.current.filter(reply=>reply.proposal_version===version&&reply.round_id===r.round_id));
 const summary={rounds:rounds.map(r=>({kind:r.kind,rank_limit:r.rank_limit})),rounds_with_replies:perRound.filter(r=>r.length>0).length,rounds_complete:perRound.filter(r=>r.length===group.households.length).length,pending_responses:perRound.reduce((n,r)=>n+group.households.length-r.length,0),partial_responses:perRound.reduce((n,replies,i)=>n+replies.filter(r=>r.rankings.length<rounds[i]!.rank_limit).length,0),conflicting_responses:merged.conflicts.length};
 const unknown:RouteResult['facts']['unknown']=[];
 if(merged.conflicts.length)unknown.push({field:'household replies',reason:'conflicting',detail:'Conflicting current revisions remain unresolved.'});
 if(merged.current.some(r=>r.constraints.some(c=>c.status==='unknown')))unknown.push({field:'shared constraints',reason:'missing',detail:'A current shared constraint remains unknown; review it in the owner view.'});
 const p=workspace?.planning;
 if(base.workflow==='plan'){
  if(!p)unknown.push({field:'planning facts',reason:'missing'});
  else {
   const declared=group.rounds.find(r=>r.proposal_version===p.proposal_version&&r.round_id===p.round_id),outside=meta.dates&&p.slots.some(s=>{const d=localDateFor(new Date(s.start),meta.timeZone??'UTC');return d<meta.dates!.start||d>meta.dates!.end;});
   if(p.proposal_version!==version||declared?.kind==='city_venue'&&meta.cityId!==declared.city_id||outside)unknown.push({field:'planning context',reason:'stale',detail:'The declared planning context differs from the current trip; review the dated facts before proposing.'});
   const facts=[p.budget,p.travel_minutes,...p.households.flatMap(h=>[h.attendance,h.availability,h.rest_minutes]),...p.activities.flatMap(a=>[a.duration_minutes,a.cost,a.opening,a.reservation,...a.access.map(x=>x.allowed)])],end=Math.max(...p.slots.map(s=>Date.parse(s.end)));
   if(facts.some(f=>!confirmedFact<unknown>(f,now.toISOString())||!!f.valid_until&&Date.parse(f.valid_until)<end))unknown.push({field:'planning evidence',reason:'missing',detail:'Some planning facts are missing, inferred or expired for the proposed activities.'});
  }
 }
 const result=routeWorkflow(request,{meta,now,answers:extra.answers,tools:extra.tools,group:summary,unknown,facts:[...boardFacts(session,!!extra.includePrivate),...(extra.inferred??[]).map(f=>({...f,status:'inferred' as const}))]});
 if(base.workflow==='plan'&&unknown.length)return{...result,tentative:true};return result;
}
