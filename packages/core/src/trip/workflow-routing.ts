// Smallest-workflow routing and optional preference discovery (MOT-109). Pure and deterministic:
// the same request and context always route the same way. Nothing here writes to a board.
import type { TripMeta } from './schema.ts';
import { WORKFLOW_SUMMARY } from './guidance.ts';

export const WORKFLOWS = ['small_edit', 'preferences', 'plan', 'trip_change', 'keepsake'] as const;
export type Workflow = (typeof WORKFLOWS)[number];
export type TripPhase = 'planning' | 'during' | 'post' | 'unknown';

/** Narrow board edits. Running them never asks questions, tallies votes or recomputes an itinerary. */
export const SMALL_EDIT_COMMANDS: ReadonlySet<string> = new Set(['trip_card_create', 'trip_card_update', 'trip_card_move', 'trip_task_set_status', 'trip_asset_attach', 'trip_asset_register', 'trip_presentation_create', 'trip_presentation_update', 'trip_presentation_delete', 'trip_read']);

export type AnswerStatus = 'answered' | 'partial' | 'not_sure' | 'skipped';
export interface PreferenceAnswer { status: AnswerStatus; value?: string; }
export interface PreferenceQuestion { id: string; text: string; options?: string[]; optional: true; }
export interface Fact { field: string; value: string; status: 'confirmed' | 'inferred'; source: string; observedAt?: string; validUntil?: string; }
export interface UnknownFact { field: string; reason: 'missing' | 'stale' | 'conflicting' | 'not_sure'; detail?: string; }

export interface RouteRequest { text?: string; ops?: readonly { command: string; input?: Record<string, unknown> }[]; workflow?: Workflow; }
export interface RouteContext {
  meta: Pick<TripMeta, 'city' | 'cityId' | 'dates' | 'timeZone' | 'party' | 'agentMode'>;
  now?: Date;
  facts?: readonly Fact[];
  answers?: Readonly<Record<string, PreferenceAnswer>>;
  /** Which supporting tools are actually available. A missing tool turns a result into a proposal. */
  tools?: Readonly<Partial<Record<'muse' | 'planner' | 'persistence', boolean>>>;
  /** Declared MOT-105 rounds, without the household roster or option IDs. */
  group?: GroupSummary;
  /** Facts the caller already knows are unknown, such as a household reply that says so. */
  unknown?: readonly UnknownFact[];
}
export interface GroupSummary { rounds: { kind: 'destination' | 'city_venue'; rank_limit: 3 | 5 }[]; rounds_with_replies: number; rounds_complete?:number; pending_responses?:number; partial_responses?:number; conflicting_responses?:number; }
export interface RouteResult {
  workflow: Workflow;
  reason: string;
  summary: string;
  phase_hint: TripPhase;
  mode: 'apply' | 'ask' | 'propose' | 'read_only';
  questions: PreferenceQuestion[];
  facts: { confirmed: Fact[]; inferred: Fact[]; unknown: UnknownFact[] };
  tentative: boolean;
  invalidates: MaterialChange[];
  skips: string[];
  /** Present when the organizer declared group rounds: households rank by ballot, so fewer questions are needed. */
  group?: GroupSummary & { note: string };
}

export const PREFERENCE_QUESTIONS: readonly PreferenceQuestion[] = [
  { id: 'must_do', text: 'Is there one thing someone would be sad to miss?', optional: true },
  { id: 'pace', text: 'How full should a day feel?', options: ['slow', 'balanced', 'packed'], optional: true },
  { id: 'avoid', text: 'Anything to avoid?', optional: true },
  { id: 'budget', text: 'Is there a spending ceiling for activities?', optional: true },
  { id: 'access', text: 'Does anyone need step-free access, rest breaks or shorter walks?', optional: true },
  { id: 'meals', text: 'Any meal times or food needs to plan around?', optional: true },
];
const ESSENTIAL_QUESTIONS: Readonly<Record<string, PreferenceQuestion>> = {
  dates: { id: 'dates', text: 'Which dates is the trip?', optional: true },
  party: { id: 'party', text: 'Who is coming: solo, couple, family or a group?', options: ['solo', 'couple', 'family', 'business'], optional: true },
  timeZone: { id: 'timeZone', text: 'Which time zone are you in at the destination?', optional: true },
};
/** Facts a workflow needs before its output can be more than tentative. */
const ESSENTIAL: Readonly<Record<Workflow, readonly string[]>> = { small_edit: [], preferences: [], plan: ['dates', 'party'], trip_change: ['dates', 'timeZone'], keepsake: [] };

