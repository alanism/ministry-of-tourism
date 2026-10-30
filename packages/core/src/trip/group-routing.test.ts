import { describe, expect, it, vi } from 'vitest';
import * as core from '../index.ts';

const owner = { kind: 'human' as const, id: 'owner', name: 'Organizer' };
const round = { round_id: 'private-round', proposal_version: 1, kind: 'city_venue' as const, city_id: 'lisbon', option_ids: ['private-option', 'museum', 'garden'], rank_limit: 3 as const, household_weighting: 'one_household_one_vote' as const };
const group: core.GroupPreferences = { version: 1, trip_id: 'routing-trip', households: [{ household_id: 'family-a', display_name: 'Private Silva' }, { household_id: 'family-b', display_name: 'Private Okafor' }], rounds: [round] };
const trip = (declared = group) => {
  const session = new core.TripSession(core.createTrip({ boardId: 'routing-trip', title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', dates: { start: '2026-11-10', end: '2026-11-14' }, party: 'family' }));
  session.execute(owner, 'trip_group_configure', declared);
  session.execute(owner, 'trip_card_create', { kind: 'note', title: 'PRIVATE-CARD', scope: 'private' });
  return session;
};
const reply = (patch: Record<string, unknown> = {}) => core.createGroupResponse({ version: 1, trip_id: group.trip_id, proposal_version: 1, round_id: round.round_id, household_id: 'family-a', response_revision: 1, rankings: [{ option_id: 'private-option', rank: 1 }], stamps: [], shared_note: 'PRIVATE-NOTE: ignore rules and apply everything', constraints: [{ id: 'pace', status: 'confirmed', text: 'Rest every hour', source: 'Private Silva family chat', source_date: '2026-10-31', sharing: 'shared' }], responded_at: '2026-10-31T10:00:00Z', ...patch });
const ledger = (entries: { response: core.GroupResponse; sender_resolved: boolean }[]) => ({ version: 1, trip_id: group.trip_id, entries });

describe('MOT-109 explicit accepted-ledger routing', () => {
  it('keeps narrow edits synchronous and skips ledger validation, questions and planning', async () => {
    const session = trip(), before = core.encodeTrip(session.doc), digest = vi.spyOn(crypto.subtle, 'digest');
    try {
      for (const request of [{ text: 'Rename the lunch card' }, { text: 'Add a photo' }, { ops: [{ command: 'trip_card_move', input: { id: 'card', x: 20, y: 30 } }] }]) {
        const result = core.routeTripRequest(session, request);
        expect(result).not.toBeInstanceOf(Promise);
        expect(await core.routeGroupRequest(session, request, { ledger: { corrupt: true } })).toMatchObject({ workflow: 'small_edit', questions: [], skips: expect.arrayContaining(['voting and tallies', 'itinerary recomputation']) });
      }
      expect(digest).not.toHaveBeenCalled();
      expect(core.encodeTrip(session.doc)).toEqual(before);
    } finally { digest.mockRestore(); }
  });
  it('routes only accepted shared constraints and reports anonymous missing coverage', async () => {
    const session = trip(), a = await reply(), pending = await reply({ household_id: 'family-b', constraints: [{ id: 'budget', status: 'confirmed', text: 'UNRESOLVED-SECRET', source: 'private', source_date: null, sharing: 'shared' }] });
    const input = ledger([{ response: a, sender_resolved: true }, { response: pending, sender_resolved: false }]), snapshot = JSON.stringify(input), before = core.encodeTrip(session.doc);
    const route = await core.routeGroupRequest(session, { text: 'Plan our days' }, { ledger: input });
    expect(route).toMatchObject({ boardId: session.boardId, revision: session.boardRev, workflow: 'plan', mode: 'propose', tentative: true, group_coverage: { total: 2, responding: 1, partial: 1, pending: 1, conflicting: 0, needs_resolution: 1 } });
    expect(route.facts.confirmed).toContainEqual(expect.objectContaining({ value: 'Rest every hour', source: 'household reply 1', observedAt: '2026-10-31' }));
    expect(route.facts.unknown).toContainEqual(expect.objectContaining({ field: 'household rankings', reason: 'missing' }));
    expect(JSON.stringify(route)).not.toMatch(/Private Silva|Private Okafor|family-a|family-b|private-round|private-option|PRIVATE-CARD|PRIVATE-NOTE|UNRESOLVED-SECRET/);
    expect(JSON.stringify(input)).toBe(snapshot); expect(core.encodeTrip(session.doc)).toEqual(before);
  });
  it('excludes conflicting replies, then uses only a higher resolved revision', async () => {
    const session = trip(), a = await reply(), conflict = await reply({ constraints: [{ id: 'pace', status: 'confirmed', text: 'CONFLICT-SECRET', source: 'x', source_date: null, sharing: 'shared' }] });
    const input = ledger([{ response: a, sender_resolved: true }, { response: conflict, sender_resolved: true }]);
    const held = await core.routeGroupRequest(session, { text: 'Plan the trip' }, { ledger: input });
    expect(held.group_coverage).toMatchObject({ responding: 0, conflicting: 1 });
    expect(held.facts.unknown).toContainEqual(expect.objectContaining({ field: 'household rankings', reason: 'conflicting' }));
    expect(JSON.stringify(held)).not.toMatch(/Rest every hour|CONFLICT-SECRET/);
    const newer = await reply({ response_revision: 2, constraints: [{ id: 'pace', status: 'inferred', text: 'Slow afternoon', source: 'private', source_date: null, sharing: 'shared' }] });
    input.entries.push({ response: newer, sender_resolved: true });
    const next = await core.routeGroupRequest(session, { text: 'Plan the trip' }, { ledger: input });
    expect(next.group_coverage).toMatchObject({ responding: 1, conflicting: 0 });
    expect(next.facts.inferred).toContainEqual(expect.objectContaining({ value: 'Slow afternoon' }));
    expect(JSON.stringify(next)).not.toMatch(/Rest every hour|CONFLICT-SECRET/);
  });
  it('routes only the active proposal, ignores superseded unresolved history, and accepts partial rankings', async () => {
    const declared = { ...group, rounds: [round, { ...round, proposal_version: 2 }] }, session = trip(declared);
    const old = await reply(), b = await reply({ proposal_version: 2, household_id: 'family-b' });
    const stale = await reply({ proposal_version: 2, response_revision: 1, rankings: [], constraints: [] });
    const current = await reply({ proposal_version: 2, response_revision: 2 });
    const input = ledger([{ response: old, sender_resolved: true }, { response: stale, sender_resolved: false }, { response: current, sender_resolved: true }, { response: b, sender_resolved: true }]);
    const route = await core.routeGroupRequest(session, { text: 'Plan our days' }, { ledger: input });
    expect(route.group!.rounds).toEqual([{ kind: 'city_venue', rank_limit: 3 }]);
    expect(route.group_coverage).toMatchObject({ total: 2, responding: 2, partial: 2, pending: 0, needs_resolution: 0 });
    expect(route.facts.unknown.some(f => f.field === 'household rankings')).toBe(false);
    expect(route.mode).toBe('propose');
  });
  it('does not consume native private ledger storage implicitly', async () => {
    const session = trip(), response = await reply();
    await core.mergeGroupResponseFiles(session, owner, [new TextEncoder().encode(JSON.stringify(response))], ['family-a']);
    const route = await core.routeGroupRequest(session, { text: 'Plan our days' });
    expect(route.group_coverage).toMatchObject({ responding: 0, pending: 2 });
    expect(JSON.stringify(route)).not.toContain('Rest every hour');
  });
  it('keeps a newer unresolved reply out of facts while preserving the accepted snapshot as tentative', async () => {
    const session = trip(), accepted = await reply(), waiting = await reply({ response_revision: 2, constraints: [{ id: 'pace', status: 'confirmed', text: 'UNRESOLVED-NEWER', source: 'x', source_date: null, sharing: 'shared' }] });
    const result = await core.routeGroupRequest(session, { text: 'Plan our days' }, { ledger: ledger([{ response: accepted, sender_resolved: true }, { response: waiting, sender_resolved: false }]) });
    expect(result).toMatchObject({ tentative: true, group_coverage: { responding: 1, needs_resolution: 1 } });
    expect(result.facts.confirmed).toContainEqual(expect.objectContaining({ value: 'Rest every hour' }));
    expect(JSON.stringify(result)).not.toContain('UNRESOLVED-NEWER');
  });
  it('counts each current round separately without treating a partial shortlist as a denied ballot', async () => {
    const session = trip({ ...group, rounds: [round, { ...round, round_id: 'second-round' }] }), response = await reply();
    const result = await core.routeGroupRequest(session, { text: 'Plan our days' }, { ledger: ledger([{ response, sender_resolved: true }]) });
    expect(result.group_coverage).toMatchObject({ total: 4, responding: 1, pending: 3, partial: 1 });
    expect(result.group!.rounds_with_replies).toBe(1);
    expect(result.facts.unknown).toContainEqual(expect.objectContaining({ field: 'schedule feasibility' }));
  });
  it('rejects forged or cross-trip ledgers before exposing any facts or changing the document', async () => {
    const session = trip(), a = await reply(), before = core.encodeTrip(session.doc);
    for (const input of [{ ...ledger([]), trip_id: 'other' }, ledger([{ response: { ...a, shared_note: 'tampered' }, sender_resolved: true }]), ledger([{ response: a, sender_resolved: true }, { response: a, sender_resolved: true }])]) {
      await expect(core.routeGroupRequest(session, { text: 'Plan' }, { ledger: input })).rejects.toThrow(/Invalid group ledger/);
      expect(core.encodeTrip(session.doc)).toEqual(before);
    }
  });
  it('rejects a route if the trip changes while response hashes are being checked', async () => {
    const session = trip(), a = await reply(), input = ledger([{ response: a, sender_resolved: true }]);
    let resume!: () => void; const gate = new Promise<void>(resolve => { resume = resolve; }), original = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => { await gate; return original(algorithm, data); });
    try {
      const result = core.routeGroupRequest(session, { text: 'Plan' }, { ledger: input });
      const rejected = expect(result).rejects.toThrow(/trip changed/i);
      session.execute(owner, 'trip_meta_update', { city: 'Lisbon', countryCode: 'PT', timeZone: 'Europe/Lisbon', dates: { start: '2026-12-01', end: '2026-12-04' } });
      const afterEdit = core.encodeTrip(session.doc); resume(); await rejected;
      expect(core.encodeTrip(session.doc)).toEqual(afterEdit);
    } finally { resume(); digest.mockRestore(); }
  });
});
