// The shared board document. Everything a writer or an agent can change lives
// in one Yjs doc, so people and agents can edit at the same time and every
// change carries an origin (who made it) for undo and history.
import * as Y from 'yjs';
import { CATEGORY_IDS, OPENING_HAND, getFrameworkCard, type CardTypeId, type CategoryId } from '../framework/catalog.ts';

export const DOC_SCHEMA_VERSION = 1;

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

// Index cards (3x5, 4x6, 5x8) and the square sticky note (3x3).
export const CARD_SIZES = ['3x5', '4x6', '5x8', '3x3'] as const;
export type CardSize = (typeof CARD_SIZES)[number];

export const SURFACES = ['whiteboard', 'cork'] as const;

/** solo: agents only read. together: agents work beside the writer. autopilot: an agent drives until stopped. */
export const AGENT_MODES = ['solo', 'together', 'autopilot'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];
export type Surface = (typeof SURFACES)[number];

export interface Actor {
  kind: 'human' | 'agent';
  id: string;
  name: string;
}

/** Changes made while setting up a board; never part of anyone's undo history. */
export const SYSTEM_ORIGIN = Object.freeze({ system: true });

export interface BoardParts {
  meta: Y.Map<unknown>;
  cards: Y.Map<Y.Map<unknown>>;
  manuscript: Y.Text;
  sources: Y.Map<Y.Map<unknown>>;
  /** Quote links from cards to passages. */
  links: Y.Map<Y.Map<unknown>>;
  /** Sticky notes: free text, not framework cards. */
  notes: Y.Map<Y.Map<unknown>>;
  /** Pasted or generated pictures; the image bytes live outside the doc, by content hash. */
  images: Y.Map<Y.Map<unknown>>;
  /** Marker ink on the whiteboard. */
  strokes: Y.Map<Y.Map<unknown>>;
  /** Yarn or arrows between board items. */
  connections: Y.Map<Y.Map<unknown>>;
  /** Timelines, journey maps, arcs and grids. */
  guides: Y.Map<Y.Map<unknown>>;
  /** A reader's green (love it) and red (confused) marks on the draft. */
  feedback: Y.Map<Y.Map<unknown>>;
  /** Coaching moves practiced, one entry per "What's wrong?" session. */
  coachLog: Y.Map<Y.Map<unknown>>;
}

export function boardParts(doc: Y.Doc): BoardParts {
  return {
    meta: doc.getMap('meta'),
    cards: doc.getMap('cards'),
    manuscript: doc.getText('manuscript'),
    sources: doc.getMap('sources'),
    links: doc.getMap('links'),
    notes: doc.getMap('notes'),
    images: doc.getMap('images'),
    strokes: doc.getMap('strokes'),
    connections: doc.getMap('connections'),
    guides: doc.getMap('guides'),
    feedback: doc.getMap('feedback'),
    coachLog: doc.getMap('coachLog'),
  };
}

/** Every shared type in the board, for undo tracking. */
export function boardScopes(parts: BoardParts): Y.AbstractType<unknown>[] {
  return Object.values(parts) as Y.AbstractType<unknown>[];
}

// Board units: 48 per inch, so a landscape 3x5 card is 240 x 144.
const UNITS_PER_INCH = 48;

export function cardDimensions(size: CardSize, orientation: Orientation): { width: number; height: number } {
  const [a, b] = size.split('x').map(Number) as [number, number];
  const long = Math.max(a, b) * UNITS_PER_INCH;
  const short = Math.min(a, b) * UNITS_PER_INCH;
  return orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long };
}

// The four framework lanes on a fresh board. Lanes are a guide, not a rule:
// cards can sit anywhere.
export const LANES = { startX: 48, startY: 144, width: 336, gap: 24 } as const;

export function laneX(category: CategoryId): number {
  return LANES.startX + CATEGORY_IDS.indexOf(category) * LANES.width;
}

export interface NewCard {
  id: string;
  type: CardTypeId;
  x: number;
  y: number;
  rotation: number;
  orientation: Orientation;
  size: CardSize;
  text: string;
  annotation: string;
  createdBy: string;
}

export function insertCard(parts: BoardParts, card: NewCard): void {
  const map = new Y.Map<unknown>();
  map.set('id', card.id);
  map.set('type', card.type);
  map.set('x', card.x);
  map.set('y', card.y);
  map.set('rotation', card.rotation);
  map.set('orientation', card.orientation);
  map.set('size', card.size);
  map.set('text', new Y.Text(card.text));
  map.set('annotation', card.annotation);
  map.set('createdBy', card.createdBy);
  parts.cards.set(card.id, map);
}

export function cardText(card: Y.Map<unknown>): Y.Text {
  const text = card.get('text');
  if (!(text instanceof Y.Text)) throw new Error('Card is missing its text');
  return text;
}

/** Where a new card lands if no position is given: under the last card in its lane. */
export function nextLanePosition(parts: BoardParts, type: CardTypeId): { x: number; y: number } {
  const category = getFrameworkCard(type)!.category;
  let bottom = LANES.startY - LANES.gap;
  for (const card of parts.cards.values()) {
    if (getFrameworkCard(card.get('type') as string)?.category !== category) continue;
    const { height } = cardDimensions(card.get('size') as CardSize, card.get('orientation') as Orientation);
    bottom = Math.max(bottom, (card.get('y') as number) + height);
  }
  return { x: laneX(category), y: bottom + LANES.gap };
}

export interface BoardOptions {
  title?: string;
  starterCards?: boolean;
  newId?: () => string;
}

export function createBoard(options: BoardOptions = {}): Y.Doc {
  const doc = new Y.Doc();
  initializeBoard(doc, options);
  return doc;
}

export function isBoardInitialized(doc: Y.Doc): boolean {
  return boardParts(doc).meta.has('schemaVersion');
}

/** Sets up a fresh board inside an existing (empty) doc, such as one just loaded from storage. */
export function initializeBoard(doc: Y.Doc, options: BoardOptions = {}): void {
  if (isBoardInitialized(doc)) return;
  const parts = boardParts(doc);
  const newId = options.newId ?? (() => crypto.randomUUID());
  doc.transact(() => {
    parts.meta.set('schemaVersion', DOC_SCHEMA_VERSION);
    parts.meta.set('title', options.title ?? 'Untitled board');
    parts.meta.set('surface', 'whiteboard' satisfies Surface);
    parts.meta.set('defaultOrientation', 'landscape' satisfies Orientation);
    parts.meta.set('defaultSize', '3x5' satisfies CardSize);
    parts.meta.set('draftForMe', false);
    parts.meta.set('agentMode', 'together' satisfies AgentMode);
    if (options.starterCards === false) return;
    // A new board opens with six cards in their lanes, not all twelve starters.
    for (const type of OPENING_HAND) {
      insertCard(parts, {
        id: newId(),
        type,
        ...nextLanePosition(parts, type),
        rotation: 0,
        orientation: 'landscape',
        size: '3x5',
        text: '',
        annotation: '',
        createdBy: 'system',
      });
    }
  }, SYSTEM_ORIGIN);
}
