// Phase 0 commands: cards, the manuscript, pasted sources and quote links.
// Descriptions are written for agents: factual, saying when to use each tool.
import * as Y from 'yjs';
import { z } from 'zod';
import { CATEGORY_IDS, FRAMEWORK_CARDS, cardsInCategory, getFrameworkCard, isCardTypeId, type CategoryId } from '../framework/catalog.ts';
import { anchorRange, findQuote, resolveLink, targetText, type LinkTarget } from '../doc/links.ts';
import {
  AGENT_MODES,
  CARD_SIZES,
  LANES,
  ORIENTATIONS,
  cardDimensions,
  cardText,
  laneX,
  insertCard,
  nextLanePosition,
  type AgentMode,
  type BoardParts,
  type CardSize,
  type Orientation,
} from '../doc/model.ts';
import { CommandError, defineCommand, type AnyCommand, type CommandContext } from './define.ts';
import { DEFAULT_PALETTE, PALETTE_IDS, isPaletteId, type PaletteId } from '../brand.ts';
import {
  readItems,
  removeConnectionsTo,
  type ConnectionView,
  type GuideView,
  type ImageView,
  type NoteView,
  type StrokeView,
} from './item-commands.ts';
import { readCoaching, type CardScore, type CoachLogView, type FeedbackView } from './coach-commands.ts';

const id = z.string().min(1);
const cardType = z.string().refine(isCardTypeId, { message: 'Not one of the 48 framework card types; call framework_list' });
const coordinate = z.number().finite();
const rotation = z.number().min(-15).max(15);
const linkTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manuscript') }),
  z.object({ kind: z.literal('source'), sourceId: id }),
]);
const occurrence = z.number().int().min(1).optional();

function getCard(parts: BoardParts, cardId: string): Y.Map<unknown> {
  const card = parts.cards.get(cardId);
  if (!card) throw new CommandError('not_found', `No card with id ${cardId}`);
  return card;
}

function locateQuote(ctx: CommandContext, target: LinkTarget, quote: string, nth?: number) {
  const text = targetText(ctx.parts, target);
  if (!text) throw new CommandError('not_found', `No source with id ${target.kind === 'source' ? target.sourceId : ''}`);
  const match = findQuote(text.toString(), quote, nth);
  if (!match.ok) {
    if (match.reason === 'ambiguous') {
      throw new CommandError('quote_ambiguous', `The quote appears ${match.count} times; pass occurrence (1-${match.count})`);
    }
    throw new CommandError('quote_not_found', 'The quote does not appear verbatim in the text; quote it exactly');
  }
  return { text, index: match.index };
}

function insertLink(ctx: CommandContext, cardId: string, target: LinkTarget, text: Y.Text, index: number, quote: string): string {
  const linkId = ctx.newId();
  const link = new Y.Map<unknown>();
  const { start, end } = anchorRange(text, index, quote.length);
  link.set('id', linkId);
  link.set('cardId', cardId);
  link.set('target', target);
  link.set('start', start);
  link.set('end', end);
  link.set('quote', quote);
  link.set('createdBy', ctx.actor.id);
  ctx.parts.links.set(linkId, link);
  return linkId;
}

export interface LinkView {
  id: string;
  target: LinkTarget;
  quote: string;
  current: string;
  status: 'intact' | 'edited' | 'gone';
  /** Character range of the linked words in their text right now. */
  start: number;
  end: number;
}

export interface CardView {
  id: string;
  type: string;
  category: string;
  name: string;
  question: string;
  x: number;
  y: number;
  rotation: number;
  orientation: Orientation;
  size: CardSize;
  text: string;
  annotation: string;
  createdBy: string;
  links: LinkView[];
  score?: CardScore;
}

export interface BoardView {
  title: string;
  surface: string;
  draftForMe: boolean;
  agentMode: AgentMode;
  /** Neutral, Blossom or Signal: the brand palette this board is drawn in. */
  palette: PaletteId;
  cards: CardView[];
  sources: { id: string; title: string; author: string; length: number; text: string }[];
  manuscript: string;
  notes: NoteView[];
  images: ImageView[];
  strokes: StrokeView[];
  connections: ConnectionView[];
  guides: GuideView[];
  feedback: FeedbackView[];
  coachLog: CoachLogView[];
}

