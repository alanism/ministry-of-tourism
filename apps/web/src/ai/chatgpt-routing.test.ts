import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';

const state = vi.hoisted(() => ({
  jobs: {
    reverse: { provider: 'chatgpt', model: 'account-model' },
    coach: { provider: 'chatgpt', model: 'account-model' },
    agent: { provider: 'chatgpt', model: 'account-model' },
  },
  send: vi.fn(),
}));
vi.mock('./settings', () => ({
  aiSettings: () => ({ jobs: state.jobs, keys: {} }),
  PROVIDERS: { chatgpt: { label: 'ChatGPT plan' } },
}));
vi.mock('./chatgpt-connection', () => ({ sendChatGptResponse: state.send }));
vi.mock('../state/board', () => {
  const session = new BoardSession(createBoard({ starterCards: false }));
  return { boardSession: () => session, latestBoard: () => session.execute({ kind: 'human', id: 'writer', name: 'Writer' }, 'board_read') };
});

import { generateStructured } from './providers';
import { startAgent, BUILT_IN_AGENT } from './agent';
import { boardSession } from '../state/board';

function completed(output: unknown[]): Response {
  return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } })}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
const answer = (text: string) => [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }];
const writer = { kind: 'human' as const, id: 'writer', name: 'Writer' };

beforeEach(() => {
  vi.stubGlobal('window', {});
  state.send.mockReset();
  boardSession().execute(writer, 'settings_set_agent_mode', { mode: 'together' });
  boardSession().execute(writer, 'settings_set_draft_for_me', { enabled: false });
});
afterEach(() => vi.unstubAllGlobals());

describe('ChatGPT text job routing', () => {
  for (const job of ['reverse', 'coach'] as const) {
    it(`uses the hosted connection for ${job} without asking for an API key`, async () => {
      state.send.mockResolvedValueOnce(completed(answer('{"note":"A clear opening."}')));
      const result = await generateStructured({ job, system: 'Coach this writing.', user: 'My opening.', name: 'review', schema: z.object({ note: z.string() }) });
      expect(result).toEqual({ note: 'A clear opening.' });
      const body = state.send.mock.calls[0]![0];
      expect(body).toMatchObject({ model: 'account-model', instructions: 'Coach this writing.', store: false, stream: true, input: [{ role: 'user', content: 'My opening.' }] });
      expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'review', strict: true });
    });
  }

  it('rejects invalid structured results before they can reach board commands', async () => {
    state.send.mockResolvedValueOnce(completed(answer('{"note":17}')));
    await expect(generateStructured({ job: 'reverse', system: 'Analyze.', user: 'Source.', name: 'review', schema: z.object({ note: z.string() }) })).rejects.toThrow();
  });

  it('does not change billing providers when the ChatGPT connection fails', async () => {
    state.send.mockRejectedValueOnce(new Error('ChatGPT usage limit reached. Manage usage in ChatGPT settings.'));
    await expect(generateStructured({ job: 'coach', system: 'Coach.', user: 'Source.', name: 'review', schema: z.object({ note: z.string() }) })).rejects.toThrow(/usage limit/);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.jobs.coach.provider).toBe('chatgpt');
  });

  it('keeps Coach mode enforced when a ChatGPT agent tries to write prose', async () => {
    const { id } = boardSession().execute<{ id: string }>(writer, 'card_create', { type: 'idea.thesis' });
    state.send.mockResolvedValueOnce(completed([{ type: 'function_call', namespace: 'writers_board', call_id: 'write-1', name: 'card_set_text', arguments: JSON.stringify({ id, text: 'Generated prose.' }) }]))
      .mockResolvedValueOnce(completed(answer('Please enable Draft for me.')));
    await startAgent().ask('Write this card.', () => {}, new AbortController().signal);
    expect(boardSession().execute<BoardView>(writer, 'board_read').cards.find((card) => card.id === id)?.text).toBe('');
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[1]![0].input).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call_output', call_id: 'write-1', output: expect.stringContaining('coach_mode') })]));
  });

  it('writes through the same command layer when Draft for me is on, and undoes the run', async () => {
    const { id } = boardSession().execute<{ id: string }>(writer, 'card_create', { type: 'form.hook' });
    boardSession().execute(writer, 'settings_set_draft_for_me', { enabled: true });
    state.send.mockResolvedValueOnce(completed([{ type: 'function_call', namespace: 'writers_board', call_id: 'write-2', name: 'card_set_text', arguments: JSON.stringify({ id, text: 'Generated opening.' }) }]))
      .mockResolvedValueOnce(completed(answer('Added an opening.')));
    await startAgent().ask('Write an opening.', () => {}, new AbortController().signal);
    expect(boardSession().execute<BoardView>(writer, 'board_read').cards.find((card) => card.id === id)?.text).toBe('Generated opening.');
    boardSession().undo(BUILT_IN_AGENT.id);
    expect(boardSession().execute<BoardView>(writer, 'board_read').cards.find((card) => card.id === id)?.text).toBe('');
  });
});
