import { describe, expect, it } from 'vitest';
import { createTrip } from './model.ts';
import { encodeTrip } from './persist.ts';
import { TripSession } from './session.ts';
import { agentContext, routeTripRequest } from './agent-context.ts';
import { materialChanges, preferenceQuestions, routeWorkflow, tripPhase, type RouteContext } from './workflow-routing.ts';

const owner = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const dates = { start: '2026-11-10', end: '2026-11-14' };
const before = new Date('2026-11-01T10:00:00Z'), during = new Date('2026-11-12T10:00:00Z'), after = new Date('2026-11-20T10:00:00Z');
const planned = () => {
  const session = new TripSession(createTrip({ title: 'Lisbon', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'route-trip', dates, party: 'family' }));
  session.executeAll(owner, [
    { command: 'trip_card_create', input: { kind: 'place', title: 'Tram 28', stage: 'explore', day: '2026-11-11', time: '10:00' } },
    { command: 'trip_card_create', input: { kind: 'place', title: 'Dinner', stage: 'explore', day: '2026-11-11', time: '19:30', booking: { status: 'confirmed' } } },
    { command: 'trip_card_create', input: { kind: 'note', title: 'Door code', body: 'PRIVATE-CODE', scope: 'private' } },
  ]);
  return session;
};
const base: RouteContext = { meta: { city: 'Lisbon', dates, timeZone: 'Europe/Lisbon', party: 'family', agentMode: 'together' }, now: before };

