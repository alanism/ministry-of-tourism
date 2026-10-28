import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';
vi.mock('../ai/providers', () => ({ AiError: Error }));
vi.mock('../ai/settings', () => ({ aiSettings: () => ({ keys: {}, voice: { elevenAgentId: '' } }) }));
vi.mock('./board-context', () => ({ boardVoiceSource: () => { throw new Error('Supply a test source'); } }));
import { createVoiceContext, type VoiceSource } from './context';
import { elevenController, startElevenLive, type ElevenClientMessage } from './eleven-live';

afterEach(() => vi.useRealTimers());
function setup() {
  const actor = { kind: 'human' as const, id: 'writer', name: 'Writer' };
  const board = new BoardSession(createBoard({ starterCards: false }));
  const { id } = board.execute<{ id: string }>(actor, 'card_create', { type: 'nouns.character', text: 'Mara waits at the station.' });
  let notify = () => {}; const stop = vi.fn();
  const source: VoiceSource = { read: () => ({ board: board.execute<BoardView>(actor, 'board_read'), focus: { selectedId: id, editingId: null, mode: 'board', view: { x: 0, y: 0, zoom: 1, width: 900, height: 700 } } }), subscribe: listener => { notify = listener; return stop; } };
  const context = createVoiceContext(source, [{ role: 'user', text: 'A story about Mara.' }]);
  const sent: ElevenClientMessage[] = [];
  const handlers = { ask: vi.fn(async () => 'Added a coaching note.'), cancel: vi.fn(), onHeard: vi.fn(), onSaid: vi.fn(), onCorrected: vi.fn(), onStatus: vi.fn() };
  const audio = { play: vi.fn(), interrupt: vi.fn() };
  const controller = elevenController(event => sent.push(event), handlers, context, audio);
  const ready = () => controller.receive({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { user_input_audio_format: 'pcm_16000', agent_output_audio_format: 'pcm_44100' } });
  return { board, actor, id, context, sent, handlers, audio, controller, ready, notify: () => notify(), stop };
}

describe('ElevenLabs live context adapter', () => {
  it('requires its own key before microphone or network work', async () => {
    const test = setup();
    await expect(startElevenLive(test.handlers)).rejects.toThrow('ElevenLabs API key');
  });

  it('seeds selection/dialogue and sends quiet deduplicated context only after metadata', async () => {
    vi.useFakeTimers(); const test = setup();
    const initiation = test.controller.initiation();
    expect(initiation.type).toBe('conversation_initiation_client_data');
    expect(initiation.dynamic_variables?.board_context).toContain('Mara waits');
    expect(initiation.dynamic_variables?.board_context).toContain('A story about Mara.');
    test.controller.sendAudio('AAAA', 16000); expect(test.sent).toEqual([]);
    test.ready(); const count = test.sent.length;
    test.notify(); await vi.advanceTimersByTimeAsync(300); expect(test.sent).toHaveLength(count);
    test.board.execute(test.actor, 'card_set_text', { id: test.id, text: 'The last train.' });
    test.notify(); test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent.at(-1)).toMatchObject({ type: 'contextual_update' });
    expect(test.sent.at(-1)?.text).toContain('The last train.');
    expect(test.sent.every(message => message.type !== 'user_message')).toBe(true);
    expect(JSON.stringify(test.sent)).not.toMatch(/data:image|inlineData/);
    test.controller.dispose(); test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.stop).toHaveBeenCalledOnce();
  });

  it('delegates exact selection and dialogue, deduplicates tool IDs and returns verified results', async () => {
    const test = setup(); test.ready();
    test.controller.receive({ type: 'agent_response', agent_response_event: { agent_response: 'Should I add a note?' } });
    test.controller.receive({ type: 'user_transcript', user_transcription_event: { user_transcript: 'Yes, this one.' } });
    const event = { type: 'client_tool_call', client_tool_call: { tool_call_id: 'one', tool_name: 'board_agent', parameters: { request: 'Add the note.' } } };
    test.controller.receive(event); test.controller.receive(event);
    await vi.waitFor(() => expect(test.handlers.ask).toHaveBeenCalledOnce());
    const [, snapshot] = test.handlers.ask.mock.calls[0] as unknown as [string, { selected: { id: string }; conversation: { text: string }[] }];
    expect(snapshot.selected.id).toBe(test.id);
    expect(snapshot.conversation.map(turn => turn.text)).toContain('Should I add a note?');
    expect(test.sent.at(-1)).toMatchObject({ type: 'client_tool_result', tool_call_id: 'one', is_error: false, result: 'Added a coaching note.' });
    test.controller.dispose();
  });

  it('plays negotiated PCM, responds to heartbeat, truncates interrupted dialogue and cancels late work', async () => {
    const test = setup(); test.ready();
    test.controller.receive({ type: 'audio', audio_event: { audio_base_64: 'AAAAAA==', event_id: 4 } });
    expect(test.audio.play).toHaveBeenCalledWith('AAAAAA==', 'audio/pcm;rate=44100');
    test.controller.receive({ type: 'ping', ping_event: { event_id: 7 } });
    expect(test.sent.at(-1)).toEqual({ type: 'pong', event_id: 7 });
    test.controller.receive({ type: 'agent_response', agent_response_event: { agent_response: 'Should I add a note or rewrite it?' } });
    test.controller.receive({ type: 'agent_response_correction', agent_response_correction_event: { original_agent_response: 'Should I add a note or rewrite it?', corrected_agent_response: 'Should I add a note?' } });
    expect(test.context.history().at(-1)?.text).toBe('Should I add a note?');
    expect(test.handlers.onCorrected).toHaveBeenCalledWith('Should I add a note or rewrite it?', 'Should I add a note?');
    let finish!: (value: string) => void;
    test.handlers.ask.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    test.controller.receive({ type: 'client_tool_call', client_tool_call: { tool_call_id: 'cancel', tool_name: 'board_agent', parameters: { request: 'Discuss.' } } });
    await Promise.resolve();
    test.controller.receive({ type: 'interruption', interruption_event: { event_id: 4 } });
    expect(test.audio.interrupt).toHaveBeenCalledOnce(); expect(test.handlers.cancel).toHaveBeenCalled();
    test.controller.receive({ type: 'audio', audio_event: { audio_base_64: 'AAAAAA==', event_id: 4 } });
    expect(test.audio.play).toHaveBeenCalledOnce();
    finish('Late result'); await Promise.resolve(); await Promise.resolve();
    expect(test.sent.some(message => message.result === 'Late result')).toBe(false);
    test.controller.dispose();
  });

  it('rejects unknown tools, errors and incompatible capture formats without fallback', async () => {
    const test = setup();
    expect(() => test.controller.receive({ type: 'client_error', client_error: { message: 'Invalid agent.' } })).toThrow('Invalid agent.');
    expect(() => test.controller.receive({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { user_input_audio_format: 'ulaw_8000', agent_output_audio_format: 'pcm_16000' } })).toThrow('pcm_16000');
    test.ready();
    test.controller.receive({ type: 'client_tool_call', client_tool_call: { tool_call_id: 'bad', tool_name: 'open_url', parameters: { request: 'Go away.' } } });
    await vi.waitFor(() => expect(test.sent.at(-1)).toMatchObject({ type: 'client_tool_result', tool_call_id: 'bad', is_error: true }));
    expect(test.handlers.ask).not.toHaveBeenCalled();
    test.controller.dispose();
  });
});
