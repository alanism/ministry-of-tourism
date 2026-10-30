import { describe, expect, it } from 'vitest';
import { createGroupResponse, createTrip, encodeTrip, TripSession } from '@writers-board/core';
import { createTripApi } from './agentApi';

const owner = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const make = () => {
  const session = new TripSession(createTrip({ boardId: 'api-routing', title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon' }));
  session.execute(owner, 'trip_group_configure', { version: 1, trip_id: 'api-routing', households: [{ household_id: 'family', display_name: 'Private family' }], rounds: [{ round_id: 'venues', proposal_version: 1, kind: 'city_venue', city_id: 'lisbon', option_ids: ['museum'], rank_limit: 3, household_weighting: 'one_household_one_vote' }] });
  session.execute(owner, 'trip_card_create', { kind: 'note', title: 'PRIVATE-CARD', scope: 'private' });
  return { session, api: createTripApi(session) };
};

describe('MOT-109 installed routing API', () => {
  it('keeps the sync route and native WP8 tools, with optional answers that are never repeated', async () => {
    const { session, api } = make(), before = encodeTrip(session.doc);
    const narrow = api.route({ text: 'rename lunch' });
    expect(narrow).not.toBeInstanceOf(Promise); expect(narrow).toMatchObject({ workflow: 'small_edit', mode: 'propose', questions: [] });
    expect(createTripApi(session, { whenSaved: async () => {} }).route({ text: 'rename lunch' }).mode).toBe('apply');
    const result = await api.routeGroup({ text: 'What would we like?' }, { answers: { must_do: { status: 'skipped' }, pace: { status: 'partial', value: 'Slow mornings' }, access: { status: 'not_sure' } } });
    expect(result.questions.length).toBeLessThanOrEqual(2); expect(result.questions.every(q => q.optional)).toBe(true);
    for (const id of ['must_do', 'pace', 'access']) expect(result.questions.map(q => q.id)).not.toContain(id);
    expect(result.facts.confirmed).toContainEqual(expect.objectContaining({ field: 'pace', value: 'Slow mornings', source: 'partial answer' }));
    expect(JSON.stringify(api.context())).not.toMatch(/PRIVATE-CARD|Private family/);
    for (const tool of ['trip_group_plan', 'trip_group_feasibility', 'trip_preference_tally']) expect(api.capabilities().commands.some(c => c.name === tool)).toBe(true);
    expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('validates route inputs, requires a ledger for shared facts, and keeps the result tentative', async () => {
    const { session, api } = make(), before = encodeTrip(session.doc);
    const response = await createGroupResponse({ version: 1, trip_id: 'api-routing', proposal_version: 1, round_id: 'venues', household_id: 'family', response_revision: 1, rankings: [], stamps: [], constraints: [], shared_note: 'PRIVATE-NOTE', responded_at: '2026-10-31T10:00:00Z' });
    const result = await api.routeGroup({ text: 'Plan our days' }, { ledger: { version: 1, trip_id: 'api-routing', entries: [{ response, sender_resolved: true }] }, inferred: [{ field: 'opening hours', value: 'Possibly open', source: 'model guess' }] });
    expect(result).toMatchObject({ workflow: 'plan', mode: 'propose', tentative: true, group_coverage: { responding: 1 } });
    expect(result.facts.inferred).toContainEqual(expect.objectContaining({ field: 'opening hours', status: 'inferred' }));
    expect(result.facts.confirmed.some(f => f.field === 'opening hours')).toBe(false);
    expect(() => api.route({ text: 'x', extra: true })).toThrow(/Invalid route request/);
    expect(() => api.route({ text: 'x' }, { responses: [response] })).toThrow(/Invalid route extras/);
    await expect(api.routeGroup({ text: 'Plan' }, { includePrivate: true })).rejects.toThrow(/Invalid group route extras/);
    expect(encodeTrip(session.doc)).toEqual(before);
  });
});