export function readBoard(ctx: Pick<CommandContext, 'doc' | 'parts'>): BoardView {
  const { doc, parts } = ctx;
  const linksByCard = new Map<string, LinkView[]>();
  for (const link of parts.links.values()) {
    const cardId = link.get('cardId') as string;
    const resolved = resolveLink(doc, parts, link);
    const list = linksByCard.get(cardId) ?? [];
    list.push({
      id: link.get('id') as string,
      target: link.get('target') as LinkTarget,
      quote: link.get('quote') as string,
      ...resolved,
    });
    linksByCard.set(cardId, list);
  }
  const cards = [...parts.cards.values()].map((card): CardView => {
    const frameworkCard = getFrameworkCard(card.get('type') as string)!;
    const cardId = card.get('id') as string;
    return {
      id: cardId,
      type: frameworkCard.id,
      category: frameworkCard.category,
      name: frameworkCard.name,
      question: frameworkCard.question,
      x: card.get('x') as number,
      y: card.get('y') as number,
      rotation: card.get('rotation') as number,
      orientation: card.get('orientation') as Orientation,
      size: card.get('size') as CardSize,
      text: cardText(card).toString(),
      annotation: card.get('annotation') as string,
      createdBy: card.get('createdBy') as string,
      links: linksByCard.get(cardId) ?? [],
      ...(card.get('score') ? { score: card.get('score') as CardScore } : {}),
    };
  });
  cards.sort((a, b) => CATEGORY_IDS.indexOf(a.category as never) - CATEGORY_IDS.indexOf(b.category as never) || a.y - b.y || a.x - b.x);
  return {
    title: parts.meta.get('title') as string,
    surface: parts.meta.get('surface') as string,
    draftForMe: parts.meta.get('draftForMe') === true,
    agentMode: (parts.meta.get('agentMode') as AgentMode | undefined) ?? 'together',
    palette: isPaletteId(parts.meta.get('palette')) ? (parts.meta.get('palette') as PaletteId) : DEFAULT_PALETTE,
    cards,
    sources: [...parts.sources.values()].map((source) => ({
      id: source.get('id') as string,
      title: source.get('title') as string,
      author: source.get('author') as string,
      length: (source.get('text') as Y.Text).length,
      text: (source.get('text') as Y.Text).toString(),
    })),
    manuscript: parts.manuscript.toString(),
    ...readItems(parts),
    ...readCoaching(doc, parts),
  };
}

export const boardRead = defineCommand({
  name: 'board_read',
  title: 'Read the board',
  description:
    'Returns the whole board: every card with its framework type, position, the writer\'s text, notes and quote links; sticky notes, images, marker strokes, yarn and guides; plus pasted sources and the manuscript. Call this first.',
  access: 'read',
  input: z.object({}),
  run: (ctx) => readBoard(ctx),
});

export const frameworkList = defineCommand({
  name: 'framework_list',
  title: 'List framework cards',
  description:
    'Lists the 48 fixed card types in the Nouns, Idea, Form and Voice columns, with each card\'s guiding question and lesson. Card types cannot be added or renamed.',
  access: 'read',
  input: z.object({ category: z.enum(CATEGORY_IDS).optional() }),
  run: (_ctx, input) =>
    FRAMEWORK_CARDS.filter((c) => !input.category || c.category === input.category).map((c) => ({
      type: c.id,
      category: c.category,
      name: c.name,
      question: c.question,
      lesson: c.lesson,
    })),
});

