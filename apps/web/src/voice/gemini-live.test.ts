import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';
vi.mock('../ai/providers', () => ({ AiError: Error }));
vi.mock('../ai/settings', () => ({ aiSettings: () => ({ keys: { openai: 'test-openai-key' }, voice: {} }) }));
vi.mock('./board-context', () => ({ boardVoiceSource: () => { throw new Error('Supply a test source'); } }));
import { createVoiceContext, type VoiceSource } from './context';
import { geminiController, startGeminiLive, type GeminiClientMessage } from './gemini-live';

afterEach(() => vi.useRealTimers());
function setup() {
  const actor = { kind: 'human' as const, id: 'writer', name: 'Writer' };
  const board = new BoardSession(createBoard({ starterCards: false, title: 'Gemini board' }));
  const { id } = board.execute<{ id: string }>(actor, 'card_create', { type: 'nouns.character', text: 'Mara waits at the station.' });
  let notify = () => {};
  const stop = vi.fn();
  const source: VoiceSource = { read: () => ({ board: board.execute<BoardView>(actor, 'board_read'), focus: { selectedId: id, editingId: null, mode: 'board', view: { x: 0, y: 0, zoom: 1, width: 900, height: 700 } } }), subscribe: listener => { notify = listener; return stop; } };
  const context = createVoiceContext(source, [{ role: 'user', text: 'I am planning a short story.' }]);
  const sent: GeminiClientMessage[] = [];
  const handlers = { ask: vi.fn(async () => 'Added a coaching note.'), cancel: vi.fn(), onHeard: vi.fn(), onSaid: vi.fn(), onStatus: vi.fn() };
  const audio = { play: vi.fn(), interrupt: vi.fn() };
  const controller = geminiController(event => sent.push(event), handlers, context, audio);
  return { board, actor, id, source, context, sent, handlers, audio, controller, event: controller.receive, notify: () => notify(), stop };
}

