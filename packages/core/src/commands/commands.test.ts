// Phase 0 gate: tests create, link and undo cards and text.
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createBoard, type Actor } from '../doc/model.ts';
import { encodeBoard, loadBoard } from '../doc/persist.ts';
import type { BoardView } from './board-commands.ts';
import { CommandError } from './define.ts';
import { BoardSession } from './session.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const agent: Actor = { kind: 'agent', id: 'agent:grok', name: 'Grok Bot' };

let session: BoardSession;
const read = () => session.execute<BoardView>(writer, 'board_read');
const card = (id: string) => read().cards.find((c) => c.id === id);

function expectError(fn: () => unknown, code: CommandError['code']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

beforeEach(() => {
  let n = 0;
  session = new BoardSession(createBoard({ title: 'Test board', newId: () => `starter-${++n}` }), { newId: () => `id-${++n}` });
});

describe('a new board', () => {
  it('opens with the six-card opening hand in its lanes', () => {
    const board = read();
    expect(board.cards.map((c) => c.name)).toEqual(['Character', 'Setting', 'Object', 'Material', 'Tension', 'Spirit']);
    expect(new Set(board.cards.filter((c) => c.category === 'NOUNS').map((c) => c.x)).size).toBe(1);
    expect(board.surface).toBe('whiteboard');
    expect(board.draftForMe).toBe(false);
  });

  it('keeps setup out of everyone\'s undo history', () => {
    expect(session.undo(writer.id)).toBe(false);
    expect(read().cards).toHaveLength(6);
  });
});

describe('cards', () => {
  it('creates, edits, moves and undoes step by step', () => {
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'form.hook', orientation: 'portrait' });
    const placed = card(id)!;
    session.execute(writer, 'card_set_text', { id, text: 'Open on the burnt toast.' });
    session.execute(writer, 'card_move', { id, x: 900, y: 40, rotation: -3 });

    expect(card(id)).toMatchObject({ name: 'Hook', orientation: 'portrait', text: 'Open on the burnt toast.', x: 900, rotation: -3 });

    session.undo(writer.id);
    expect(card(id)).toMatchObject({ text: 'Open on the burnt toast.', x: placed.x, y: placed.y, rotation: 0 });
    session.undo(writer.id);
    expect(card(id)?.text).toBe('');
    session.undo(writer.id);
    expect(card(id)).toBeUndefined();

    session.redo(writer.id);
    expect(card(id)?.name).toBe('Hook');
  });

  it('stacks new cards under the last card in their lane', () => {
    const material = read().cards.find((c) => c.name === 'Material')!;
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'idea.microcosm' });
    const added = card(id)!;
    expect(added.x).toBe(material.x);
    expect(added.y).toBeGreaterThan(Math.max(...read().cards.filter((c) => c.category === 'IDEA' && c.id !== id).map((c) => c.y)));
  });

  it('switches portrait and landscape', () => {
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'voice.motif' });
    expect(card(id)?.orientation).toBe('landscape');
    session.execute(writer, 'card_update', { id, orientation: 'portrait', size: '4x6' });
    expect(card(id)).toMatchObject({ orientation: 'portrait', size: '4x6' });
  });

  it('refuses card types outside the framework and bad input', () => {
    expectError(() => session.execute(writer, 'card_create', { type: 'idea.plot' }), 'invalid_input');
    expectError(() => session.execute(writer, 'card_move', { id: 'nope', x: 1, y: 1 }), 'not_found');
    expectError(() => session.execute(writer, 'card_update', { id: 'x' }), 'invalid_input');
    expectError(() => session.execute(writer, 'no_such_command'), 'unknown_command');
  });

  it('removes a card with its links, and undo brings both back', () => {
    session.execute(writer, 'manuscript_insert', { index: 0, text: 'The kitchen smelled of smoke.' });
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.setting' });
    session.execute(writer, 'link_create', { cardId: id, target: { kind: 'manuscript' }, quote: 'smelled of smoke' });
    session.execute(writer, 'card_delete', { id });
    expect(card(id)).toBeUndefined();
    session.undo(writer.id);
    expect(card(id)?.links[0]?.quote).toBe('smelled of smoke');
  });
});

