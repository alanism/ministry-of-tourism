// Taking the whole board out of the app, as an agent. The writer exports with
// a button; an agent does it with this tool, so a long-running board can be
// carried between sessions as one file and read as a document in chat.
import { z } from 'zod';
import { boardParts } from '../doc/model.ts';
import { makeBoardFile, type BoardFile } from '../doc/board-file.ts';
import { exportMarkdown } from '../export/markdown.ts';
import { defineCommand, type AnyCommand } from './define.ts';
import { readBoard } from './board-commands.ts';

export const boardExport = defineCommand({
  name: 'board_export',
  title: 'Export the whole board',
  description: [
    'Exports the whole board so you can keep it between sessions or show it to a person. It does not change the board.',
    '`file` is the full board file as JSON: the exact document (restorable) plus a readable copy of the board. Save it as a .json file; a person can open it with Import in Writer’s Board.',
    '`markdown` is the board as a readable document: the draft, then the cards by column with their quotes and notes, sticky notes, guides and sources.',
    'Picture bytes are not included in `file` (only where each picture sits and its hash, in the readable copy); `picturesNotIncluded` says how many.',
    'Pass `format` as "json", "markdown" or "both" (the default).',
  ].join(' '),
  access: 'read',
  input: z.object({ format: z.enum(['both', 'json', 'markdown']).optional() }),
  run: (ctx, input) => {
    const format = input.format ?? 'both';
    const board = readBoard({ doc: ctx.doc, parts: boardParts(ctx.doc) });
    const result: {
      title: string;
      exportedAt: string;
      file?: BoardFile;
      markdown?: string;
      picturesNotIncluded: number;
    } = { title: board.title, exportedAt: new Date().toISOString(), picturesNotIncluded: board.images.length };
    if (format !== 'markdown') result.file = makeBoardFile(ctx.doc, {});
    if (format !== 'json') result.markdown = exportMarkdown(board);
    return result;
  },
});

export const EXPORT_COMMANDS: readonly AnyCommand[] = [boardExport];