export const cardCreate = defineCommand({
  name: 'card_create',
  title: 'Add a card',
  description:
    'Adds a framework card to the board. Without x and y it goes under the last card in its column. Agents may only pass text when the writer has turned on Draft for me.',
  access: 'write',
  input: z.object({
    type: cardType,
    x: coordinate.optional(),
    y: coordinate.optional(),
    rotation: rotation.optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
    size: z.enum(CARD_SIZES).optional(),
    text: z.string().max(10_000).optional(),
  }),
  writesProse: (input) => Boolean(input.text),
  run: (ctx, input) => {
    const cardId = ctx.newId();
    const position = input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : nextLanePosition(ctx.parts, input.type);
    insertCard(ctx.parts, {
      id: cardId,
      type: input.type,
      ...position,
      rotation: input.rotation ?? 0,
      orientation: input.orientation ?? (ctx.parts.meta.get('defaultOrientation') as Orientation),
      size: input.size ?? (ctx.parts.meta.get('defaultSize') as CardSize),
      text: input.text ?? '',
      annotation: '',
      createdBy: ctx.actor.id,
    });
    return { id: cardId, ...position };
  },
});

export const cardMove = defineCommand({
  name: 'card_move',
  title: 'Move a card',
  description: 'Moves a card to a new position on the board, and optionally tilts it (degrees, -15 to 15).',
  access: 'write',
  input: z.object({ id, x: coordinate, y: coordinate, rotation: rotation.optional() }),
  run: (ctx, input) => {
    const card = getCard(ctx.parts, input.id);
    card.set('x', input.x);
    card.set('y', input.y);
    if (input.rotation !== undefined) card.set('rotation', input.rotation);
    return { id: input.id };
  },
});

export const cardUpdate = defineCommand({
  name: 'card_update',
  title: 'Change a card\'s shape',
  description: 'Switches a card between portrait and landscape, or changes its size (3x5, 4x6 or 5x8 index card, or a 3x3 sticky note).',
  access: 'write',
  input: z
    .object({ id, orientation: z.enum(ORIENTATIONS).optional(), size: z.enum(CARD_SIZES).optional() })
    .refine((i) => i.orientation !== undefined || i.size !== undefined, { message: 'Pass orientation or size' }),
  run: (ctx, input) => {
    const card = getCard(ctx.parts, input.id);
    if (input.orientation) card.set('orientation', input.orientation);
    if (input.size) card.set('size', input.size);
    return { id: input.id };
  },
});

export const cardSetText = defineCommand({
  name: 'card_set_text',
  title: 'Write on a card',
  description:
    'Replaces the writer\'s text on a card. This is the writer\'s own words: agents are refused unless the writer has turned on Draft for me. To leave a coaching note instead, use card_annotate.',
  access: 'write',
  input: z.object({ id, text: z.string().max(10_000) }),
  writesProse: () => true,
  run: (ctx, input) => {
    const text = cardText(getCard(ctx.parts, input.id));
    text.delete(0, text.length);
    text.insert(0, input.text);
    return { id: input.id };
  },
});

export const cardAnnotate = defineCommand({
  name: 'card_annotate',
  title: 'Leave a note on a card',
  description:
    'Sets the coaching or analysis note on a card, such as why a quoted passage works. Notes are shown apart from the writer\'s own text.',
  access: 'write',
  input: z.object({ id, annotation: z.string().max(2_000) }),
  run: (ctx, input) => {
    getCard(ctx.parts, input.id).set('annotation', input.annotation);
    return { id: input.id };
  },
});

export const cardDelete = defineCommand({
  name: 'card_delete',
  title: 'Remove a card',
  description: 'Removes a card and its quote links from the board. The writer can undo it.',
  access: 'sensitive',
  input: z.object({ id }),
  run: (ctx, input) => {
    getCard(ctx.parts, input.id);
    for (const [linkId, link] of [...ctx.parts.links.entries()]) {
      if (link.get('cardId') === input.id) ctx.parts.links.delete(linkId);
    }
    removeConnectionsTo(ctx.parts, input.id);
    ctx.parts.cards.delete(input.id);
    return { id: input.id };
  },
});

