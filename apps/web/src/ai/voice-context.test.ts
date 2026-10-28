import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';
const state = vi.hoisted(() => ({ fetch: vi.fn(), inspect: vi.fn() }));
vi.mock('./settings', () => ({ aiSettings: () => ({ keys: { openai: 'test-key' }, jobs: { agent: { provider: 'openai', model: 'test-vision-model' } } }), PROVIDERS: { openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' } } }));
vi.mock('../state/board', () => {
  const session = new BoardSession(createBoard({ starterCards: false }));
  return { boardSession: () => session, latestBoard: () => session.execute({ kind: 'human', id: 'writer', name: 'Writer' }, 'board_read') };
});
vi.mock('../voice/board-images', () => ({ readBoardImage: state.inspect }));
import { startAgent } from './agent';
import { createVoiceContext } from '../voice/context';
import { boardSession } from '../state/board';
const writer = { kind: 'human' as const, id: 'writer', name: 'Writer' };
const reply = (content: string, tool_calls?: unknown[]) => Response.json({ choices: [{ message: { role: 'assistant', content, ...(tool_calls ? { tool_calls } : {}) } }] });
beforeEach(() => { vi.stubGlobal('window', {}); vi.stubGlobal('fetch', state.fetch); state.fetch.mockReset(); state.inspect.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('voice requests routed through the board agent', () => {
  it('supplies exact selection and prior spoken question without loading images', async () => {
    const { id } = boardSession().execute<{ id: string }>(writer, 'card_create', { type: 'idea.thesis', text: 'The town needs a library.' });
    const context = createVoiceContext({ read: () => ({ board: boardSession().execute<BoardView>(writer, 'board_read'), focus: { selectedId: id, editingId: null, mode: 'board', view: { x: 0, y: 0, zoom: 1, width: 800, height: 600 } } }), subscribe: () => () => {} });
    context.record({ role: 'assistant', text: 'Should we discuss this thesis?' });
    state.fetch.mockResolvedValueOnce(reply('What would change for the town?'));
    await startAgent().ask('Yes, this card.', () => {}, new AbortController().signal, context.snapshot());
    const request = JSON.parse(state.fetch.mock.calls[0]![1].body);
    const sent = JSON.parse(request.messages.at(-1).content);
    expect(sent.request).toBe('Yes, this card.');
    expect(sent.voiceContext.selected).toMatchObject({ id, text: 'The town needs a library.' });
    expect(sent.voiceContext.conversation[0].text).toBe('Should we discuss this thesis?');
    expect(JSON.stringify(request)).not.toContain('data:image'); expect(state.inspect).not.toHaveBeenCalled();
  });

  it('loads pixels only after an explicit image-inspection tool call', async () => {
    state.inspect.mockResolvedValueOnce({ caption: 'A red suitcase', dataUrl: 'data:image/jpeg;base64,aW1hZ2U=' });
    state.fetch.mockResolvedValueOnce(reply('', [{ id: 'inspect', type: 'function', function: { name: 'board_inspect_image', arguments: '{"id":"picture-1"}' } }]))
      .mockResolvedValueOnce(reply('The red suitcase could be a useful motif.'));
    await startAgent().ask('Look at picture-1 and describe it.', () => {}, new AbortController().signal);
    expect(state.inspect).toHaveBeenCalledWith('picture-1', expect.any(AbortSignal));
    const first = JSON.parse(state.fetch.mock.calls[0]![1].body);
    const second = JSON.parse(state.fetch.mock.calls[1]![1].body);
    expect(JSON.stringify(first)).not.toContain('data:image');
    expect(second.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', content: expect.arrayContaining([{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=' } }]) })]));
  });
});
