import { describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import type { BoardView } from '../commands/board-commands.ts';
import { BoardSession } from '../commands/session.ts';
import { exportMarkdown } from './markdown.ts';
import { buildPdf, jpegSize, manuscriptPages, MANUSCRIPT_COLUMNS, MANUSCRIPT_LINES, wrapManuscript } from './pdf.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };

function sampleBoard(): BoardView {
  let n = 0;
  const session = new BoardSession(createBoard({ starterCards: false, title: 'Kettle' }), { newId: () => `id-${++n}` });
  session.execute(writer, 'manuscript_insert', { index: 0, text: 'The kettle sang before dawn.\nNobody moved.' });
  const later = session.execute<{ id: string }>(writer, 'card_create', { type: 'form.finale', x: 0, y: 0 });
  session.execute(writer, 'card_set_text', { id: later.id, text: 'Gran finally speaks' });
  const first = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.character', x: 0, y: 300 });
  session.execute(writer, 'card_set_text', { id: first.id, text: 'Gran, who never says sorry' });
  session.execute(writer, 'card_annotate', { id: first.id, annotation: 'Based on nobody.' });
  session.execute(writer, 'note_create', { x: 0, y: 0, text: 'Check the ending' });
  return session.execute<BoardView>(writer, 'board_read');
}

describe('Markdown export', () => {
  it('has the draft, then cards by column in framework order, then notes', () => {
    const md = exportMarkdown(sampleBoard());
    expect(md.startsWith('# Kettle\n\n## Draft\n\nThe kettle sang before dawn.\nNobody moved.')).toBe(true);
    expect(md.indexOf('## Nouns')).toBeLessThan(md.indexOf('## Form'));
    expect(md).toContain('### Character\n\n*');
    expect(md).toContain('Gran, who never says sorry\n\nNote: Based on nobody.');
    expect(md).toContain('## Sticky notes\n\n- Check the ending');
    expect(md).not.toContain('<!--');
  });
});

describe('PDF export', () => {
  it('wraps the draft into manuscript lines with indented paragraphs', () => {
    const lines = wrapManuscript(`${'word '.repeat(40)}\n\nNext paragraph.`);
    expect(lines.every((l) => l.length <= MANUSCRIPT_COLUMNS)).toBe(true);
    expect(lines[0]!.startsWith('     word')).toBe(true);
    expect(lines).toContain('');
    expect(lines[lines.length - 1]).toBe('     Next paragraph.');
  });

  it('splits long drafts into numbered pages', () => {
    const pages = manuscriptPages('A line.\n'.repeat(MANUSCRIPT_LINES * 2 + 3), 'Kettle');
    expect(pages).toHaveLength(3);
    expect(pages[2]).toMatchObject({ kind: 'text', pageNumber: 3, header: 'Kettle' });
  });

  it('writes a well-formed PDF whose cross-reference offsets point at each object', () => {
    // A 1x1 baseline JPEG's start-of-frame segment is all the writer reads for size.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
    expect(jpegSize(jpeg)).toEqual({ width: 3, height: 2 });
    const pdf = buildPdf([{ kind: 'image', jpeg, width: 3, height: 2, caption: 'The board' }, ...manuscriptPages('“Curly” quotes — and (parens).', 'Kettle')]);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain('/Count 2');
    // WinAnsi codes for curly quotes and the em dash; parentheses escaped.
    expect(text).toContain('\\223Curly\\224 quotes \\227 and \\(parens\\).');
  });
});
