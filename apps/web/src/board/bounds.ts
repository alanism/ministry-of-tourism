// Where things sit on the board, for yarn ends and guide snapping.
import { cardDimensions, nearestOnPath, samplePath, type BoardView, type Point } from '@writers-board/core';

export const NOTE_SIZE = 144;
/** Polaroid border: thin on three sides, deep at the bottom for a caption. */
export const POLAROID = { side: 10, bottom: 34 };

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function itemBounds(board: BoardView, id: string): Bounds | null {
  const card = board.cards.find((c) => c.id === id);
  if (card) return { x: card.x, y: card.y, ...cardDimensions(card.size, card.orientation) };
  const note = board.notes.find((n) => n.id === id);
  if (note) return { x: note.x, y: note.y, width: NOTE_SIZE, height: NOTE_SIZE };
  const image = board.images.find((i) => i.id === id);
  if (image) {
    const frame = image.frame === 'polaroid';
    return {
      x: image.x,
      y: image.y,
      width: image.width + (frame ? POLAROID.side * 2 : 0),
      height: image.height + (frame ? POLAROID.side + POLAROID.bottom : 0),
    };
  }
  return null;
}

export function itemKind(board: BoardView, id: string): 'card' | 'note' | 'image' | 'guide' | 'connection' | 'stroke' | null {
  if (board.cards.some((c) => c.id === id)) return 'card';
  if (board.notes.some((n) => n.id === id)) return 'note';
  if (board.images.some((i) => i.id === id)) return 'image';
  if (board.guides.some((g) => g.id === id)) return 'guide';
  if (board.connections.some((c) => c.id === id)) return 'connection';
  if (board.strokes.some((s) => s.id === id)) return 'stroke';
  return null;
}

const SNAP_DISTANCE = 32;

/**
 * Guides pull gently: an item dropped near a visible path guide centers on it.
 * Hold Alt while dropping to skip the pull. Returns the new top-left, or null.
 */
export function snapToGuides(board: BoardView, bounds: Bounds): { x: number; y: number } | null {
  const center: Point = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  let best: { point: Point; distance: number } | null = null;
  for (const guide of board.guides) {
    if (!guide.visible || guide.kind !== 'path') continue;
    const near = nearestOnPath(samplePath(guide.points), center);
    if (near.distance < SNAP_DISTANCE && (!best || near.distance < best.distance)) best = near;
  }
  if (!best) return null;
  return { x: Math.round(best.point[0] - bounds.width / 2), y: Math.round(best.point[1] - bounds.height / 2) };
}