/** Blank cards from an earlier draw: a new draw takes them back. */
function untouchedDrawnCards(parts: BoardParts): string[] {
  const linked = new Set([...parts.links.values()].map((l) => l.get('cardId') as string));
  return [...parts.cards.values()]
    .filter((c) => c.get('drawn') === true && !cardText(c).toString().trim() && !(c.get('annotation') as string) && !c.has('score') && !linked.has(c.get('id') as string))
    .map((c) => c.get('id') as string);
}

const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything a dealt hand must not cover: cards (but not those being taken back), notes and pictures. */
function takenSpace(parts: BoardParts, except: readonly string[]): Rect[] {
  const rects: Rect[] = [];
  for (const card of parts.cards.values()) {
    if (except.includes(card.get('id') as string)) continue;
    rects.push({ x: card.get('x') as number, y: card.get('y') as number, ...cardDimensions(card.get('size') as CardSize, card.get('orientation') as Orientation) });
  }
  for (const note of parts.notes.values()) rects.push({ x: note.get('x') as number, y: note.get('y') as number, width: 144, height: 144 });
  for (const image of parts.images.values()) {
    rects.push({ x: image.get('x') as number, y: image.get('y') as number, width: image.get('width') as number, height: image.get('height') as number });
  }
  return rects;
}

/** The clear spot for a row nearest the wanted center, stepping out a card at a time. */
function clearRow(center: { x: number; y: number }, row: { width: number; height: number }, step: { x: number; y: number }, taken: Rect[]): { x: number; y: number } {
  const margin = 20;
  const free = (c: { x: number; y: number }) => {
    const r = { x: c.x - row.width / 2, y: c.y - row.height / 2, width: row.width, height: row.height };
    return !taken.some((t) => r.x < t.x + t.width + margin && t.x < r.x + r.width + margin && r.y < t.y + t.height + margin && t.y < r.y + r.height + margin);
  };
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      const c = { x: center.x + i * step.x, y: center.y + j * step.y };
      candidates.push({ ...c, d: Math.hypot(i * step.x, j * step.y) });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  return candidates.find(free) ?? center;
}

export const cardsDraw = defineCommand({
  name: 'cards_draw',
  title: 'Draw 3 cards',
  description:
    'Deals a writing prompt: one Nouns card plus cards from two other columns, chosen at random from cards not already on the board, laid face up in a row in clear space. Blank cards from an earlier draw are taken back first; cards with writing stay. Pass x and y for where to aim the row; it moves to the nearest spot that covers nothing.',
  access: 'write',
  input: z.object({ x: coordinate.optional(), y: coordinate.optional() }),
  run: (ctx, input) => {
    const returned = untouchedDrawnCards(ctx.parts);
    const returnedTypes = new Set(returned.map((cardId) => ctx.parts.cards.get(cardId)!.get('type') as string));
    const onBoard = new Set(
      [...ctx.parts.cards.values()].filter((c) => !returned.includes(c.get('id') as string)).map((c) => c.get('type') as string),
    );
    // Fresh cards first: what was just taken back only comes again if nothing else is left.
    const available = (category: CategoryId) => {
      const free = cardsInCategory(category).filter((c) => !onBoard.has(c.id));
      const fresh = free.filter((c) => !returnedTypes.has(c.id));
      return fresh.length ? fresh : free;
    };
    const hand: string[] = [];
    const noun = pick(available('NOUNS'));
    if (noun) hand.push(noun.id);
    const others = CATEGORY_IDS.filter((c) => c !== 'NOUNS' && available(c).length > 0).sort(() => Math.random() - 0.5);
    for (const category of others.slice(0, 3 - hand.length)) hand.push(pick(available(category))!.id);

    for (const cardId of returned) ctx.parts.cards.delete(cardId);

    const orientation = ctx.parts.meta.get('defaultOrientation') as Orientation;
    const size = ctx.parts.meta.get('defaultSize') as CardSize;
    const { width, height } = cardDimensions(size, orientation);
    const gap = 28;
    const rowWidth = hand.length * width + (hand.length - 1) * gap;
    const wanted = input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : { x: laneX('VOICE') + LANES.width + 80 + rowWidth / 2, y: LANES.startY + height / 2 };
    // Deal into clear space near there, never on top of what's already on the board.
    const center = clearRow(wanted, { width: rowWidth, height }, { x: Math.round(width / 2), y: Math.round(height / 2) }, takenSpace(ctx.parts, returned));
    const tilts = hand.length === 3 ? [-4, 1, 4] : hand.map(() => 0);
    const dealt = hand.map((type, i) => {
      const cardId = ctx.newId();
      const x = Math.round(center.x - rowWidth / 2 + i * (width + gap));
      const y = Math.round(center.y - height / 2);
      insertCard(ctx.parts, { id: cardId, type, x, y, rotation: tilts[i]!, orientation, size, text: '', annotation: '', createdBy: ctx.actor.id });
      ctx.parts.cards.get(cardId)!.set('drawn', true);
      const card = getFrameworkCard(type)!;
      return { id: cardId, type, name: card.name, question: card.question };
    });
    return {
      cards: dealt,
      prompt: dealt.map((c) => `${c.name}: ${c.question}`).join('\n'),
      returned: returned.length,
    };
  },
});

