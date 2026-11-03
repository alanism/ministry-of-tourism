import { expect, it } from 'vitest';
import * as core from '../index.ts';
import { instantRunoffGroupPreferences, runInstantRunoff } from './instant-runoff.ts';

const many = (n: number, ballot: string[]) => Array.from({ length: n }, () => ballot);

it('elects the documented divergence example differently from positional points: C is dropped and its replies move to B', () => {
  const result = runInstantRunoff(['A', 'B', 'C'], [...many(7, ['A', 'C', 'B']), ...many(6, ['B', 'C', 'A']), ...many(2, ['C', 'B', 'A'])]);
  expect(result.rounds[0]).toMatchObject({ round: 1, counts: [{ option_id: 'A', votes: 7 }, { option_id: 'B', votes: 6 }, { option_id: 'C', votes: 2 }], active: 15, exhausted: 0, eliminated: ['C'] });
  expect(result.rounds[1]).toMatchObject({ round: 2, counts: [{ option_id: 'A', votes: 7 }, { option_id: 'B', votes: 8 }], eliminated: [] });
  expect(result.outcome).toEqual({ kind: 'winner', option_id: 'B', majority: true });
});

it('stops in round one when an option already has more than half of the replies', () => {
  const result = runInstantRunoff(['A', 'B', 'C'], [...many(3, ['A']), ['B', 'A'], ['C']]);
  expect(result.rounds).toHaveLength(1);
  expect(result.outcome).toEqual({ kind: 'winner', option_id: 'A', majority: true });
});

it('counts partial rankings as exhausted once their choices are gone, and never calls a win after exhaustion a majority of all', () => {
  const result = runInstantRunoff(['A', 'B', 'C'], [['A'], ['A'], ['B'], ['B'], ['C']]);
  expect(result.rounds[0]!.eliminated).toEqual(['C']);
  expect(result.rounds[1]).toMatchObject({ exhausted: 1, active: 4, counts: [{ option_id: 'A', votes: 2 }, { option_id: 'B', votes: 2 }] });
  expect(result.outcome).toEqual({ kind: 'tie', option_ids: ['A', 'B'] });
  // Exhausted replies leave the count: A wins round two with all three active replies, but 3 of 7 is not a majority of all.
  const last = runInstantRunoff(['A', 'B', 'C'], [['A'], ['A'], ['A'], ['B'], ['B'], ['C'], ['C']]);
  expect(last.rounds[0]!.eliminated).toEqual(['B', 'C']);
  expect(last.rounds[1]).toMatchObject({ exhausted: 4, active: 3, counts: [{ option_id: 'A', votes: 3 }] });
  expect(last.outcome).toEqual({ kind: 'winner', option_id: 'A', majority: false });
  expect(last.ranked).toBe(7);
});

it('drops every option tied for fewest together, including options nobody ranked first, with no hidden tie-break', () => {
  const result = runInstantRunoff(['A', 'B', 'C', 'D', 'E'], [['A', 'D'], ['A'], ['B', 'D'], ['C', 'B'], ['B'], ['A']]);
  expect(result.rounds[0]!.eliminated).toEqual(['D', 'E']);
  expect(result.rounds[1]!.eliminated).toEqual(['C']);
  expect(result.outcome).toEqual({ kind: 'tie', option_ids: ['A', 'B'] });
});

it('ignores unknown or repeated options and reports no ballots when nobody ranked anything', () => {
  expect(runInstantRunoff(['A', 'B'], [[], []]).outcome).toEqual({ kind: 'no_ballots' });
  const result = runInstantRunoff(['A', 'B'], [['Z', 'A', 'A'], ['B']]);
  expect(result.rounds[0]!.counts).toEqual([{ option_id: 'A', votes: 1 }, { option_id: 'B', votes: 1 }]);
  expect(result.outcome).toEqual({ kind: 'tie', option_ids: ['A', 'B'] });
});

// Integration with the real reply ledger: the same current replies the positional tally counts.
const H = ['h1', 'h2', 'h3', 'h4', 'h5'], round = { proposal_version: 1, round_id: 'venues' };
const group = (rounds = [{ ...round, kind: 'city_venue', city_id: 'bangkok', option_ids: ['A', 'B', 'C'], rank_limit: 3, household_weighting: 'one_household_one_vote' }]) => ({ version: 1, trip_id: 'trip-irv', households: H.map(household_id => ({ household_id, display_name: household_id })), rounds });
const reply = (household_id: string, ids: string[], extra: Record<string, unknown> = {}) => core.createGroupResponse({ version: 1, trip_id: 'trip-irv', ...round, household_id, response_revision: 1, rankings: ids.map((option_id, i) => ({ option_id, rank: i + 1 })), stamps: [], shared_note: '', constraints: [], responded_at: '2026-11-04T10:00:00Z', ...extra });
const ledger = async (replies: core.GroupResponse[], resolved = H) => (await core.mergeResponseLedger(group(), undefined, replies, { resolvedHouseholds: resolved })).ledger;

it('reads exactly the replies the positional tally counts: one current reply per household, revisions replace, replays add nothing', async () => {
  const a = await reply('h1', ['C', 'B']), a2 = await reply('h1', ['A', 'B'], { response_revision: 2 }), b = await reply('h2', ['B', 'A']), c = await reply('h3', ['A']);
  const l = await ledger([a, a, a2, b, c]);
  const irv = await instantRunoffGroupPreferences(group(), l, round), tally = await core.tallyGroupPreferences(group(), l, round);
  expect(irv.ballots).toBe(tally.coverage.responding);
  expect(irv.rounds[0]!.counts).toEqual([{ option_id: 'A', votes: 2 }, { option_id: 'B', votes: 1 }, { option_id: 'C', votes: 0 }]);
  expect(irv.outcome).toEqual({ kind: 'winner', option_id: 'A', majority: true });
});

it('leaves conflicting and unresolved replies out exactly as the tally does', async () => {
  const x = await reply('h1', ['A']), y = await reply('h1', ['B']), z = await reply('h2', ['C']);
  const first = await ledger([x, y], ['h1']), l = (await core.mergeResponseLedger(group(), first, [z])).ledger;
  const irv = await instantRunoffGroupPreferences(group(), l, round), tally = await core.tallyGroupPreferences(group(), l, round);
  expect(irv.ballots).toBe(tally.coverage.responding);
});

it('refuses a superseded proposal the same way the positional tally does', async () => {
  const two = group([{ ...round, kind: 'city_venue', city_id: 'bangkok', option_ids: ['A', 'B', 'C'], rank_limit: 3, household_weighting: 'one_household_one_vote' }, { proposal_version: 2, round_id: 'venues', kind: 'city_venue', city_id: 'bangkok', option_ids: ['A', 'B'], rank_limit: 3, household_weighting: 'one_household_one_vote' }]);
  await expect(core.tallyGroupPreferences(two, undefined, round)).rejects.toThrow(/stale/);
  await expect(instantRunoffGroupPreferences(two, undefined, round)).rejects.toThrow(/stale/);
});
