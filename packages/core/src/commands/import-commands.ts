// Bringing a saved board back, as an agent. board_export takes the whole board
// out as a file; this puts its content onto the open board as NEW items, so a
// long-running agent can carry a board between sessions. It never overwrites:
// what's already on the board stays, and the file's items are placed below it.
import { z } from 'zod';
import { boardParts, cardDimensions } from '../doc/model.ts';
import { loadBoard } from '../doc/persist.ts';
import { readBoardFiles } from '../doc/board-file.ts';
import { getGuidePreset } from '../guides/presets.ts';
import { CommandError, defineCommand, type AnyCommand, type CommandContext } from './define.ts';
import { cardAnnotate, cardCreate, linkCreate, manuscriptInsert, readBoard, sourceAdd, type BoardView } from './board-commands.ts';
import { cardScore } from './coach-commands.ts';
import { connectionCreate, guideCreate, guideUpdate, noteCreate, strokeAdd } from './item-commands.ts';

const MAX_ITEMS = 5_000;
/** Space left between what's already on the board and the imported items. */
const GAP = 160;

/** Reads an input with a message that says which item in the file was the problem. */
function check<T>(label: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new CommandError('invalid_input', `The file’s ${label} can’t be imported: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

const hasWriting = (view: BoardView) => view.cards.some((c) => c.text.trim()) || view.notes.some((n) => n.text.trim()) || Boolean(view.manuscript.trim());

const ys = (view: BoardView): number[] => [
  ...view.cards.map((c) => c.y),
  ...view.notes.map((n) => n.y),
  ...view.guides.flatMap((g) => g.points.map((p) => p[1])),
  ...view.strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 1)),
];

const bottoms = (view: BoardView): number[] => [
  ...view.cards.map((c) => c.y + cardDimensions(c.size, c.orientation).height),
  ...view.notes.map((n) => n.y + 144),
  ...view.images.map((i) => i.y + i.height + 44),
  ...view.guides.flatMap((g) => g.points.map((p) => p[1] + 60)),
  ...view.strokes.flatMap((s) => s.points.filter((_, i) => i % 2 === 1)),
];

function singleBoard(file: unknown) {
  let json: unknown = file;
  if (typeof file === 'string') {
    try {
      json = JSON.parse(file);
    } catch {
      throw new CommandError('invalid_input', 'The file isn’t valid JSON. Pass the board file exactly as board_export gave it.');
    }
  }
  let boards;
  try {
    boards = readBoardFiles(json);
  } catch (error) {
    throw new CommandError('invalid_input', error instanceof Error ? error.message : String(error));
  }
  if (boards.length !== 1) {
    throw new CommandError('invalid_input', `This is a backup of ${boards.length} boards (${boards.map((b) => `“${b.title}”`).join(', ')}). Pass one board’s file, for example boards[0].`);
  }
  return boards[0]!;
}

export const boardImport = defineCommand({
  name: 'board_import',
  title: 'Import a saved board',
  description: [
    'Brings a board saved with board_export back onto this board. Pass `file` as the board file (the JSON object, or the JSON text).',
    'It never overwrites: the file’s cards, sticky notes, sources (with their quote links), yarn, guides, marker strokes and scores are added as new items below what is already here, as one run the writer can undo.',
    'The file’s draft is added only if this board has no draft yet. The board’s own title, palette and settings are kept. Pictures are not imported (their bytes are not in the file); `skipped.pictures` says how many.',
    'Importing the same file twice adds its items twice.',
    'Because this puts text on the writer’s board, agents are refused unless the board has no writing on it yet or the writer has turned on Draft for me.',
  ].join(' '),
  access: 'write',
  input: z.object({ file: z.union([z.string().min(2), z.record(z.string(), z.unknown())]) }),
  run: (ctx: CommandContext, input) => {
    const board = singleBoard(input.file);
    const incoming = loadBoard(board.update);
    const from = readBoard({ doc: incoming, parts: boardParts(incoming) });
    incoming.destroy();
    const here = readBoard(ctx);

    const total = from.cards.length + from.notes.length + from.strokes.length + from.guides.length + from.sources.length;
    if (total > MAX_ITEMS) throw new CommandError('invalid_input', `This board has ${total} items; import takes at most ${MAX_ITEMS}.`);

    // The writer's words stay the writer's: an agent may only bring text onto a board that has none yet.
    if (ctx.actor.kind === 'agent' && ctx.parts.meta.get('draftForMe') !== true && hasWriting(here) && hasWriting(from)) {
      throw new CommandError(
        'coach_mode',
        'Coach mode: agents do not put text on a board that already has the writer’s writing. Import into a new board, or ask the writer to turn on Draft for me.',
      );
    }

    // Everything is checked before anything is added: a refusal halfway would leave a partial import.
    const top = ys(from);
    const lowest = bottoms(here);
    const dy = lowest.length && top.length ? Math.max(0, Math.round(Math.max(...lowest) + GAP - Math.min(...top))) : 0;
    const shift = (points: number[]) => points.map((v, i) => (i % 2 === 1 ? v + dy : v));

    const planned = {
      sources: from.sources.map((s) => ({ old: s.id, input: check(`source “${s.title}”`, () => sourceAdd.input.parse({ title: s.title, author: s.author, text: s.text })) })),
      cards: from.cards.map((c) => ({
        card: c,
        input: check(`card “${c.name}”`, () => cardCreate.input.parse({ type: c.type, x: c.x, y: c.y + dy, rotation: c.rotation, orientation: c.orientation, size: c.size, text: c.text })),
        annotation: c.annotation ? check(`card “${c.name}” note`, () => cardAnnotate.input.parse({ id: c.id, annotation: c.annotation })) : undefined,
        score: c.score ? check(`card “${c.name}” score`, () => cardScore.input.parse({ id: c.id, score: c.score!.value, note: c.score!.note })) : undefined,
      })),
      notes: from.notes.map((n) => ({ old: n.id, input: check('sticky note', () => noteCreate.input.parse({ x: n.x, y: n.y + dy, text: n.text, color: n.color, rotation: n.rotation })) })),
      strokes: from.strokes.map((s) => check('marker stroke', () => strokeAdd.input.parse({ points: shift(s.points), color: s.color, width: s.width }))),
      connections: from.connections.map(c => check('connection', () => connectionCreate.input.parse({ from: c.from, to: c.to, style: c.style, color: c.color }))),
    };

    const added = { cards: 0, notes: 0, sources: 0, connections: 0, guides: 0, strokes: 0, quoteLinks: 0, draft: false };
    const skipped = { pictures: from.images.length, quoteLinks: 0, connections: 0, guides: 0, draft: '' };
    const ids = new Map<string, string>();

    // Sources first, reusing one the board already has word for word.
    const sourceIds = new Map<string, string>();
    for (const { old, input: sourceInput } of planned.sources) {
      const existing = here.sources.find((s) => s.title === sourceInput.title && s.text === sourceInput.text);
      if (existing) {
        sourceIds.set(old, existing.id);
        continue;
      }
      sourceIds.set(old, (sourceAdd.run(ctx, sourceInput) as { id: string }).id);
      added.sources++;
    }

    for (const { card, input: cardInput, annotation, score } of planned.cards) {
      const { id } = cardCreate.run(ctx, cardInput) as { id: string };
      ids.set(card.id, id);
      added.cards++;
      if (annotation) cardAnnotate.run(ctx, { ...annotation, id });
      if (score) cardScore.run(ctx, { ...score, id });
      for (const link of card.links) {
        const sourceId = link.target.kind === 'source' ? sourceIds.get(link.target.sourceId) : undefined;
        if (!sourceId) {
          skipped.quoteLinks++;
          continue;
        }
        try {
          linkCreate.run(ctx, linkCreate.input.parse({ cardId: id, target: { kind: 'source', sourceId }, quote: link.quote }));
          added.quoteLinks++;
        } catch {
          skipped.quoteLinks++;
        }
      }
    }

    for (const { old, input: noteInput } of planned.notes) {
      ids.set(old, (noteCreate.run(ctx, noteInput) as { id: string }).id);
      added.notes++;
    }

    for (const stroke of planned.strokes) {
      strokeAdd.run(ctx, stroke);
      added.strokes++;
    }

    for (const guide of from.guides) {
      try {
        const [first] = guide.points;
        const create = guideCreate.input.parse({ preset: guide.preset, x: first?.[0] ?? 0, y: (first?.[1] ?? 0) + dy });
        const update = guideUpdate.input.parse({
          id: guide.id,
          points: guide.points.map((p) => [p[0], p[1] + dy]),
          stops: guide.stops,
          title: guide.title,
          ...(guide.axes ? { axes: guide.axes } : {}),
          ...(guide.quadrants ? { quadrants: guide.quadrants } : {}),
          visible: guide.visible,
        });
        if (getGuidePreset(guide.preset)?.kind === 'quadrant' && update.points?.length !== 2) throw new Error('A grid guide takes two corner points');
        const { id } = guideCreate.run(ctx, create) as { id: string };
        guideUpdate.run(ctx, { ...update, id });
        if (guide.locked) guideUpdate.run(ctx, guideUpdate.input.parse({ id, locked: true }));
        added.guides++;
      } catch {
        skipped.guides++;
      }
    }

    for (const connection of planned.connections) {
      const a = ids.get(connection.from);
      const b = ids.get(connection.to);
      if (!a || !b) {
        skipped.connections++;
        continue;
      }
      connectionCreate.run(ctx, connectionCreate.input.parse({ from: a, to: b, style: connection.style, color: connection.color }));
      added.connections++;
    }

    if (from.manuscript.trim()) {
      if (here.manuscript.trim()) skipped.draft = 'This board already has a draft, so the file’s draft was left out.';
      else {
        manuscriptInsert.run(ctx, manuscriptInsert.input.parse({ index: 0, text: from.manuscript }));
        added.draft = true;
      }
    }

    return { title: board.title, added, skipped, placedBelowBy: dy };
  },
});

export const IMPORT_COMMANDS: readonly AnyCommand[] = [boardImport];

