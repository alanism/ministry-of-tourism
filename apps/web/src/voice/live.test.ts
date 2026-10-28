import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';
vi.mock('../ai/providers', () => ({ AiError: Error }));
vi.mock('../ai/settings', () => ({ aiSettings: () => ({ keys: {}, voice: { liveModel: 'gpt-live-1' } }) }));
vi.mock('./board-context', () => ({ boardVoiceSource: () => { throw new Error('An explicit context is required in this test'); } }));
import { createVoiceContext, type VoiceSource } from './context';
import { liveController, type LiveChannel } from './live';

afterEach(() => vi.useRealTimers());
function setup() {
  const session = new BoardSession(createBoard({ starterCards: false, title: 'Voice test' }));
  const actor = { kind: 'human' as const, id: 'writer', name: 'Writer' };
  const { id } = session.execute<{ id: string }>(actor, 'card_create', { type: 'nouns.character', text: 'The first scene.' });
  let notify = () => {};
  const unsubscribe = vi.fn();
  const source: VoiceSource = { read: () => ({ board: session.execute<BoardView>(actor, 'board_read'), focus: { selectedId: id, editingId: null, mode: 'board', view: { x: 0, y: 0, zoom: 1, width: 800, height: 600 } } }), subscribe: (listener: () => void) => { notify = listener; return unsubscribe; } };
  const context = createVoiceContext(source);
  const sent: Record<string, unknown>[] = [];
  const channel: LiveChannel = { send: data => sent.push(JSON.parse(data)), onmessage: null };
  const handlers = { ask: vi.fn(async () => 'Verified board result.'), onHeard: vi.fn(), onSaid: vi.fn(), onStatus: vi.fn() };
  const controller = liveController(channel, handlers, context);
  const event = (value: Record<string, unknown>) => channel.onmessage?.({ data: JSON.stringify(value) });
  return { session, actor, id, source, context, sent, handlers, controller, event, notify: () => notify(), unsubscribe };
}

describe('GPT-Live context adapter', () => {
  it('sends quiet initial context after startup, coalesces edits and stops updates on close', async () => {
    vi.useFakeTimers(); const test = setup();
    expect(test.sent).toEqual([]);
    test.event({ type: 'session.started' });
    expect(test.sent.length).toBeGreaterThan(0);
    expect(test.sent.every(event => event.type === 'session.thinking.append' && event.delegation_id === null)).toBe(true);
    expect(test.sent.map(event => event.content).join('')).toContain('The first scene.');
    const before = test.sent.length;
    test.notify(); test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent).toHaveLength(before);
    test.session.execute(test.actor, 'card_set_text', { id: test.id, text: 'Changed while talking.' });
    test.notify(); test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent.slice(before).map(event => event.content).join('')).toContain('Changed while talking.');
    expect(test.sent.every(event => new TextEncoder().encode(String(event.content)).length <= 480)).toBe(true);
    test.controller.dispose(); const closedCount = test.sent.length;
    test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent).toHaveLength(closedCount); expect(test.unsubscribe).toHaveBeenCalledOnce();
  });

  it('passes the voice-only question, short reply and selected card to the board agent', async () => {
    const test = setup();
    test.event({ type: 'session.started' });
    test.event({ type: 'session.input_transcript.delta', delta: 'Help with this scene.' });
    test.event({ type: 'session.output_transcript.delta', delta: 'Shall we examine the obstacle?' });
    test.event({ type: 'session.input_transcript.delta', delta: 'Yes, this one.' });
    test.event({ type: 'session.delegation.created', delegation: { id: 'delegation-1' } });
    await vi.waitFor(() => expect(test.handlers.ask).toHaveBeenCalledOnce());
    expect(test.handlers.ask.mock.calls[0]).toEqual(['Yes, this one.', expect.objectContaining({ selected: expect.objectContaining({ id: test.id }), conversation: [
      { role: 'user', text: 'Help with this scene.' }, { role: 'assistant', text: 'Shall we examine the obstacle?' }, { role: 'user', text: 'Yes, this one.' },
    ] })]);
    expect(test.sent.some(event => event.type === 'session.commentary.append' && event.delegation_id === 'delegation-1')).toBe(true);
    test.controller.dispose();
  });

  it('does not execute duplicate delegations or queued requests after disposal', async () => {
    const test = setup(); test.event({ type: 'session.started' });
    test.event({ type: 'session.input_transcript.delta', delta: 'Move this card.' });
    test.event({ type: 'session.delegation.created', delegation: { id: 'same' } });
    test.event({ type: 'session.delegation.created', delegation: { id: 'same' } });
    test.controller.dispose(); await Promise.resolve();
    expect(test.handlers.ask).not.toHaveBeenCalled();
  });

  it('bounds multilingual updates by bytes and preserves a deselection', async () => {
    vi.useFakeTimers(); const test = setup();
    test.session.execute(test.actor, 'card_set_text', { id: test.id, text: 'การเดินทางกลับบ้าน。帰り道。'.repeat(80) });
    test.event({ type: 'session.started' });
    expect(test.sent.every(event => new TextEncoder().encode(String(event.content)).length <= 480)).toBe(true);
    test.source.read = () => ({ board: test.session.execute<BoardView>(test.actor, 'board_read'), focus: { selectedId: null, editingId: null, mode: 'board', view: { x: 0, y: 0, zoom: 1, width: 800, height: 600 } } });
    test.notify(); await vi.advanceTimersByTimeAsync(300);
    expect(test.sent.map(event => event.content).join('')).toContain('"selected":null');
    test.controller.dispose();
  });
});