export const manuscriptInsert = defineCommand({
  name: 'manuscript_insert',
  title: 'Type into the draft',
  description: 'Inserts text into the writer\'s draft at a character index. This is the writer\'s own words: agents are refused unless Draft for me is on.',
  access: 'write',
  input: z.object({ index: z.number().int().min(0), text: z.string().min(1) }),
  writesProse: () => true,
  run: (ctx, input) => {
    if (input.index > ctx.parts.manuscript.length) {
      throw new CommandError('invalid_input', `index is past the end of the draft (${ctx.parts.manuscript.length})`);
    }
    ctx.parts.manuscript.insert(input.index, input.text);
    return { length: ctx.parts.manuscript.length };
  },
});

export const manuscriptDelete = defineCommand({
  name: 'manuscript_delete',
  title: 'Delete from the draft',
  description: 'Deletes a range of the writer\'s draft. Agents are refused unless Draft for me is on.',
  access: 'write',
  input: z.object({ index: z.number().int().min(0), length: z.number().int().min(1) }),
  writesProse: () => true,
  run: (ctx, input) => {
    if (input.index + input.length > ctx.parts.manuscript.length) {
      throw new CommandError('invalid_input', `range runs past the end of the draft (${ctx.parts.manuscript.length})`);
    }
    ctx.parts.manuscript.delete(input.index, input.length);
    return { length: ctx.parts.manuscript.length };
  },
});

export const sourceAdd = defineCommand({
  name: 'source_add',
  title: 'Add a source text',
  description:
    'Stores a piece of writing to study, such as an essay or chapter pasted for Reverse Engineer. Source text is kept exactly as given and cannot be edited.',
  access: 'write',
  input: z.object({ title: z.string().min(1).max(300), author: z.string().max(300).optional(), text: z.string().min(1).max(500_000) }),
  run: (ctx, input) => {
    const sourceId = ctx.newId();
    const source = new Y.Map<unknown>();
    source.set('id', sourceId);
    source.set('title', input.title);
    source.set('author', input.author ?? '');
    source.set('text', new Y.Text(input.text));
    source.set('addedBy', ctx.actor.id);
    ctx.parts.sources.set(sourceId, source);
    return { id: sourceId };
  },
});

export const linkCreate = defineCommand({
  name: 'link_create',
  title: 'Link a card to a passage',
  description:
    'Links a card to an exact passage in the draft or a source. The quote must appear verbatim; if it appears more than once, pass occurrence. The link follows the words as the text is edited.',
  access: 'write',
  input: z.object({ cardId: id, target: linkTarget, quote: z.string().min(1).max(5_000), occurrence }),
  run: (ctx, input) => {
    getCard(ctx.parts, input.cardId);
    const { text, index } = locateQuote(ctx, input.target, input.quote, input.occurrence);
    return { id: insertLink(ctx, input.cardId, input.target, text, index, input.quote), index };
  },
});