describe('MOT-109 smallest-workflow routing', () => {
  it('routes a rename on a fully planned trip to a small edit with no questions and no board change', () => {
    const session = planned(), card = agentContext(session).fixed_bookings[0]!;
    const bytes = encodeTrip(session.doc);
    const route = routeTripRequest(session, { ops: [{ command: 'trip_card_update', input: { id: card.id, title: 'Dinner at Taberna' } }] }, { now: before });
    expect(route).toMatchObject({ workflow: 'small_edit', mode: 'apply', questions: [], tentative: false, invalidates: [] });
    expect(route.skips).toEqual(expect.arrayContaining(['preference questions', 'voting and tallies', 'itinerary recomputation']));
    expect(encodeTrip(session.doc)).toEqual(bytes);
  });
  it('treats a photo addition, also mid-trip, as a small edit', () => {
    for (const now of [before, during]) expect(routeWorkflow({ text: 'Add this photo to the tram card' }, { ...base, now })).toMatchObject({ workflow: 'small_edit', questions: [] });
  });
  it('asks at most two optional questions and never repeats a current answer', () => {
    const first = routeWorkflow({ text: 'What would everyone enjoy?' }, base);
    expect(first.workflow).toBe('preferences');
    expect(first.questions).toHaveLength(2);
    expect(first.questions.every(q => q.optional)).toBe(true);
    const answers = Object.fromEntries(first.questions.map((q, i) => [q.id, i ? { status: 'skipped' as const } : { status: 'answered' as const, value: 'Tile museum' }]));
    const second = routeWorkflow({ text: 'Any other ideas?' }, { ...base, answers });
    expect(second.questions).toHaveLength(2);
    for (const id of Object.keys(answers)) expect(second.questions.map(q => q.id)).not.toContain(id);
    expect(second.facts.confirmed).toContainEqual(expect.objectContaining({ field: first.questions[0]!.id, value: 'Tile museum' }));
    expect(preferenceQuestions(answers, 5)).toHaveLength(2);
  });
  it('produces tentative output with explicit unknowns when every optional question is skipped or facts are missing', () => {
    const skipped = Object.fromEntries(preferenceQuestions({}, 2).map(q => [q.id, { status: 'skipped' as const }]));
    const route = routeWorkflow({ text: 'Plan our days' }, { ...base, meta: { city: 'Lisbon', timeZone: 'Europe/Lisbon', agentMode: 'together' }, answers: skipped });
    expect(route).toMatchObject({ workflow: 'plan', mode: 'propose', tentative: true });
    expect(route.facts.unknown.map(u => u.field)).toEqual(expect.arrayContaining(['dates', 'party']));
    expect(route.questions.map(q => q.id)).toEqual(['dates', 'party']);
    expect(route.facts.confirmed.some(f => skipped[f.field])).toBe(false);
  });
  it('keeps conflicting and stale facts unknown, and inferences apart from confirmed facts', () => {
    const route = routeWorkflow({ text: 'plan tomorrow' }, { ...base, now: during, facts: [
      { field: 'Museum: hours', value: '10:00-18:00', status: 'confirmed', source: 'site A' },
      { field: 'Museum: hours', value: '09:00-17:00', status: 'confirmed', source: 'site B' },
      { field: 'Boat: price', value: '20 EUR', status: 'confirmed', source: 'flyer', validUntil: '2026-10-01T00:00:00Z' },
      { field: 'pace', value: 'slow', status: 'inferred', source: 'brief tone' },
    ] });
    expect(route.facts.unknown).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Museum: hours', reason: 'conflicting' }), expect.objectContaining({ field: 'Boat: price', reason: 'stale' })]));
    expect(route.facts.inferred).toEqual([expect.objectContaining({ field: 'pace' })]);
    expect(route.facts.confirmed.some(f => f.field === 'pace' || f.field === 'Museum: hours')).toBe(false);
    expect(route.tentative).toBe(true);
  });
  it('plans mid-trip without forcing a phase and sends an early keepsake request straight to memories', () => {
    expect(routeWorkflow({ text: 'Can you plan tomorrow?' }, { ...base, now: during })).toMatchObject({ workflow: 'plan', phase_hint: 'during' });
    const early = routeWorkflow({ text: 'Start a keepsake of our best photos' }, { ...base, now: during });
    expect(early).toMatchObject({ workflow: 'keepsake', phase_hint: 'during', questions: [] });
    expect(early.skips).toEqual(expect.arrayContaining(['destination voting', 'planning questions']));
  });
  it('flags material changes to dates, destination, budget or access', () => {
    const route = routeWorkflow({ ops: [{ command: 'trip_meta_update', input: { city: 'Porto', countryCode: 'PT', timeZone: 'Europe/Lisbon', dates: { start: '2026-11-11', end: '2026-11-15' } } }] }, base);
    expect(route.workflow).toBe('trip_change');
    expect(route.invalidates.map(c => c.field)).toEqual(['dates', 'destination']);
    expect(materialChanges({ budget: '200', access: '' }, { budget: '150', access: 'step-free' }).map(c => c.field)).toEqual(['budget', 'access']);
    expect(materialChanges({ budget: '200' }, { budget: ' 200 ' })).toEqual([]);
  });
  it('routes a trip-level move as a trip change, and a dates-only update as a dates change', () => {
    expect(routeWorkflow({ text: 'Move our trip to 12-15 December' }, base)).toMatchObject({ workflow: 'trip_change', mode: 'propose' });
    expect(routeWorkflow({ text: 'Move the tram card to Explore' }, base).workflow).toBe('small_edit');
    const route = routeWorkflow({ ops: [{ command: 'trip_meta_update', input: { dates: { start: '2026-12-12', end: '2026-12-15' } } }] }, base);
    expect(route.invalidates.map(c => c.field)).toEqual(['dates']);
  });
  it('lets an expired fact expire before checking conflicts, comparing instants not strings', () => {
    const now = new Date('2026-10-30T00:30:00Z');
    const route = routeWorkflow({ text: 'plan tomorrow' }, { ...base, now, facts: [
      { field: 'Museum: hours', value: '09:00-17:00', status: 'confirmed', source: 'old flyer', validUntil: '2026-10-01T00:00:00Z' },
      { field: 'Museum: hours', value: '10:00-18:00', status: 'confirmed', source: 'site' },
      { field: 'Boat: price', value: '20 EUR', status: 'confirmed', source: 'desk', validUntil: '2026-10-30T02:00:00+03:00' },
    ] });
    expect(route.facts.confirmed).toContainEqual(expect.objectContaining({ field: 'Museum: hours', value: '10:00-18:00' }));
    expect(route.facts.unknown).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Museum: hours', reason: 'stale' }), expect.objectContaining({ field: 'Boat: price', reason: 'stale' })]));
    expect(route.facts.unknown.some(u => u.reason === 'conflicting')).toBe(false);
  });
  it('flags a supplied fact that contradicts the trip settings', () => {
    const route = routeWorkflow({ text: 'Plan our days' }, { ...base, facts: [{ field: 'dates', value: '2026-12-20 to 2026-12-22', status: 'confirmed', source: 'email' }] });
    expect(route.facts.unknown).toContainEqual(expect.objectContaining({ field: 'dates', reason: 'conflicting' }));
    expect(route.facts.confirmed.some(f => f.field === 'dates')).toBe(false);
    expect(route.tentative).toBe(true);
  });
  it('reports read-only in Solo mode and a proposal when durable saving is unavailable', () => {
    expect(routeWorkflow({ text: 'rename the tram card' }, { ...base, meta: { ...base.meta, agentMode: 'solo' } }).mode).toBe('read_only');
    expect(routeWorkflow({ text: 'rename the tram card' }, { ...base, tools: { persistence: false } }).mode).toBe('propose');
  });
  it('uses the phase only as a hint and is deterministic', () => {
    expect([before, during, after].map(now => tripPhase({ dates, timeZone: 'Europe/Lisbon' }, now))).toEqual(['planning', 'during', 'post']);
    expect(tripPhase({ timeZone: null })).toBe('unknown');
    expect(routeWorkflow({ text: 'help' }, { ...base, now: after }).workflow).toBe('keepsake');
    expect(JSON.stringify(routeWorkflow({ text: 'What do we like?' }, base))).toBe(JSON.stringify(routeWorkflow({ text: 'What do we like?' }, base)));
  });
  it('never exposes private cards to an agent context', () => {
    const context = agentContext(planned(), { now: before });
    expect(JSON.stringify(context)).not.toContain('PRIVATE-CODE');
    expect(context).toMatchObject({ current_phase: 'planning', counts: { cards: 2 }, fixed_bookings: [expect.objectContaining({ title: 'Dinner' })], guide: { guide_url: null } });
  });
});
