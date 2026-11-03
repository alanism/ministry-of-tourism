// MOT-152: an instant-runoff reading of the same ranked household replies the positional tally counts.
// It is computed, never stored, so sealed positional results and their validation are unchanged.
import {groupPreferencesSchema} from './group-preferences.ts';
import {preferenceRoundSchema} from './preference-tally.ts';
import {mergeResponseLedger} from './response-ledger.ts';

export const INSTANT_RUNOFF_METHOD = {id: 'mot-household-instant-runoff', version: 1} as const;

export interface InstantRunoffRound { round: number; counts: {option_id: string; votes: number}[]; exhausted: number; active: number; eliminated: string[] }
export type InstantRunoffOutcome =
  /** majority: more than half of every reply that ranked something, not only those still in the count. */
  | {kind: 'winner'; option_id: string; majority: boolean}
  | {kind: 'tie'; option_ids: string[]}
  | {kind: 'no_ballots'};
export interface InstantRunoffResult { method: typeof INSTANT_RUNOFF_METHOD; ballots: number; ranked: number; rounds: InstantRunoffRound[]; outcome: InstantRunoffOutcome }

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/**
 * Each ballot counts for its highest-ranked option still in the count. A ballot with none left is exhausted.
 * An option with more than half of the active ballots wins; `majority` says whether that is also more than half of
 * every ranked ballot (exhausted ones included). Otherwise every option tied for fewest votes is eliminated together;
 * if all remaining options are tied the result is an explicit tie (no hidden tie-break).
 */
export function runInstantRunoff(optionIds: readonly string[], ballots: readonly (readonly string[])[]): Omit<InstantRunoffResult, 'method'> {
  const options = [...new Set(optionIds)].sort(compare), known = new Set(options);
  const cleaned = ballots.map(ballot => [...new Set(ballot.filter(id => known.has(id)))]);
  const rounds: InstantRunoffRound[] = [], ranked = cleaned.filter(ballot => ballot.length).length, done = (outcome: InstantRunoffOutcome) => ({ballots: cleaned.length, ranked, rounds, outcome});
  if (!ranked) return done({kind: 'no_ballots'});
  const continuing = new Set(options);
  for (let round = 1; ; round++) {
    const votes = new Map([...continuing].map(id => [id, 0]));
    let exhausted = 0;
    for (const ballot of cleaned) { const choice = ballot.find(id => continuing.has(id)); if (choice) votes.set(choice, votes.get(choice)! + 1); else exhausted++; }
    const active = cleaned.length - exhausted, counts = [...votes].map(([option_id, n]) => ({option_id, votes: n})).sort((a, b) => compare(a.option_id, b.option_id));
    const top = Math.max(...counts.map(c => c.votes)), leaders = counts.filter(c => c.votes === top);
    const record = (eliminated: string[]) => rounds.push({round, counts, exhausted, active, eliminated});
    // A sole remaining option holds every active ballot, so this always ends the count by then.
    if (top * 2 > active) { record([]); return done({kind: 'winner', option_id: leaders[0]!.option_id, majority: top * 2 > ranked}); }
    const low = Math.min(...counts.map(c => c.votes)), lowest = counts.filter(c => c.votes === low).map(c => c.option_id);
    if (lowest.length === continuing.size) { record([]); return done({kind: 'tie', option_ids: lowest}); }
    record(lowest);
    for (const id of lowest) continuing.delete(id);
  }
}

/** Same reply selection as tallyGroupPreferences: one current accepted reply per household for the declared current round. */
export async function instantRunoffGroupPreferences(configuration: unknown, ledger: unknown, selection: unknown): Promise<InstantRunoffResult> {
  const group = groupPreferencesSchema.parse(configuration), selected = preferenceRoundSchema.parse(selection);
  const round = group.rounds.find(r => r.round_id === selected.round_id && r.proposal_version === selected.proposal_version);
  if (!round) throw new Error('Choose a declared round and proposal version');
  if (round.proposal_version !== Math.max(...group.rounds.map(r => r.proposal_version))) throw new Error('This proposal is stale; tally a declared current round');
  const merged = await mergeResponseLedger(group, ledger, []);
  const replies = merged.current.filter(r => r.proposal_version === round.proposal_version && r.round_id === round.round_id).sort((a, b) => compare(a.household_id, b.household_id));
  const ballots = replies.map(reply => [...reply.rankings].sort((a, b) => a.rank - b.rank).map(r => r.option_id));
  return {method: INSTANT_RUNOFF_METHOD, ...runInstantRunoff(round.option_ids, ballots)};
}