describe('quote links', () => {
  it('follow the quoted words while the draft around them changes', () => {
    session.execute(writer, 'manuscript_insert', { index: 0, text: 'My grandmother kept a chipped blue mug.' });
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.object' });
    session.execute(writer, 'link_create', { cardId: id, target: { kind: 'manuscript' }, quote: 'chipped blue mug' });

    session.execute(writer, 'manuscript_insert', { index: 0, text: 'Every winter, ' });
    session.execute(writer, 'manuscript_insert', { index: read().manuscript.length - 1, text: ' by the stove' });
    expect(read().manuscript).toBe('Every winter, My grandmother kept a chipped blue mug by the stove.');
    expect(card(id)?.links[0]).toMatchObject({ status: 'intact', current: 'chipped blue mug' });

    const at = read().manuscript.indexOf('blue');
    session.execute(writer, 'manuscript_delete', { index: at, length: 'blue '.length });
    expect(card(id)?.links[0]).toMatchObject({ status: 'edited', current: 'chipped mug' });

    const gone = read().manuscript.indexOf('chipped mug');
    session.execute(writer, 'manuscript_delete', { index: gone, length: 'chipped mug'.length });
    expect(card(id)?.links[0]?.status).toBe('gone');

    session.undo(writer.id);
    expect(card(id)?.links[0]).toMatchObject({ status: 'edited', current: 'chipped mug' });
  });

  it('accept only verbatim quotes from a source (Reverse Engineer)', () => {
    const { id: sourceId } = session.execute<{ id: string }>(agent, 'source_add', {
      title: 'Consider the Mug',
      author: 'A. Writer',
      text: 'The mug was blue. The mug was cracked. Nobody threw it away.',
    });
    expectError(
      () => session.execute(agent, 'card_create_from_quote', { type: 'nouns.symbol', sourceId, quote: 'The cup was blue.' }),
      'quote_not_found',
    );
    expectError(
      () => session.execute(agent, 'card_create_from_quote', { type: 'voice.repetition', sourceId, quote: 'The mug was' }),
      'quote_ambiguous',
    );
    const { cardId } = session.execute<{ cardId: string }>(agent, 'card_create_from_quote', {
      type: 'voice.repetition',
      sourceId,
      quote: 'The mug was',
      occurrence: 2,
      annotation: 'Repeats the opening words to build a rhythm.',
    });
    expect(card(cardId)).toMatchObject({
      name: 'Repetition',
      text: '',
      annotation: 'Repeats the opening words to build a rhythm.',
      createdBy: agent.id,
    });
    expect(card(cardId)?.links[0]).toMatchObject({ target: { kind: 'source', sourceId }, status: 'intact', quote: 'The mug was' });
  });
});

describe('coach mode', () => {
  it('stops agents from writing the writer\'s words', () => {
    const { id } = session.execute<{ id: string }>(agent, 'card_create', { type: 'idea.thesis' });
    expectError(() => session.execute(agent, 'card_set_text', { id, text: 'Ghost-written thesis' }), 'coach_mode');
    expectError(() => session.execute(agent, 'card_create', { type: 'idea.thesis', text: 'Ghost' }), 'coach_mode');
    expectError(() => session.execute(agent, 'manuscript_insert', { index: 0, text: 'Ghost' }), 'coach_mode');
    session.execute(agent, 'card_annotate', { id, annotation: 'Is this concrete, contextual and catalytic?' });
    expect(card(id)).toMatchObject({ text: '', annotation: 'Is this concrete, contextual and catalytic?' });
  });

  it('lets agents draft only after the writer turns on Draft for me, which agents cannot do', () => {
    expectError(() => session.execute(agent, 'settings_set_draft_for_me', { enabled: true }), 'human_only');
    session.execute(writer, 'settings_set_draft_for_me', { enabled: true });
    session.execute(agent, 'manuscript_insert', { index: 0, text: 'A first line.' });
    expect(read().manuscript).toBe('A first line.');
  });
});

