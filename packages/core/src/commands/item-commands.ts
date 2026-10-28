// Phase 2 commands: sticky notes, images, marker ink, yarn/arrows and guides.
import * as Y from 'yjs';
import { z } from 'zod';
import { GUIDE_PRESETS, getGuidePreset, type GuideKind, type GuideStop, type Point } from '../guides/presets.ts';
import type { BoardParts } from '../doc/model.ts';
import { CommandError, defineCommand, type AnyCommand, type CommandContext } from './define.ts';

const id = z.string().min(1);
const coordinate = z.number().finite();
const rotation = z.number().min(-15).max(15);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const point = z.tuple([coordinate, coordinate]);

import { BRAND, INK_COLORS, NOTE_COLORS, storedInkColor, storedNoteColor } from '../brand.ts';
export { INK_COLORS, NOTE_COLORS };

// A color is stored as its slot: any palette's color for that slot, in any
// case, or a color from before the brand pass, is accepted and kept as the
// slot's stored color. So agents can pass the colors they see on screen.
const noteColor = z.preprocess((value) => (typeof value === 'string' ? storedNoteColor(value) : value), z.enum(NOTE_COLORS as unknown as [string, ...string[]]));
const inkColor = z.preprocess((value) => (typeof value === 'string' ? storedInkColor(value) : value), z.enum(INK_COLORS as unknown as [string, ...string[]]));

function find(map: Y.Map<Y.Map<unknown>>, itemId: string, what: string): Y.Map<unknown> {
  const item = map.get(itemId);
  if (!item) throw new CommandError('not_found', `No ${what} with id ${itemId}`);
  return item;
}

function setAll(map: Y.Map<unknown>, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) if (value !== undefined) map.set(key, value);
}

function itemExists(parts: BoardParts, itemId: string): boolean {
  return parts.cards.has(itemId) || parts.notes.has(itemId) || parts.images.has(itemId);
}

function insert(map: Y.Map<Y.Map<unknown>>, ctx: CommandContext, values: Record<string, unknown>): string {
  const itemId = ctx.newId();
  const item = new Y.Map<unknown>();
  setAll(item, { id: itemId, ...values, createdBy: ctx.actor.id });
  map.set(itemId, item);
  return itemId;
}

// Sticky notes ---------------------------------------------------------------

export const noteCreate = defineCommand({
  name: 'note_create',
  title: 'Add a sticky note',
  description: 'Adds a 3x3 sticky note with free text anywhere on the board. Notes are not framework cards.',
  access: 'write',
  input: z.object({
    x: coordinate,
    y: coordinate,
    text: z.string().max(2_000).optional(),
    color: noteColor.optional(),
    rotation: rotation.optional(),
  }),
  run: (ctx, input) => {
    const noteId = ctx.newId();
    const note = new Y.Map<unknown>();
    setAll(note, {
      id: noteId,
      x: input.x,
      y: input.y,
      rotation: input.rotation ?? 0,
      color: input.color ?? NOTE_COLORS[0],
      text: new Y.Text(input.text ?? ''),
      createdBy: ctx.actor.id,
    });
    ctx.parts.notes.set(noteId, note);
    return { id: noteId };
  },
});

export const noteUpdate = defineCommand({
  name: 'note_update',
  title: 'Change a sticky note',
  description: 'Moves, tilts, recolors or rewrites a sticky note.',
  access: 'write',
  input: z.object({
    id,
    x: coordinate.optional(),
    y: coordinate.optional(),
    rotation: rotation.optional(),
    color: noteColor.optional(),
    text: z.string().max(2_000).optional(),
  }),
  run: (ctx, input) => {
    const note = find(ctx.parts.notes, input.id, 'note');
    setAll(note, { x: input.x, y: input.y, rotation: input.rotation, color: input.color });
    if (input.text !== undefined) {
      const text = note.get('text') as Y.Text;
      text.delete(0, text.length);
      text.insert(0, input.text);
    }
    return { id: input.id };
  },
});