export const cardCreateFromQuote = defineCommand({
  name: 'card_create_from_quote',
  title: 'Add a card from a quoted passage',
  description:
    'Reverse Engineer step: adds a framework card for a passage in a source, linked to the exact quote, with a short note on why it works. The quote must appear verbatim in the source; invented quotes are refused.',
  access: 'write',
  input: z.object({
    type: cardType,
    sourceId: id,
    quote: z.string().min(1).max(5_000),
    occurrence,
    annotation: z.string().max(2_000).optional(),
    x: coordinate.optional(),
    y: coordinate.optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
    size: z.enum(CARD_SIZES).optional(),
  }),
  run: (ctx, input) => {
    const target: LinkTarget = { kind: 'source', sourceId: input.sourceId };
    const { text, index } = locateQuote(ctx, target, input.quote, input.occurrence);
    const cardId = ctx.newId();
    const position = input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : nextLanePosition(ctx.parts, input.type);
    insertCard(ctx.parts, {
      id: cardId,
      type: input.type,
      ...position,
      rotation: 0,
      orientation: input.orientation ?? (ctx.parts.meta.get('defaultOrientation') as Orientation),
      size: input.size ?? (ctx.parts.meta.get('defaultSize') as CardSize),
      text: '',
      annotation: input.annotation ?? '',
      createdBy: ctx.actor.id,
    });
    const linkId = insertLink(ctx, cardId, target, text, index, input.quote);
    return { cardId, linkId };
  },
});

export const settingsSetDraftForMe = defineCommand({
  name: 'settings_set_draft_for_me',
  title: 'Turn Draft for me on or off',
  description: 'Lets agents write into the writer\'s cards and draft. Only the writer can change this.',
  access: 'write',
  humanOnly: true,
  input: z.object({ enabled: z.boolean() }),
  run: (ctx, input) => {
    ctx.parts.meta.set('draftForMe', input.enabled);
    return { draftForMe: input.enabled };
  },
});

export const settingsSetAgentMode = defineCommand({
  name: 'settings_set_agent_mode',
  title: 'Set how much agents may do',
  description:
    'Solo: agents can only read the board. Together: agents work beside the writer. Autopilot: an agent drives until the writer stops it. Only the writer can change this.',
  access: 'write',
  humanOnly: true,
  input: z.object({ mode: z.enum(AGENT_MODES) }),
  run: (ctx, input) => {
    ctx.parts.meta.set('agentMode', input.mode);
    return { agentMode: input.mode };
  },
});

export const boardSetTitle = defineCommand({
  name: 'board_set_title',
  title: 'Rename the board',
  description: 'Gives the board a new name. The writer can undo it.',
  access: 'write',
  input: z.object({ title: z.string().trim().min(1).max(120) }),
  run: (ctx, input) => {
    ctx.parts.meta.set('title', input.title);
    return { title: input.title };
  },
});

export const boardSetPalette = defineCommand({
  name: 'board_set_palette',
  title: 'Set the board palette',
  description:
    'Draws the board in one of the UnCommon Core palettes: neutral (general use), blossom (reading and humanities) or signal (math and assessment). Cards, notes and ink keep their places; only their colors change.',
  access: 'write',
  input: z.object({ palette: z.enum(PALETTE_IDS) }),
  run: (ctx, input) => {
    ctx.parts.meta.set('palette', input.palette);
    return { palette: input.palette };
  },
});

export const BOARD_COMMANDS: readonly AnyCommand[] = [
  boardRead,
  frameworkList,
  cardCreate,
  cardMove,
  cardUpdate,
  cardSetText,
  cardAnnotate,
  cardDelete,
  cardsDraw,
  manuscriptInsert,
  manuscriptDelete,
  sourceAdd,
  linkCreate,
  cardCreateFromQuote,
  settingsSetDraftForMe,
  settingsSetAgentMode,
  boardSetPalette,
  boardSetTitle,
];
