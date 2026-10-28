// Storyboard planning: turn a guide (each stop is a frame) or a set of cards
// (each card is a frame) into frames with art direction, and lay the frames
// out as prints along the guide or under the cards. The writer edits the art
// direction before anything is generated.
import type { BoardView, CardView } from '../commands/board-commands.ts';
import { nearestOnPath, pointAt, samplePath } from '../guides/geometry.ts';
import { cardDimensions } from '../doc/model.ts';

export type FrameStage = 'sketch' | 'color';
export const ASPECT_RATIOS = { '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1, '3:4': 3 / 4 } as const;
export type AspectRatio = keyof typeof ASPECT_RATIOS;

export interface FramePlan {
  key: string;
  caption: string;
  /** What to draw: the writer's ART notes, or the card text. Editable before generating. */
  art: string;
  cardIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FRAME_WIDTH = 240;
const NEAR_GUIDE = 420;
const GAP = 36;

/** ART: lines on a card's back are its art direction; otherwise what the card says. */
export function artFor(card: CardView): string {
  const art = card.annotation
    .split('\n')
    .filter((line) => /^\s*art\s*:/i.test(line))
    .map((line) => line.replace(/^\s*art\s*:\s*/i, '').trim())
    .filter(Boolean);
  if (art.length) return art.join(' ');
  return card.text.trim() ? `${card.name}: ${card.text.trim()}` : '';
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sticky notes are this square on the board. */
export const NOTE_SIZE = 144;

/** Everything already on the board that a new print must not cover. */
function occupied(board: BoardView): Rect[] {
  return [
    ...board.cards.map((c) => ({ x: c.x, y: c.y, ...cardDimensions(c.size, c.orientation) })),
    ...board.notes.map((n) => ({ x: n.x, y: n.y, width: NOTE_SIZE, height: NOTE_SIZE })),
    ...board.images.map((i) => ({ x: i.x, y: i.y, width: i.width, height: i.height })),
  ];
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

/** Moves a print down until it covers nothing, stepping a row at a time. */
function settle(rect: Rect, taken: Rect[]): Rect {
  const next = { ...rect };
  for (let guard = 0; guard < 400 && taken.some((t) => overlaps(next, t, GAP / 2)); guard++) {
    const blocking = taken.filter((t) => overlaps(next, t, GAP / 2));
    next.y = Math.max(...blocking.map((t) => t.y + t.height)) + GAP;
  }
  taken.push(next);
  return next;
}

const frameHeight = (aspect: AspectRatio) => Math.round(FRAME_WIDTH / ASPECT_RATIOS[aspect]);

/** One frame per stop on a path guide, drawn from the cards nearest each stop. */
export function framesFromGuide(board: BoardView, guideId: string, aspect: AspectRatio = '4:3'): FramePlan[] {
  const guide = board.guides.find((g) => g.id === guideId);
  if (!guide || guide.kind !== 'path' || guide.stops.length === 0) return [];
  const samples = samplePath(guide.points);
  const stops = [...guide.stops].sort((a, b) => a.t - b.t);
  const height = frameHeight(aspect);

  // Each nearby card belongs to the stop closest along the guide.
  const byStop = new Map<string, CardView[]>();
  for (const card of board.cards) {
    const near = nearestOnPath(samples, [card.x, card.y]);
    if (near.distance > NEAR_GUIDE) continue;
    let best = stops[0]!;
    for (const stop of stops) if (Math.abs(stop.t - near.t) < Math.abs(best.t - near.t)) best = stop;
    byStop.set(best.id, [...(byStop.get(best.id) ?? []), card]);
  }

  // Prints sit just below the guide, wherever nothing else is: they step down past
  // cards, notes, pictures and each other rather than covering them. Along a
  // flat guide they keep to one row, like a strip of film.
  const points = stops.map((stop) => pointAt(samples, stop.t).point);
  const flat = Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1])) < height;
  const taken = occupied(board);
  // In a strip, crowded stops shift right so frames stay in story order without overlapping.
  const xs: number[] = [];
  for (const p of points) xs.push(Math.max(p[0] - FRAME_WIDTH / 2, xs.length ? xs[xs.length - 1]! + FRAME_WIDTH + GAP : -Infinity));
  let rowY: number | null = null;
  if (flat) {
    const startY = Math.max(...points.map((p) => p[1])) + 90;
    const rects = (y: number) => xs.map((x) => ({ x, y, width: FRAME_WIDTH, height }));
    rowY = startY;
    for (let guard = 0; guard < 400; guard++) {
      const blocking = taken.filter((t) => rects(rowY!).some((r) => overlaps(r, t, GAP / 2)));
      if (!blocking.length) break;
      rowY = Math.max(...blocking.map((t) => t.y + t.height)) + GAP;
    }
  }
  return stops.map((stop, i) => {
    const point = points[i]!;
    const { x, y } = settle({ x: flat ? xs[i]! : point[0] - FRAME_WIDTH / 2, y: rowY ?? point[1] + 90, width: FRAME_WIDTH, height }, taken);
    const cards = byStop.get(stop.id) ?? [];
    const art = cards.map(artFor).filter(Boolean).join(' ');
    return { key: stop.id, caption: stop.label.trim() || `Frame ${i + 1}`, art: art || stop.label.trim(), cardIds: cards.map((c) => c.id), x, y, width: FRAME_WIDTH, height };
  });
}

/** One frame per card, in reading order, in a row below the lowest of them. */
export function framesFromCards(board: BoardView, cardIds: readonly string[], aspect: AspectRatio = '4:3'): FramePlan[] {
  const cards = cardIds.map((id) => board.cards.find((c) => c.id === id)).filter((c): c is CardView => Boolean(c));
  if (cards.length === 0) return [];
  cards.sort((a, b) => a.x - b.x || a.y - b.y);
  const height = frameHeight(aspect);
  const left = Math.min(...cards.map((c) => c.x));
  const top = Math.max(...cards.map((c) => c.y)) + 220;
  return cards.map((card, i) => ({
    key: card.id,
    caption: card.text.trim().split('\n')[0]!.slice(0, 80) || card.name,
    art: artFor(card) || card.name,
    cardIds: [card.id],
    x: left + i * (FRAME_WIDTH + GAP),
    y: top,
    width: FRAME_WIDTH,
    height,
  }));
}

export interface PromptOptions {
  stage: FrameStage;
  /** The writer's look for the whole board ("woodcut, muted greens", "gouache"…). */
  style?: string;
  /** Characters face toward the page turn (left to right), into the book. */
  faceForward?: boolean;
  /** A reference image comes with the request, for consistent characters and look. */
  reference?: boolean;
  /** Coloring an existing sketch: keep its composition. */
  fromSketch?: boolean;
}

export function framePrompt(frame: Pick<FramePlan, 'art' | 'caption'>, options: PromptOptions): string {
  const look =
    options.stage === 'sketch'
      ? 'A rough storyboard sketch in black pencil on white paper: loose gestural lines, simple shapes, light hatching for shadow, no color.'
      : 'A finished color illustration for a storyboard frame.';
  return [
    look,
    `Scene: ${frame.art.trim() || frame.caption}`,
    options.style?.trim() ? `Look: ${options.style.trim()}.` : '',
    options.fromSketch ? 'Color the attached sketch: keep its composition, poses and framing exactly, and add color, light and finish.' : '',
    options.reference && !options.fromSketch ? 'Match the characters, palette and style of the attached reference image.' : '',
    options.faceForward ? 'Characters face and move toward the right side of the frame, toward the page turn.' : '',
    'No words, letters, captions or panel borders in the image.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function estimateCost(frames: number, pricePerImage: number | null): string {
  if (pricePerImage === null) return `${frames} image${frames === 1 ? '' : 's'}; price not listed for this model`;
  const total = frames * pricePerImage;
  return `${frames} image${frames === 1 ? '' : 's'} × $${pricePerImage.toFixed(3)} ≈ $${total.toFixed(2)}`;
}
