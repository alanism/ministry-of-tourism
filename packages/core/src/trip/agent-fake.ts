// Deterministic agent adapter (MOT-19). Labeled TEST_ADAPTER wherever shown. Same input -> same output.
import type { Proposal } from './proposals.ts';
import type { TripSession } from './session.ts';

export const TEST_ADAPTER_LABEL = 'Test adapter (deterministic, not Muse)';

export type FakeMode = 'ok' | 'delay' | 'error' | 'late' | 'malformed';
export interface FakeResult { kind: 'proposal'; proposal: Proposal; label: typeof TEST_ADAPTER_LABEL; }

export function fakeProposal(session: TripSession, seed = 'demo'): Proposal {
  const read = session.execute<{ cards: { id: string }[] }>({ kind: 'agent', id: 'agent:fake', name: TEST_ADAPTER_LABEL }, 'trip_read');
  const first = read.cards[0];
  const ops = first
    ? [{ command: 'trip_card_update', input: { id: first.id, body: `Suggested by the test adapter (${seed}).` } }]
    : [{ command: 'trip_card_create', input: { kind: 'note', title: 'Test adapter suggestion', body: `Seed: ${seed}`, stage: 'plan', provenance: 'agent' } }];
  return {
    id: `fake-${seed}`, boardId: session.boardId,
    token: session.token(first ? [first.id] : []),
    ops, sources: [], reason: 'Deterministic test proposal', author: 'agent:fake', status: 'proposed',
  };
}

/** One suggested change as the review screen shows it: what, where, from what, and why. */
export interface ReviewOp { title: string; target: string; source: string; why: string; assetId?: string }
export interface ReviewSuggestion { proposal: Proposal; ops: ReviewOp[]; toolsCalled: string[]; label: typeof TEST_ADAPTER_LABEL }

/**
 * The review screen's suggestions while Muse is not connected (MOT-19/25): deterministic, read through
 * the agent's own trip_read (so private cards are never seen), with every source named.
 */
export function fakeReviewSuggestion(session: TripSession, id: string): ReviewSuggestion {
  const read = session.execute<{ cards: { id: string; title: string; assetIds: string[]; provenance: string }[] }>({ kind: 'agent', id: 'agent:fake', name: TEST_ADAPTER_LABEL }, 'trip_read');
  const photo = read.cards.find((c) => c.assetIds.length && /river/i.test(c.title)) ?? read.cards.find((c) => c.assetIds.length);
  const guide = read.cards.find((c) => c.provenance === 'host');
  const riverAsset = photo?.assetIds[photo.assetIds.length - 1];
  const ops: ReviewOp[] = [
    { title: 'Add a river photo card', target: 'Remember', source: photo ? `Trip photo on "${photo.title}"` : 'No trip photo yet', why: 'Add a photo card to capture the river evening from your day 1.', assetId: riverAsset },
    { title: 'Add a market stop', target: 'Explore', source: guide ? `Host guide: "${guide.title}"` : 'Host guide', why: 'Add a short stop for a local market in Talat Noi.' },
  ];
  const proposal: Proposal = {
    id, boardId: session.boardId, token: session.token([]), reason: 'Test adapter suggestions', author: 'agent:fake', status: 'proposed',
    sources: [photo, guide].filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ id: c.id, retrievedAt: new Date().toISOString() })),
    ops: [
      { command: 'trip_card_create', input: { kind: 'photo', title: 'Evening on the river', body: 'Boats, lights and the sunset from our first night.', stage: 'remember', provenance: 'agent', day: '2026-11-13', time: '19:00', assetIds: riverAsset ? [riverAsset] : [] } },
      { command: 'trip_card_create', input: { kind: 'place', title: 'Market stop', body: 'A short stop for a local market in Talat Noi.', stage: 'explore', provenance: 'agent' } },
    ],
  };
  return { proposal, ops, toolsCalled: ['trip_read'], label: TEST_ADAPTER_LABEL };
}

export async function runFakeAgent(session: TripSession, mode: FakeMode = 'ok', seed = 'demo'): Promise<FakeResult> {
  if (mode === 'error') throw new Error('Test adapter error (simulated)');
  if (mode === 'malformed') return { kind: 'proposal', proposal: { ...fakeProposal(session, seed), ops: [{ command: 'trip_card_create', input: { bogus: true } }] } as Proposal, label: TEST_ADAPTER_LABEL };
  if (mode === 'delay' || mode === 'late') await new Promise((r) => setTimeout(r, mode === 'late' ? 50 : 5));
  return { kind: 'proposal', proposal: fakeProposal(session, seed), label: TEST_ADAPTER_LABEL };
}