export const noteDelete = defineCommand({
  name: 'note_delete',
  title: 'Remove a sticky note',
  description: 'Removes a sticky note and any yarn tied to it. The writer can undo it.',
  access: 'sensitive',
  input: z.object({ id }),
  run: (ctx, input) => {
    find(ctx.parts.notes, input.id, 'note');
    removeConnectionsTo(ctx.parts, input.id);
    ctx.parts.notes.delete(input.id);
    return { id: input.id };
  },
});

// Images -----------------------------------------------------------------------

const artworkSource = z.object({
  assetId: z.string().min(1).max(256),
  styleId: z.string().min(1).max(160),
  sourceUrl: z.string().url(),
  originalUrl: z.string().url().optional(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

export const imagePlace = defineCommand({
  name: 'image_place',
  title: 'Place an image',
  description:
    'Places an image on the board. The image bytes are stored separately by the app under blobId (a SHA-256 hex hash); this records where it sits and how it is framed.',
  access: 'write',
  input: z.object({
    blobId: z.string().regex(/^[0-9a-f]{64}$/),
    x: coordinate,
    y: coordinate,
    width: z.number().positive().max(4_000),
    height: z.number().positive().max(4_000),
    rotation: rotation.optional(),
    frame: z.enum(['polaroid', 'print', 'sticker']).optional(),
    artwork: artworkSource.optional(),
    caption: z.string().max(300).optional(),
    art: z.string().max(4000).optional().describe('For storyboard frames: the art direction the picture was made from.'),
    stage: z.enum(['sketch', 'color']).optional().describe('For storyboard frames: a black-and-white sketch or a colored frame.'),
  }),
  run: (ctx, input) => ({
    id: insert(ctx.parts.images, ctx, {
      blobId: input.blobId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      rotation: input.rotation ?? 0,
      frame: input.frame ?? 'polaroid',
      caption: input.caption ?? '',
      ...(input.artwork ? { artwork: input.artwork } : {}),
      ...(input.art !== undefined ? { art: input.art } : {}),
      ...(input.stage ? { stage: input.stage } : {}),
    }),
  }),
});

export const imageUpdate = defineCommand({
  name: 'image_update',
  title: 'Change an image',
  description: 'Moves, resizes, tilts, reframes or recaptions an image, or swaps in new picture bytes (a regenerated or colored storyboard frame).',
  access: 'write',
  input: z.object({
    id,
    blobId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    art: z.string().max(4000).optional(),
    stage: z.enum(['sketch', 'color']).optional(),
    x: coordinate.optional(),
    y: coordinate.optional(),
    width: z.number().positive().max(4_000).optional(),
    height: z.number().positive().max(4_000).optional(),
    rotation: rotation.optional(),
    frame: z.enum(['polaroid', 'print', 'sticker']).optional(),
    caption: z.string().max(300).optional(),
  }),
  run: (ctx, { id: imageId, ...changes }) => {
    setAll(find(ctx.parts.images, imageId, 'image'), changes);
    return { id: imageId };
  },
});

export const imageDelete = defineCommand({
  name: 'image_delete',
  title: 'Remove an image',
  description: 'Removes an image and any yarn tied to it. The writer can undo it.',
  access: 'sensitive',
  input: z.object({ id }),
  run: (ctx, input) => {
    find(ctx.parts.images, input.id, 'image');
    removeConnectionsTo(ctx.parts, input.id);
    ctx.parts.images.delete(input.id);
    return { id: input.id };
  },
});

// Marker ink -------------------------------------------------------------------

export const strokeAdd = defineCommand({
  name: 'stroke_add',
  title: 'Draw with the marker',
  description: 'Adds a marker stroke: a list of board points [x1, y1, x2, y2, ...].',
  access: 'write',
  input: z.object({
    points: z
      .array(coordinate)
      .min(4)
      .max(20_000)
      .refine((p) => p.length % 2 === 0, { message: 'points must be x, y pairs' }),
    color: inkColor.optional(),
    width: z.number().min(1).max(24).optional(),
  }),
  run: (ctx, input) => ({
    id: insert(ctx.parts.strokes, ctx, { points: input.points, color: input.color ?? INK_COLORS[0], width: input.width ?? 3 }),
  }),
});

export const strokeDelete = defineCommand({
  name: 'stroke_delete',
  title: 'Erase a marker stroke',
  description: 'Erases one marker stroke.',
  access: 'write',
  input: z.object({ id }),
  run: (ctx, input) => {
    find(ctx.parts.strokes, input.id, 'stroke');
    ctx.parts.strokes.delete(input.id);
    return { id: input.id };
  },
});

// Yarn and arrows --------------------------------------------------------------

export function removeConnectionsTo(parts: BoardParts, itemId: string) {
  for (const [connectionId, connection] of [...parts.connections.entries()]) {
    if (connection.get('from') === itemId || connection.get('to') === itemId) parts.connections.delete(connectionId);
  }
}

export const connectionCreate = defineCommand({
  name: 'connection_create',
  title: 'Tie two items together',
  description: 'Runs yarn (or draws an arrow) between two cards, notes or images.',
  access: 'write',
  input: z
    .object({ from: id, to: id, style: z.enum(['yarn', 'arrow']).optional(), color: color.optional() })
    .refine((i) => i.from !== i.to, { message: 'from and to must differ' }),
  run: (ctx, input) => {
    for (const end of [input.from, input.to]) {
      if (!itemExists(ctx.parts, end)) throw new CommandError('not_found', `No card, note or image with id ${end}`);
    }
    return {
      id: insert(ctx.parts.connections, ctx, {
        from: input.from,
        to: input.to,
        style: input.style ?? 'yarn',
        color: input.color ?? BRAND.deepRed,
      }),
    };
  },
});

export const connectionDelete = defineCommand({
  name: 'connection_delete',
  title: 'Cut a connection',
  description: 'Removes one piece of yarn or one arrow.',
  access: 'write',
  input: z.object({ id }),
  run: (ctx, input) => {
    find(ctx.parts.connections, input.id, 'connection');
    ctx.parts.connections.delete(input.id);
    return { id: input.id };
  },
});

// Guides -----------------------------------------------------------------------

const stopsSchema = z.array(z.object({ id, t: z.number().min(0).max(1), label: z.string().max(120) })).max(60);

export const guideCreate = defineCommand({
  name: 'guide_create',
  title: 'Add a guide',
  description: `Adds a guide to the board with its top-left at (x, y). Presets: ${GUIDE_PRESETS.map((p) => p.id).join(', ')}. Guides only suggest; cards never have to follow them.`,
  access: 'write',
  input: z.object({ preset: z.string(), x: coordinate, y: coordinate, scale: z.number().min(0.2).max(5).optional() }),
  run: (ctx, input) => {
    const preset = getGuidePreset(input.preset);
    if (!preset) throw new CommandError('invalid_input', `Unknown preset ${input.preset}`);
    const scale = input.scale ?? 1;
    const minY = Math.min(...preset.points.map((p) => p[1]));
    const points: Point[] = preset.points.map(([px, py]) => [input.x + px * scale, input.y + (py - minY) * scale]);
    const stops: GuideStop[] = preset.stops.map((stop) => ({ id: ctx.newId(), ...stop }));
    return {
      id: insert(ctx.parts.guides, ctx, {
        preset: preset.id,
        kind: preset.kind,
        title: preset.title,
        points,
        stops,
        axes: preset.axes,
        quadrants: preset.quadrants,
        visible: true,
        locked: false,
      }),
    };
  },
});

export const guideUpdate = defineCommand({
  name: 'guide_update',
  title: 'Change a guide',
  description:
    'Stretches or bends a guide (new control points), edits its stops, renames it, or shows, hides, locks or unlocks it. A locked guide only accepts visible/locked changes.',
  access: 'write',
  input: z.object({
    id,
    points: z.array(point).min(2).max(40).optional(),
    stops: stopsSchema.optional(),
    title: z.string().min(1).max(120).optional(),
    axes: z.tuple([z.string().max(60), z.string().max(60)]).optional(),
    quadrants: z.tuple([z.string().max(60), z.string().max(60), z.string().max(60), z.string().max(60)]).optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
  }),
  run: (ctx, { id: guideId, ...changes }) => {
    const guide = find(ctx.parts.guides, guideId, 'guide');
    const shapeChange = ['points', 'stops', 'title', 'axes', 'quadrants'].some((k) => changes[k as keyof typeof changes] !== undefined);
    if (guide.get('locked') === true && changes.locked !== false && shapeChange) {
      throw new CommandError('invalid_input', 'This guide is locked; unlock it first');
    }
    if (changes.points && guide.get('kind') === 'quadrant' && changes.points.length !== 2) {
      throw new CommandError('invalid_input', 'A grid guide takes two corner points');
    }
    setAll(guide, changes);
    return { id: guideId };
  },
});

export const guideDelete = defineCommand({
  name: 'guide_delete',
  title: 'Remove a guide',
  description: 'Removes a guide. Cards placed along it stay where they are.',
  access: 'sensitive',
  input: z.object({ id }),
  run: (ctx, input) => {
    find(ctx.parts.guides, input.id, 'guide');
    ctx.parts.guides.delete(input.id);
    return { id: input.id };
  },
});

export const guidesSetVisible = defineCommand({
  name: 'guides_set_visible',
  title: 'Show or hide all guides',
  description: 'Shows or hides every guide at once.',
  access: 'write',
  input: z.object({ visible: z.boolean() }),
  run: (ctx, input) => {
    for (const guide of ctx.parts.guides.values()) guide.set('visible', input.visible);
    return { visible: input.visible };
  },
});

export interface NoteView {
  id: string;
  x: number;
  y: number;
  rotation: number;
  color: string;
  text: string;
  createdBy: string;
}

export interface ImageView {
  id: string;
  blobId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  frame: 'polaroid' | 'print' | 'sticker';
  caption: string;
  artwork?: z.infer<typeof artworkSource>;
  /** Storyboard frames: the art direction and stage they were made with. */
  art?: string;
  stage?: 'sketch' | 'color';
  createdBy: string;
}

export interface StrokeView {
  id: string;
  points: number[];
  color: string;
  width: number;
  createdBy: string;
}

export interface ConnectionView {
  id: string;
  from: string;
  to: string;
  style: 'yarn' | 'arrow';
  color: string;
}

export interface GuideView {
  id: string;
  preset: string;
  kind: GuideKind;
  title: string;
  points: Point[];
  stops: GuideStop[];
  axes?: [string, string];
  quadrants?: [string, string, string, string];
  visible: boolean;
  locked: boolean;
}

const plain = (map: Y.Map<unknown>) => Object.fromEntries(map.entries());

export function readItems(parts: BoardParts) {
  return {
    notes: [...parts.notes.values()].map((n) => ({ ...plain(n), text: (n.get('text') as Y.Text).toString() }) as NoteView),
    images: [...parts.images.values()].map((i) => plain(i) as unknown as ImageView),
    strokes: [...parts.strokes.values()].map((s) => plain(s) as unknown as StrokeView),
    connections: [...parts.connections.values()].map((c) => plain(c) as unknown as ConnectionView),
    guides: [...parts.guides.values()].map((g) => plain(g) as unknown as GuideView),
  };
}

export const ITEM_COMMANDS: readonly AnyCommand[] = [
  noteCreate,
  noteUpdate,
  noteDelete,
  imagePlace,
  imageUpdate,
  imageDelete,
  strokeAdd,
  strokeDelete,
  connectionCreate,
  connectionDelete,
  guideCreate,
  guideUpdate,
  guideDelete,
  guidesSetVisible,
];
