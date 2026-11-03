import { expect, it } from 'vitest';
import { runInstantRunoff } from './instant-runoff.ts';

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

it('counts partial rankings as exhausted once their choices are gone, and majorities use only active replies', () => {
  const result = runInstantRunoff(['A', 'B', 'C'], [['A'], ['A'], ['B'], ['B'], ['C']]);
  expect(result.rounds[0]!.eliminated).toEqual(['C']);
  expect(result.rounds[1]).toMatchObject({ exhausted: 1, active: 4, counts: [{ option_id: 'A', votes: 2 }, { option_id: 'B', votes: 2 }] });
  expect(result.outcome).toEqual({ kind: 'tie', option_ids: ['A', 'B'] });
  // Exhausted replies leave the count: A wins round two with all three active replies while four are exhausted.
  const last = runInstantRunoff(['A', 'B', 'C'], [['A'], ['A'], ['A'], ['B'], ['B'], ['C'], ['C']]);
  expect(last.rounds[0]!.eliminated).toEqual(['B', 'C']);
  expect(last.rounds[1]).toMatchObject({ exhausted: 4, active: 3, counts: [{ option_id: 'A', votes: 3 }] });
  expect(last.outcome).toEqual({ kind: 'winner', option_id: 'A', majority: true });
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
