import { describe, expect, it } from 'vitest';
import { BoardSession, createBoard, type BoardView } from '@writers-board/core';
import { createVoiceContext, type VoiceFocus } from './context';

const writer = { kind: 'human' as const, id: 'writer', name: 'Writer' };
function setup() {
  const session = new BoardSession(createBoard({ starterCards: false, title: 'A train journey' }));
  const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.character', text: 'Mara needs to reach home.' });
  let board = session.execute<BoardView>(writer, 'board_read');
  let focus: VoiceFocus = { selectedId: id, editingId: null, mode: 'board', view: { x: 100, y: 200, zoom: 1, width: 1200, height: 800 } };
  const context = createVoiceContext({ read: () => ({ board, focus }), subscribe: () => () => {} });
  return { session, id, context, refresh: () => { board = session.execute(writer, 'board_read'); }, focus: (patch: Partial<VoiceFocus>) => { focus = { ...focus, ...patch }; } };
}

describe('shared voice context', () => {
  it('keeps corrected or removed spoken replies within the conversation byte limit', () => {
    const { context } = setup();
    for (let i = 0; i < 20; i++) context.record({ role: 'user', text: 'x'.repeat(700) });
    context.record({ role: 'assistant', text: 'Short reply.' });
    context.correctAssistant('Short reply.', 'y'.repeat(1200));
    expect(new TextEncoder().encode(JSON.stringify(context.history())).length).toBeLessThanOrEqual(6000);
    context.correctAssistant('y'.repeat(1200), '');
    expect(context.history().some(turn => turn.role === 'assistant')).toBe(false);
  });

  it('identifies the selected card, exact text and linked context without image pixels', () => {
    const test = setup();
    const other = test.session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.desire', text: 'To see her brother.' });
    test.session.execute(writer, 'connection_create', { from: test.id, to: other.id }); test.refresh();
    const snapshot = test.context.snapshot();
    expect(snapshot.selected).toMatchObject({ id: test.id, kind: 'card', text: 'Mara needs to reach home.' });
    expect(snapshot.related).toEqual(expect.arrayContaining([expect.objectContaining({ id: other.id, text: 'To see her brother.' })]));
    expect(snapshot.board.title).toBe('A train journey');
    expect(snapshot.viewport.zoom).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain('data:image');
  });

  it('reports edits, removal and cleared selection, including edits with unchanged counts', () => {
    const test = setup(); const first = test.context.snapshot();
    test.session.execute(writer, 'card_set_text', { id: test.id, text: 'Mara misses the train.' }); test.refresh();
    const edited = test.context.snapshot();
    expect(edited.revision).toBeGreaterThan(first.revision);
    expect(edited.changes).toEqual(expect.arrayContaining([expect.objectContaining({ id: test.id, action: 'updated' })]));
    expect(edited.selected?.text).toBe('Mara misses the train.');
    test.session.execute(writer, 'card_delete', { id: test.id }); test.refresh(); test.focus({ selectedId: null });
    const removed = test.context.snapshot();
    expect(removed.selected).toBeNull();
    expect(removed.changes).toEqual(expect.arrayContaining([expect.objectContaining({ id: test.id, action: 'removed' })]));
    expect(test.context.snapshot().revision).toBe(removed.revision);
  });

  it('keeps an unsaved editor draft separate from stored card text and bounds conversation history', () => {
    const test = setup();
    test.focus({ editingId: test.id, draft: { id: test.id, text: 'A new thought', selectedText: 'thought' } });
    for (let i = 0; i < 40; i++) test.context.record({ role: i % 2 ? 'assistant' : 'user', text: `Turn ${i}` });
    const snapshot = test.context.snapshot();
    expect(snapshot.editing).toMatchObject({ id: test.id, text: 'A new thought', selectedText: 'thought' });
    expect(snapshot.selected?.text).toBe('Mara needs to reach home.');
    expect(snapshot.conversation.length).toBeLessThanOrEqual(16);
    expect(snapshot.conversation.at(-1)?.text).toBe('Turn 39');
    expect(test.session.execute<BoardView>(writer, 'board_read').cards[0]?.text).toBe('Mara needs to reach home.');
  });
});
