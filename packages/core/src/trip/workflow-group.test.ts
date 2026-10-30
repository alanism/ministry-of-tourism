// MOT-109 on the real MOT-105 contract: declared rounds shape routing without exposing the roster,
// and current reply constraints become confirmed, inferred or unknown facts.
import { describe, expect, it } from 'vitest';
import { agentContext, groupSummary, responseConstraintFacts, routeTripRequest } from './agent-context.ts';
import { createGroupResponse, type GroupPreferences } from './group-preferences.ts';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';

const organizer = { kind: 'human' as const, id: 'organizer', name: 'Organizer' };
const venues = { round_id: 'venues', proposal_version: 1, kind: 'city_venue' as const, city_id: 'lisbon', option_ids: ['beach', 'boat', 'museum'], rank_limit: 5 as const, household_weighting: 'one_household_one_vote' as const };
const destination = { round_id: 'where', proposal_version: 1, kind: 'destination' as const, option_ids: ['lisbon', 'porto'], rank_limit: 3 as const, household_weighting: 'one_household_one_vote' as const };
const group: GroupPreferences = { version: 1, trip_id: 'group-trip', households: [{ household_id: 'family-a', display_name: 'The Silvas' }, { household_id: 'family-b', display_name: 'The Okafors' }], rounds: [venues] };
const trip = (declared: GroupPreferences = group) => {
  const session = new TripSession(createTrip({ title: 'Group trip', city: 'Lisbon', cityId: 'lisbon', countryCode: 'PT', timeZone: 'Europe/Lisbon', boardId: 'group-trip', dates: { start: '2026-11-10', end: '2026-11-14' }, party: 'family' }));
  session.execute(organizer, 'trip_group_configure', declared);
  return session;
};
type Constraint = { id: string; status: 'confirmed' | 'inferred' | 'unknown'; text: string; source: string; source_date: string | null };
const reply = (household: string, revision: number, constraints: Constraint[], extra: Record<string, unknown> = {}) => createGroupResponse({ version: 1, trip_id: 'group-trip', proposal_version: 1, round_id: 'venues', household_id: household, response_revision: revision, rankings: [{ option_id: 'beach', rank: 1 }], stamps: [], shared_note: '', responded_at: '2026-11-01T10:00:00+00:00', constraints: constraints.map(c => ({ ...c, sharing: 'shared' })), ...extra });

describe('MOT-109 routing with declared MOT-105 rounds', () => {
  it('describes each declared round without the roster and keeps the optional questions', () => {
    const session = trip({ ...group, rounds: [venues, destination] });
    const route = routeTripRequest(session, { text: 'What would everyone like to do?' });
    expect(route.group!.rounds).toEqual([{ kind: 'city_venue', rank_limit: 5 }, { kind: 'destination', rank_limit: 3 }]);
    expect(route.group!.note).toContain('destination: top 3');
    expect(route.group!.note).toContain('city venues: top 5');
    expect(route.questions).toHaveLength(2);
    for (const value of [JSON.stringify(route), JSON.stringify(agentContext(session))]) expect(value).not.toMatch(/Silvas|Okafors|family-a|family-b|museum|porto/);
    expect(routeTripRequest(session, { text: 'Rename the beach card' }).group).toBeUndefined();
    expect(groupSummary(undefined)).toBeUndefined();
  });
  it('keeps a plan tentative until every declared round has a reply', async () => {
    const session = trip();
    const before = routeTripRequest(session, { text: 'Plan our days' });
    expect(before.tentative).toBe(true);
    expect(before.facts.unknown).toContainEqual(expect.objectContaining({ field: 'household rankings' }));
    const after = routeTripRequest(session, { text: 'Plan our days' }, { responses: [await reply('family-a', 1, [])] });
    expect(after).toMatchObject({ tentative: false, group: { rounds_with_replies: 1 } });
  });
  it('uses only current, in-trip replies and never passes a household name through', async () => {
    const old = await reply('family-a', 1, [{ id: 'arrival', status: 'unknown', text: 'Arrival not known', source: 'chat', source_date: null }]);
    const current = await reply('family-a', 2, [{ id: 'arrival', status: 'confirmed', text: 'Arrive 09:00', source: 'The Silvas family chat', source_date: '2026-10-30' }]);
    const other = await reply('family-b', 1, [{ id: 'pace', status: 'inferred', text: 'Slow mornings', source: 'past trips', source_date: null }]);
    const foreign = await reply('family-b', 3, [{ id: 'budget', status: 'confirmed', text: 'No limit', source: 'x', source_date: null }], { trip_id: 'another-trip' });
    const stranger = await reply('family-z', 1, [{ id: 'budget', status: 'confirmed', text: 'No limit', source: 'x', source_date: null }]);
    const { facts, unknown } = responseConstraintFacts(group, [old, current, other, foreign, stranger]);
    expect(facts.map(f => [f.field.replace(/ \(reply \d\)/, ''), f.status, f.value])).toEqual(expect.arrayContaining([['arrival', 'confirmed', 'Arrive 09:00'], ['pace', 'inferred', 'Slow mornings']]));
    expect(facts).toHaveLength(2);
    expect(unknown).toEqual([]);
    expect(JSON.stringify(facts)).not.toMatch(/Silvas|family-a|family-b|No limit/);
  });
  it('keeps two households with the same constraint name apart instead of calling it a conflict', async () => {
    const a = await reply('family-a', 1, [{ id: 'pace', status: 'confirmed', text: 'Fast', source: 's', source_date: null }]);
    const b = await reply('family-b', 1, [{ id: 'pace', status: 'confirmed', text: 'Slow', source: 's', source_date: null }]);
    const route = routeTripRequest(trip(), { text: 'Plan our days' }, { responses: [a, b] });
    expect(route.facts.confirmed.filter(f => f.field.startsWith('pace')).map(f => f.value).sort()).toEqual(['Fast', 'Slow']);
    expect(route.facts.unknown.some(u => u.reason === 'conflicting')).toBe(false);
  });
});
