// MOT-109: explicitly shared MOT-107 ledger -> smallest workflow. Never reads private ledger storage.
import { CommandError } from '../commands/define.ts';
import { routeTripRequest } from './agent-context.ts';
import { readTripMeta } from './model.ts';
import { mergeResponseLedger } from './response-ledger.ts';
import type { TripSession } from './session.ts';
import type { RouteRequest, RouteResult } from './workflow-routing.ts';

export type GroupRouteOptions = Omit<NonNullable<Parameters<typeof routeTripRequest>[2]>, 'responses' | 'includePrivate'> & { ledger?: unknown };
/** Counts are household/round pairs across the active proposal; unresolved may overlap responding. */
export interface GroupRouteCoverage { total: number; responding: number; pending: number; partial: number; conflicting: number; needs_resolution: number; }
export type GroupRouteResult = RouteResult & { boardId: string; revision: number; group_coverage?: GroupRouteCoverage };

export async function routeGroupRequest(session: TripSession, request: RouteRequest, extra: GroupRouteOptions = {}): Promise<GroupRouteResult> {
  const boardId = session.boardId, revision = session.boardRev;
  const initial = routeTripRequest(session, request, extra);
  // A rename, photo, trip change or keepsake never reads or hashes group replies.
  if (initial.workflow !== 'preferences' && initial.workflow !== 'plan') return { ...initial, boardId, revision };
  const group = readTripMeta(session.doc).groupPreferences;
  if (!group) throw new CommandError('unavailable', 'Declare the households and rounds before routing group preferences.');
  const snapshot = structuredClone({ request, answers: extra.answers, inferred: extra.inferred, tools: extra.tools, now: extra.now });
  let merged: Awaited<ReturnType<typeof mergeResponseLedger>>;
  try { merged = await mergeResponseLedger(group, extra.ledger, []); }
  catch { throw new CommandError('invalid_input', 'Invalid group ledger. Nothing changed.'); }
  if (session.boardId !== boardId || session.boardRev !== revision) throw new CommandError('stale', 'The trip changed during response validation. Read its current revision and try again.');
  const proposal = Math.max(...group.rounds.map(round => round.proposal_version));
  const rounds = group.rounds.filter(round => round.proposal_version === proposal);
  const key = (r: { round_id: string; household_id: string }) => JSON.stringify([r.round_id, r.household_id]);
  const current = new Map(merged.current.map(response => [key(response), response]));
  const conflicts = new Map(merged.conflicts.map(conflict => [key(conflict), conflict]));
  const unresolved = new Set(merged.ledger.entries.filter(entry => {
    const response = entry.response, accepted = current.get(key(response)), conflict = conflicts.get(key(response));
    return !entry.sender_resolved && response.proposal_version === proposal && response.response_revision >= Math.max(accepted?.response_revision ?? 0, conflict?.response_revision ?? 0);
  }).map(entry => key(entry.response)));
  const coverage: GroupRouteCoverage = { total: rounds.length * group.households.length, responding: current.size, pending: rounds.length * group.households.length - current.size - conflicts.size, partial: merged.current.filter(response => response.rankings.length < rounds.find(round => round.round_id === response.round_id)!.rank_limit).length, conflicting: conflicts.size, needs_resolution: unresolved.size };
  const result = routeTripRequest(session, snapshot.request, { ...snapshot, responses: merged.current });
  // Do not expose the stable round identifier or a household's free-text source in routing facts.
  for (const fact of [...result.facts.confirmed, ...result.facts.inferred]) if (fact.source.startsWith('household reply ')) fact.source = fact.source.split(' · round ')[0]!;
  if (coverage.pending || coverage.conflicting || coverage.needs_resolution) {
    result.facts.unknown = result.facts.unknown.filter(fact => fact.field !== 'household rankings');
    result.facts.unknown.push({ field: 'household rankings', reason: coverage.conflicting ? 'conflicting' : 'missing', detail: `${coverage.responding} of ${coverage.total} household/round replies accepted; ${coverage.pending} pending, ${coverage.conflicting} conflicting, ${coverage.needs_resolution} need sender resolution. Silence is not consent.` });
    result.tentative = true;
  }
  if (result.workflow === 'plan') {
    // Routing has not run MOT-111: coverage is never evidence of hours, cost or physical feasibility.
    result.facts.unknown.push({ field: 'schedule feasibility', reason: 'missing', detail: 'Run checkGroupPlan with dated opening, travel, budget and access facts before proposing a firm schedule.' });
    result.tentative = true;
  }
  return { ...result, boardId, revision, group_coverage: coverage };
}
