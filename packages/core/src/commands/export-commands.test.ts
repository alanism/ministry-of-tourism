import { describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import { loadBoard } from '../doc/persist.ts';
import { readBoardFiles, type BoardFile } from '../doc/board-file.ts';
import type { BoardView } from './board-commands.ts';
import { BoardSession } from './session.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const agent: Actor = { kind: 'agent', id: 'agent:dot', name: 'Dot' };

type Exported = { title: string; exportedAt: string; file?: BoardFile; markdown?: string; picturesNotIncluded: number };

function session() {
  let n = 0;
  const s = new BoardSession(createBoard({ starterCards: false, title: 'Kettle' }), { newId: () => `id-${++n}` });
  s.execute(writer, 'manuscript_insert', { index: 0, text: 'The kettle sang before dawn.' });
  const card = s.execute<{ id: string }>(writer, 'card_create', { type: 'idea.thesis' });
  s.execute(writer, 'card_set_text', { id: card.id, text: 'Gran never said sorry.' });
  s.execute(writer, 'note_create', { x: 0, y: 0, text: 'Ask about the mug' });
  return s;
}

describe('board_export', () => {
  it('gives an agent the full board file and a Markdown copy, and changes nothing', () => {
    const s = session();
    const before = JSON.stringify(s.execute<BoardView>(writer, 'board_read'));
    const out = s.execute<Exported>(agent, 'board_export');
    expect(JSON.stringify(s.execute<BoardView>(writer, 'board_read'))).toBe(before);
    expect(s.undo(agent.id)).toBe(false);

    expect(out.title).toBe('Kettle');
    expect(out.markdown).toContain('# Kettle');
    expect(out.markdown).toContain('The kettle sang before dawn.');
    expect(out.markdown).toContain('Gran never said sorry.');
    expect(out.markdown).toContain('- Ask about the mug');
    expect(out.picturesNotIncluded).toBe(0);

    // The file restores the board exactly, after a trip through JSON text.
    const [read] = readBoardFiles(JSON.parse(JSON.stringify(out.file)));
    const restored = new BoardSession(loadBoard(read!.update)).execute<BoardView>(writer, 'board_read');
    expect(restored.cards.map((c) => c.text)).toEqual(['Gran never said sorry.']);
    expect(restored.manuscript).toBe('The kettle sang before dawn.');
  });

  it('can give only the file or only the Markdown', () => {
    const s = session();
    const json = s.execute<Exported>(agent, 'board_export', { format: 'json' });
    expect(json.file).toBeDefined();
    expect(json.markdown).toBeUndefined();
    const md = s.execute<Exported>(agent, 'board_export', { format: 'markdown' });
    expect(md.markdown).toBeDefined();
    expect(md.file).toBeUndefined();
  });

  it('works in Solo mode, because it only reads', () => {
    const s = session();
    s.execute(writer, 'settings_set_agent_mode', { mode: 'solo' });
    expect(s.execute<Exported>(agent, 'board_export').title).toBe('Kettle');
  });

  it('says how many pictures are left out of the file', () => {
    const s = session();
    s.execute(writer, 'image_place', { blobId: 'a'.repeat(64), x: 0, y: 0, width: 200, height: 150 });
    const out = s.execute<Exported>(agent, 'board_export', { format: 'json' });
    expect(out.picturesNotIncluded).toBe(1);
    expect(out.file!.images).toEqual({});
  });

  it('is a read tool in the agent tool list', () => {
    const tool = session().tools().find((t) => t.name === 'board_export');
    expect(tool).toBeDefined();
  });
});