describe('agent modes', () => {
  it('lets agents only read in Solo, and only the writer sets the mode', () => {
    expect(read().agentMode).toBe('together');
    expectError(() => session.execute(agent, 'settings_set_agent_mode', { mode: 'autopilot' }), 'human_only');
    session.execute(writer, 'settings_set_agent_mode', { mode: 'solo' });
    expect(session.execute<BoardView>(agent, 'board_read').agentMode).toBe('solo');
    expectError(() => session.execute(agent, 'card_create', { type: 'form.hook' }), 'solo_mode');
    expectError(() => session.execute(agent, 'note_create', { x: 0, y: 0 }), 'solo_mode');
    session.execute(writer, 'card_create', { type: 'form.hook' });
    session.execute(writer, 'settings_set_agent_mode', { mode: 'autopilot' });
    session.execute(agent, 'card_create', { type: 'form.frame' });
  });
});

describe('undo by actor', () => {
  it('undoes a whole agent run without touching the writer\'s work', () => {
    session.beginRun(agent);
    const a = session.execute<{ id: string }>(agent, 'card_create', { type: 'form.finale' });
    session.execute(writer, 'manuscript_insert', { index: 0, text: 'Mine.' });
    const b = session.execute<{ id: string }>(agent, 'card_create', { type: 'form.frame' });
    session.execute(agent, 'card_move', { id: a.id, x: 10, y: 10 });
    session.endRun(agent);

    expect(session.undo(agent.id)).toBe(true);
    expect(card(a.id)).toBeUndefined();
    expect(card(b.id)).toBeUndefined();
    expect(read().manuscript).toBe('Mine.');
    expect(session.canUndo(agent.id)).toBe(false);

    session.undo(writer.id);
    expect(read().manuscript).toBe('');
  });

  it('keeps the writer\'s undo away from agent changes', () => {
    const mine = session.execute<{ id: string }>(writer, 'card_create', { type: 'voice.tone' });
    const theirs = session.execute<{ id: string }>(agent, 'card_create', { type: 'voice.subtext' });
    session.undo(writer.id);
    expect(card(mine.id)).toBeUndefined();
    expect(card(theirs.id)).toBeDefined();
  });
});

describe('collaboration and saving', () => {
  it('merges a writer and an agent editing separate copies at the same time', () => {
    const doc = session.doc;
    const replica = new Y.Doc();
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    const agentSession = new BoardSession(replica, { newId: () => 'agent-card' });

    session.execute(writer, 'manuscript_insert', { index: 0, text: 'Writer line.' });
    agentSession.execute(agent, 'card_create', { type: 'form.hook' });

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(replica));
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    expect(read().cards.some((c) => c.id === 'agent-card')).toBe(true);
    expect(agentSession.execute<BoardView>(agent, 'board_read').manuscript).toBe('Writer line.');
  });

  it('saves and loads a board byte for byte', () => {
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.weather' });
    session.execute(writer, 'card_set_text', { id, text: 'Sleet against the window.' });
    const reloaded = new BoardSession(loadBoard(encodeBoard(session.doc)));
    expect(reloaded.execute<BoardView>(writer, 'board_read')).toEqual(read());
  });

  it('refuses boards from an unknown schema version', () => {
    const doc = createBoard({ starterCards: false });
    doc.getMap('meta').set('schemaVersion', 99);
    expect(() => loadBoard(encodeBoard(doc))).toThrow(/Unsupported board version 99/);
  });
});

describe('agent tools', () => {
  it('describes every command as a labeled tool with a JSON schema', () => {
    const tools = session.tools();
    expect(tools.map((t) => t.name)).toContain('card_create_from_quote');
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.board_read?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(byName.card_delete?.annotations.destructiveHint).toBe(true);
    expect(byName.card_delete?._meta['writers-board/class']).toBe('Sensitive write');
    expect(byName.card_move?._meta['writers-board/class']).toBe('Write');
    expect(byName.settings_set_draft_for_me?._meta['writers-board/humanOnly']).toBe(true);
  });
});