/** The phase is a hint for wording and defaults, never a gate. */
export function tripPhase(meta: Pick<TripMeta, 'dates' | 'timeZone'>, now: Date = new Date()): TripPhase {
  if (!meta.dates || !meta.timeZone) return 'unknown';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: meta.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return today < meta.dates.start ? 'planning' : today > meta.dates.end ? 'post' : 'during';
}

const TRIP_LEVEL = /\b(move|change|shift|push|postpone|extend|shorten|switch)\b[^.?!]*\b(trip|dates?|destination|budget|holiday|vacation|(access|accessibility|mobility) needs?)\b/i;
/** Material fields a text-only trip change names. Words only: no value is inferred from them. */
const MATERIAL_TEXT: readonly [MaterialChange['field'], RegExp][] = [['dates', /\bdates?\b/i], ['destination', /\b(destination|city)\b/i], ['budget', /\b(budget|spending (ceiling|limit))\b/i], ['access', /\b(access(ibility)?|step[- ]free|wheelchair|mobility)\b/i]];
const SMALL = /\b(rename|retitle|re-title|move|drag|caption|tag|mark (it |this )?(done|open)|tick off|add (a |this |my |one )?(photo|picture|pic|image|note)|attach)\b/i;
const KEEPSAKE = /\b(keepsakes?|memor(y|ies)|postcards?|magazine|album|scrapbook|photo ?book|souvenir|remember (the|our|this) trip)\b/i;
const CHANGE = /\b(delay(ed)?|late|running behind|missed|cancel(l)?ed|closed|rain(ing)?|weather|storm|tired|exhausted|energy|sick|what'?s next|next step|right now|today)\b/i;
const PREFS = /\b(prefer(ence)?s?|vote|voting|rank(ing)?|favou?rites?|what (do|does|would) (we|you|they|everyone) (like|want|enjoy)|ideas|options|interests?|wish ?list)\b/i;
const PLAN = /\b(plan|itinerary|schedule|day[- ]by[- ]day|fit (it|them|everything) in|propose (a|the) (day|days|plan))\b/i;

/** Fields whose change invalidates earlier approvals or feasibility checks. */
export interface MaterialChange { field: 'dates' | 'destination' | 'budget' | 'access'; invalidates: string[]; }
const MATERIAL_EFFECT: Readonly<Record<MaterialChange['field'], string[]>> = {
  dates: ['approvals of dated activities', 'feasibility of dated activities and bookings'],
  destination: ['all activity approvals', 'all feasibility checks', 'ballot options for the old destination'],
  budget: ['feasibility of priced activities'],
  access: ['feasibility of activities with access requirements', 'approvals that assumed the old access needs'],
};
export interface MaterialState { dates?: { start: string; end: string }; city?: string; cityId?: string; budget?: string; access?: string; }
export function materialChanges(before: MaterialState, after: MaterialState): MaterialChange[] {
  const changes: MaterialChange[] = [];
  const differ = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  if (differ(before.dates, after.dates)) changes.push({ field: 'dates', invalidates: MATERIAL_EFFECT.dates });
  if (differ(before.cityId ?? before.city, after.cityId ?? after.city)) changes.push({ field: 'destination', invalidates: MATERIAL_EFFECT.destination });
  if (differ(before.budget?.trim(), after.budget?.trim())) changes.push({ field: 'budget', invalidates: MATERIAL_EFFECT.budget });
  if (differ(before.access?.trim(), after.access?.trim())) changes.push({ field: 'access', invalidates: MATERIAL_EFFECT.access });
  return changes;
}

/** Known facts from the trip, split into confirmed, inferred and unknown. Silence is never consent. */
/** Expiry compared as instants, so offsets such as +03:00 are honoured. Unparseable dates never expire silently. */
export const isExpired = (validUntil: string | undefined, now: Date): boolean => !!validUntil && (Number.isNaN(Date.parse(validUntil)) ? false : Date.parse(validUntil) < now.getTime());

export function classifyFacts(context: RouteContext): RouteResult['facts'] {
  const now = context.now ?? new Date();
  const meta = context.meta;
  const confirmed: Fact[] = [{ field: 'destination', value: meta.city, status: 'confirmed', source: 'trip settings' }];
  if (meta.dates) confirmed.push({ field: 'dates', value: `${meta.dates.start} to ${meta.dates.end}`, status: 'confirmed', source: 'trip settings' });
  if (meta.timeZone) confirmed.push({ field: 'timeZone', value: meta.timeZone, status: 'confirmed', source: 'trip settings' });
  if (meta.party) confirmed.push({ field: 'party', value: meta.party, status: 'confirmed', source: 'trip settings' });
  const unknown: UnknownFact[] = [...(context.unknown ?? [])];
  for (const [id, answer] of Object.entries(context.answers ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if ((answer.status === 'answered' || answer.status === 'partial') && answer.value?.trim()) confirmed.push({ field: id, value: answer.value.trim(), status: 'confirmed', source: answer.status === 'partial' ? 'partial answer' : 'answer' });
    else if (answer.status === 'not_sure') unknown.push({ field: id, reason: 'not_sure' });
  }
  const inferred: Fact[] = [];
  const supplied = [...(context.facts ?? [])].sort((a, b) => a.field.localeCompare(b.field) || a.source.localeCompare(b.source) || a.value.localeCompare(b.value));
  for (const fact of supplied) {
    if (isExpired(fact.validUntil, now)) unknown.push({ field: fact.field, reason: 'stale', detail: `${fact.value} (${fact.source}) was valid until ${fact.validUntil}` });
    else (fact.status === 'confirmed' ? confirmed : inferred).push({ ...fact });
  }
  // Two current confirmed values for one field (trip settings, answers or evidence) make it unknown, not a silent winner.
  const conflicted = [...new Set(confirmed.map(f => f.field))].filter(field => new Set(confirmed.filter(f => f.field === field).map(f => f.value)).size > 1);
  for (const field of conflicted) unknown.push({ field, reason: 'conflicting', detail: confirmed.filter(f => f.field === field).map(f => `${f.value} (${f.source})`).join(' vs ') });
  return { confirmed: confirmed.filter(f => !conflicted.includes(f.field)), inferred, unknown };
}

function pick(request: RouteRequest, phase: TripPhase): { workflow: Workflow; reason: string } {
  if (request.workflow && (WORKFLOWS as readonly string[]).includes(request.workflow)) return { workflow: request.workflow, reason: 'Workflow chosen explicitly.' };
  const ops = request.ops ?? [];
  if (ops.some(op => op.command === 'trip_meta_update')) return { workflow: 'trip_change', reason: 'The request changes destination or dates.' };
  if (ops.length && ops.every(op => SMALL_EDIT_COMMANDS.has(op.command))) return { workflow: 'small_edit', reason: 'Every requested change is a narrow board edit.' };
  const text = request.text ?? '';
  if (TRIP_LEVEL.test(text)) return { workflow: 'trip_change', reason: 'The request changes the trip itself (dates, destination or budget).' };
  if (SMALL.test(text)) return { workflow: 'small_edit', reason: 'The request names a narrow edit.' };
  if (KEEPSAKE.test(text)) return { workflow: 'keepsake', reason: 'The request is about memories or keepsakes.' };
  if (CHANGE.test(text)) return { workflow: 'trip_change', reason: 'The request is about a change or the next step during the trip.' };
  if (PREFS.test(text)) return { workflow: 'preferences', reason: 'The request is about what people like.' };
  if (PLAN.test(text)) return { workflow: 'plan', reason: 'The request asks for a plan.' };
  const byPhase: Record<TripPhase, Workflow> = { planning: 'preferences', unknown: 'preferences', during: 'trip_change', post: 'keepsake' };
  return { workflow: byPhase[phase], reason: `No specific workflow named; using the ${phase} phase hint.` };
}

/** At most `limit` optional questions, never one that already has a current answer. */
export function preferenceQuestions(answers: Readonly<Record<string, PreferenceAnswer>> = {}, limit = 2, essentials: readonly string[] = []): PreferenceQuestion[] {
  const open = (q: PreferenceQuestion) => !answers[q.id];
  const first = essentials.flatMap(field => ESSENTIAL_QUESTIONS[field] ? [ESSENTIAL_QUESTIONS[field]] : []).filter(open);
  return [...first, ...PREFERENCE_QUESTIONS.filter(open)].slice(0, Math.max(0, Math.min(2, limit)));
}

const SKIPS: Readonly<Record<Workflow, string[]>> = {
  small_edit: ['preference questions', 'voting and tallies', 'itinerary recomputation'],
  preferences: ['itinerary recomputation', 'board changes without approval'],
  plan: ['bookings, payments and cancellations', 'applying changes without the organizer'],
  trip_change: ['moving confirmed bookings', 'preference questions', 'rebuilding unrelated days'],
  keepsake: ['destination voting', 'planning questions', 'itinerary recomputation', 'PDF or print proofs'],
};

export function routeWorkflow(request: RouteRequest, context: RouteContext): RouteResult {
  const phase = tripPhase(context.meta, context.now);
  const { workflow, reason } = pick(request, phase);
  const facts = classifyFacts(context);
  const known = new Set(facts.confirmed.map(f => f.field));
  const missing = ESSENTIAL[workflow].filter(field => !known.has(field));
  for (const field of missing) if (!facts.unknown.some(u => u.field === field)) facts.unknown.push({ field, reason: 'missing' });
  const blocking = new Set(ESSENTIAL[workflow]);
  const tentative = facts.unknown.some(u => blocking.has(u.field)) || (workflow === 'plan' && facts.unknown.length > 0);
  const questions = workflow === 'preferences' ? preferenceQuestions(context.answers, 2, missing) : workflow === 'plan' ? preferenceQuestions(context.answers, 2, missing).filter(q => missing.includes(q.id)) : [];
  const metaUpdate = request.ops?.find(op => op.command === 'trip_meta_update')?.input;
  const invalidates = metaUpdate ? materialChanges({ dates: context.meta.dates, city: context.meta.city, cityId: context.meta.cityId }, { dates: (metaUpdate.dates as MaterialState['dates']) ?? context.meta.dates, ...(metaUpdate.city === undefined ? { city: context.meta.city, cityId: context.meta.cityId } : { city: metaUpdate.city as string, cityId: metaUpdate.cityId as string | undefined }) })
    : workflow === 'trip_change' ? MATERIAL_TEXT.filter(([, word]) => word.test(request.text ?? '')).map(([field]) => ({ field, invalidates: MATERIAL_EFFECT[field] })) : [];
  const tools = context.tools ?? {};
  const mode: RouteResult['mode'] = context.meta.agentMode === 'solo' ? 'read_only'
    : workflow === 'small_edit' ? (tools.persistence === false ? 'propose' : 'apply')
    : workflow === 'preferences' ? 'ask' : 'propose';
  // Ballots answer which options people prefer, not access, budget or pace, so the optional questions stay.
  const label = { destination: 'destination', city_venue: 'city venues' } as const;
  const group = context.group && (workflow === 'preferences' || workflow === 'plan') ? { ...context.group, note: `Households rank options on ${context.group.rounds.length} declared ${context.group.rounds.length === 1 ? 'round' : 'rounds'} (${context.group.rounds.map(r => `${label[r.kind]}: top ${r.rank_limit}`).join('; ')}). Questions stay optional.` } : undefined;
  // A plan cannot be firm while a declared round has no replies yet.
  const awaiting = workflow === 'plan' && context.group && (context.group.rounds_complete??context.group.rounds_with_replies) < context.group.rounds.length;
  if (awaiting && !facts.unknown.some(u => u.field === 'household rankings')) facts.unknown.push({ field: 'household rankings', reason: 'missing', detail: `${context.group!.rounds.length - (context.group!.rounds_complete??context.group!.rounds_with_replies)} declared ${context.group!.rounds.length - (context.group!.rounds_complete??context.group!.rounds_with_replies) === 1 ? 'round has' : 'rounds have'} no replies yet.` });
  return { workflow, reason, summary: WORKFLOW_SUMMARY[workflow], phase_hint: phase, mode, questions, facts, tentative: tentative || !!awaiting, invalidates, skips: SKIPS[workflow], ...(group ? { group } : {}) };
}
