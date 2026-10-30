import { describe, expect, it, vi } from 'vitest';
import { createMuseAdapter, PROPOSAL_EXAMPLE_OPS, PROVIDER_INSTRUCTION } from './index.ts';
import { TRIP_COMMANDS } from '../../core/src/trip/commands.ts';
import { PROPOSABLE_COMMANDS } from '../../core/src/trip/proposals.ts';
import { CARD_KINDS, STAGES, TASK_STATUSES } from '../../core/src/trip/schema.ts';

// MOT-95 live receipt (31 Oct, muse-wonder-1.0, chatcmpl-01a18e23-…): with no input shapes in the developer
// instruction the model sent trip_card_create {title, description, stage}, which the app's validator refused.
const liveShape = { command: 'trip_card_create', input: { title: 'First afternoon', description: 'Museum block', stage: 'explore' } };

describe('MOT-95 provider instruction documents the inputs the app validates', () => {
  it('the observed live shape is rejected by the real command schema', () => {
    expect(TRIP_COMMANDS.find(c => c.name === liveShape.command)!.input.safeParse(liveShape.input).success).toBe(false);
  });
  it('states each proposable command with an example input that the real command schema accepts', () => {
    // Asset records (bytes, hashes) never leave the device, so the model is told not to attach assets.
    expect(new Set([...Object.keys(PROPOSAL_EXAMPLE_OPS), 'trip_asset_attach'])).toEqual(PROPOSABLE_COMMANDS);
    expect(PROVIDER_INSTRUCTION).toContain('Do not propose trip_asset_attach');
    for (const [command, input] of Object.entries(PROPOSAL_EXAMPLE_OPS)) {
      expect(PROVIDER_INSTRUCTION).toContain(JSON.stringify({ command, input }));
      expect(TRIP_COMMANDS.find(c => c.name === command)!.input.safeParse(input).success, command).toBe(true);
    }
    for (const value of [...CARD_KINDS, ...STAGES, ...TASK_STATUSES]) expect(PROVIDER_INSTRUCTION).toContain(`"${value}"`);
    expect(PROVIDER_INSTRUCTION).toContain('"body"');
    expect(PROVIDER_INSTRUCTION).toContain('"provenance":"agent"');
  });
});

describe('MOT-95 provider payload carries only documented fields', () => {
  it('sends model, developer/user messages, max_completion_tokens and stream, and only the documented board fields', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'r', model: 'muse-wonder-1.0', choices: [{ message: { content: JSON.stringify({ boardId: 'b', ops: [], reason: 'none', sources: [] }) }, finish_reason: 'stop' }] })));
    const request = { boardId: 'b', prompt: 'QA', cards: [{ id: 'c', title: 't', body: 'x', stage: 'plan', day: '2026-11-01', time: '09:00' }], assetIds: [], grounding: { level: 'unavailable', cityId: 'san-sebastian', articles: [] } };
    expect((await createMuseAdapter({ META_API_KEY: 'fictional', META_MODEL_ID: 'muse-wonder-1.0', META_PRIVACY_ACKNOWLEDGED: 'true' }, { fetcher }).propose(request)).status).toBe('ok');
    const payload = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.keys(payload).sort()).toEqual(['max_completion_tokens', 'messages', 'model', 'stream']);
    expect(payload.messages.map((m: { role: string }) => m.role)).toEqual(['developer', 'user']);
    const data = JSON.parse(payload.messages[1].content);
    expect(Object.keys(data).sort()).toEqual(['assetIds', 'boardId', 'cards', 'grounding', 'prompt']);
    expect(Object.keys(data.cards[0]).sort()).toEqual(['body', 'day', 'id', 'stage', 'time', 'title']);
  });
});