describe('Gemini Live context adapter', () => {
  it('requires a Google key even when an OpenAI key exists, before opening audio', async () => {
    const test = setup();
    await expect(startGeminiLive(test.handlers)).rejects.toThrow('Add your Google API key');
    expect(test.handlers.onStatus).not.toHaveBeenCalled();
  });

  it('reports setup errors immediately and does not send microphone audio before setup', () => {
    const test = setup();
    test.controller.sendAudio('AAAA', 16000);
    expect(test.sent).toEqual([]);
    expect(() => test.event({ error: { message: 'Model access denied.' } })).toThrow('Model access denied.');
    test.controller.dispose();
  });

  it('seeds history only after setup and reuses quiet coalesced board updates without image input', async () => {
    vi.useFakeTimers(); const test = setup();
    expect(test.sent).toEqual([]);
    test.event({ setupComplete: {} });
    expect(test.sent[0]?.clientContent?.turnComplete).toBe(true);
    expect(JSON.stringify(test.sent[0])).toContain('I am planning a short story.');
    expect(JSON.stringify(test.sent[0])).toContain('Mara waits at the station.');
    const count = test.sent.length;
    test.notify(); await vi.advanceTimersByTimeAsync(300); expect(test.sent).toHaveLength(count);
    test.board.execute(test.actor, 'card_set_text', { id: test.id, text: 'A different destination.' });
    test.notify(); test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent.at(-1)?.clientContent?.turnComplete).toBe(false);
    expect(JSON.stringify(test.sent.at(-1))).toContain('A different destination.');
    expect(JSON.stringify(test.sent)).not.toMatch(/inlineData|data:image|video/);
    test.controller.dispose(); expect(test.stop).toHaveBeenCalledOnce();
  });

  it('keeps context updates from interrupting model speech, plays audio and handles barge-in', async () => {
    vi.useFakeTimers(); const test = setup(); test.event({ setupComplete: {} });
    test.event({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAAAA==' } }] }, outputTranscription: { text: 'What does Mara need?' } } });
    expect(test.audio.play).toHaveBeenCalledWith('AAAAAA==', 'audio/pcm;rate=24000');
    const count = test.sent.length;
    test.board.execute(test.actor, 'card_set_text', { id: test.id, text: 'Changed while the model speaks.' }); test.notify();
    await vi.advanceTimersByTimeAsync(300); expect(test.sent).toHaveLength(count);
    test.event({ serverContent: { interrupted: true, turnComplete: true } });
    expect(test.audio.interrupt).toHaveBeenCalledOnce();
    expect(JSON.stringify(test.sent.at(-1))).toContain('Changed while the model speaks.');
    expect(test.handlers.onSaid).toHaveBeenCalledWith('What does Mara need?');
    test.controller.dispose();
  });

  it('delegates exact selection and dialogue to the same board agent and returns matching tool results', async () => {
    const test = setup(); test.event({ setupComplete: {} });
    test.event({ serverContent: { inputTranscription: { text: 'Help with this card.' }, turnComplete: true } });
    test.event({ serverContent: { outputTranscription: { text: 'Should I add a coaching note?' }, turnComplete: true } });
    test.event({ serverContent: { inputTranscription: { text: 'Yes, this one.' } } });
    test.event({ toolCall: { functionCalls: [{ id: 'board-1', name: 'board_agent', args: { request: 'Add a coaching note to the selected card.' } }] } });
    await vi.waitFor(() => expect(test.handlers.ask).toHaveBeenCalledOnce());
    const [request, snapshot] = test.handlers.ask.mock.calls[0] as unknown as [string, { selected: { id: string }; conversation: { text: string }[] }];
    expect(request).toBe('Add a coaching note to the selected card.'); expect(snapshot.selected.id).toBe(test.id);
    expect(snapshot.conversation.map(turn => turn.text)).toEqual(expect.arrayContaining(['Should I add a coaching note?', 'Yes, this one.']));
    expect(test.sent.at(-1)?.toolResponse?.functionResponses[0]).toMatchObject({ id: 'board-1', name: 'board_agent', response: { result: 'Added a coaching note.' } });
    test.event({ toolCall: { functionCalls: [{ id: 'board-1', name: 'board_agent', args: { request: 'Duplicate.' } }] } });
    await Promise.resolve(); expect(test.handlers.ask).toHaveBeenCalledOnce(); test.controller.dispose();
  });

  it('drops cancelled queued work and never publishes a late result after disposal', async () => {
    const test = setup(); test.event({ setupComplete: {} });
    test.event({ toolCall: { functionCalls: [{ id: 'cancel-me', name: 'board_agent', args: { request: 'Move a card.' } }] } });
    test.event({ toolCallCancellation: { ids: ['cancel-me'] } });
    await Promise.resolve(); expect(test.handlers.ask).not.toHaveBeenCalled();
    const count = test.sent.length; test.controller.dispose();
    test.event({ setupComplete: {} }); test.notify(); expect(test.sent).toHaveLength(count);
  });

  it('keeps board changes from interrupting a pending delegated tool call', async () => {
    vi.useFakeTimers(); const test = setup(); test.event({ setupComplete: {} });
    let finish!: (value: string) => void;
    test.handlers.ask.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    test.event({ toolCall: { functionCalls: [{ id: 'pending', name: 'board_agent', args: { request: 'Discuss the selection.' } }] } });
    await Promise.resolve();
    const count = test.sent.length;
    test.board.execute(test.actor, 'card_set_text', { id: test.id, text: 'Edited during delegation.' }); test.notify();
    await vi.advanceTimersByTimeAsync(300); expect(test.sent).toHaveLength(count);
    finish('Discussed.'); await Promise.resolve(); await Promise.resolve();
    expect(test.sent.at(-1)?.toolResponse?.functionResponses[0]?.id).toBe('pending');
    test.event({ serverContent: { turnComplete: true } });
    expect(JSON.stringify(test.sent.at(-1))).toContain('Edited during delegation.');
    test.controller.dispose();
  });
});