describe('drawing three cards', () => {
  const columnOf = (type: string) => type.split('.')[0]!.toUpperCase();
  const draw = (input: Record<string, number> = {}) =>
    session.execute<{ cards: { id: string; type: string; question: string }[]; prompt: string; returned: number }>(writer, 'cards_draw', input);

  it('deals one Nouns card and two from two other columns, none already on the board', () => {
    for (let round = 0; round < 20; round++) {
      const before = new Set(read().cards.map((c) => c.type));
      const { cards } = draw({ x: 2000, y: 600 });
      expect(cards).toHaveLength(3);
      const columns = cards.map((c) => columnOf(c.type));
      expect(columns[0]).toBe('NOUNS');
      expect(new Set(columns).size).toBe(3);
      for (const c of cards) expect(before.has(c.type)).toBe(false);
      // Write on them so the next round keeps them and draws new ones.
      for (const c of cards) session.execute(writer, 'card_set_text', { id: c.id, text: 'kept' });
      if (read().cards.filter((c) => c.category === 'NOUNS').length === 12) break;
    }
  });

  it('lays the hand out in a row centered on the given point, as one undoable step', () => {
    const { cards, prompt } = draw({ x: 2000, y: 600 });
    const placed = cards.map((c) => card(c.id)!);
    expect(placed[0]!.x).toBeLessThan(placed[1]!.x);
    expect(placed[1]!.x).toBeLessThan(placed[2]!.x);
    expect(placed.every((p) => p.y === placed[0]!.y)).toBe(true);
    expect(prompt.split('\n')).toHaveLength(3);
    expect(prompt).toContain(cards[0]!.question);
    session.undo(writer.id);
    expect(read().cards).toHaveLength(6);
  });

  it('takes back blank drawn cards on the next draw and keeps the ones with writing', () => {
    const first = draw();
    session.execute(writer, 'card_set_text', { id: first.cards[0]!.id, text: 'The kettle' });
    const second = draw();
    expect(second.returned).toBe(2);
    const ids = new Set(read().cards.map((c) => c.id));
    expect(ids.has(first.cards[0]!.id)).toBe(true);
    expect(ids.has(first.cards[1]!.id)).toBe(false);
    expect(ids.has(first.cards[2]!.id)).toBe(false);
    expect(read().cards).toHaveLength(6 + 1 + 3);
  });
});

describe('where a drawn hand lands', () => {
  it('moves to clear space instead of covering cards already there', () => {
    const material = read().cards.find((c) => c.name === 'Material')!;
    const { cards } = session.execute<{ cards: { id: string }[] }>(writer, 'cards_draw', { x: material.x + 100, y: material.y + 60 });
    const all = read().cards;
    const drawn = new Set(cards.map((c) => c.id));
    const rect = (c: (typeof all)[number]) => ({ x: c.x, y: c.y, w: c.orientation === 'landscape' ? 240 : 144, h: c.orientation === 'landscape' ? 144 : 240 });
    for (const d of all.filter((c) => drawn.has(c.id)).map(rect)) {
      for (const o of all.filter((c) => !drawn.has(c.id)).map(rect)) {
        expect(d.x < o.x + o.w && o.x < d.x + d.w && d.y < o.y + o.h && o.y < d.y + d.h).toBe(false);
      }
    }
  });
});

describe('palettes', () => {
  it('opens in Blossom and switches palette as one undoable step, keeping note colors as slots', () => {
    expect(read().palette).toBe('blossom');
    const note = session.execute<{ id: string }>(writer, 'note_create', { x: 0, y: 0, color: '#BBD0DC' }); // Signal's first note color
    expect(read().notes.find((n) => n.id === note.id)?.color).toBe('#E8A3B4'); // stored as slot 1
    session.execute(writer, 'board_set_palette', { palette: 'signal' });
    expect(read().palette).toBe('signal');
    session.undo(writer.id);
    expect(read().palette).toBe('blossom');
  });
});
