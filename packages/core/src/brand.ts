// UnCommon Core brand colors, and the three palettes a board can use:
// Neutral (general use), Blossom (reading and humanities) and Signal (math and
// assessment). Each palette uses only its own colors plus the core neutrals,
// and tints of them toward white.
import type { CategoryId } from './framework/catalog.ts';

export const BRAND = {
  // Core neutrals, in every palette
  black: '#000000',
  deepGrey: '#4D4D4D',
  grey: '#9A9A9A',
  white: '#FFFFFF',
  deepRed: '#CC0000',
  // Blossom
  blossomPink: '#E8A3B4',
  warmTaupe: '#CBB9B0',
  blushMist: '#F9EDEB',
  paperCream: '#FAF7F2',
  // Signal
  signalRed: '#E74B4B',
  scholarlyNavy: '#2F4A6B',
  calmBlue: '#BBD0DC',
  signalCream: '#F7F5EF',
} as const;

/** A brand color mixed toward white: `amount` 0 is the color, 1 is white. */
export function tint(hex: string, amount: number): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

export const PALETTE_IDS = ['neutral', 'blossom', 'signal'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const DEFAULT_PALETTE: PaletteId = 'blossom';

export interface Palette {
  id: PaletteId;
  label: string;
  /** What the guide uses it for. */
  purpose: string;
  board: string;
  /** Index cards and sticky-note text backgrounds. */
  paper: string;
  /** The notebook and typewriter page. */
  page: string;
  ink: string;
  muted: string;
  faint: string;
  /** The one accent: selection, focus, the thing that matters. */
  accent: string;
  /** Soft backgrounds: hovers, chosen rows. */
  wash: string;
  line: string;
  rule: string;
  /** The margin line on an index card. */
  margin: string;
  /** Tape on pictures, the notebook desk. */
  tape: string;
  columns: Record<CategoryId, string>;
  notes: readonly [string, string, string, string];
  inks: readonly [string, string, string, string];
}

const B = BRAND;
export const PALETTES: Record<PaletteId, Palette> = {
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    purpose: 'General use, print and mixed contexts.',
    board: tint(B.grey, 0.9),
    paper: B.white,
    page: B.white,
    ink: B.black,
    muted: B.deepGrey,
    faint: B.grey,
    accent: B.deepRed,
    wash: tint(B.grey, 0.86),
    line: tint(B.grey, 0.7),
    rule: tint(B.grey, 0.62),
    margin: tint(B.deepRed, 0.6),
    tape: tint(B.grey, 0.6),
    columns: { NOUNS: B.black, IDEA: B.deepGrey, FORM: B.grey, VOICE: tint(B.grey, 0.5) },
    notes: [B.white, tint(B.grey, 0.8), tint(B.grey, 0.6), tint(B.grey, 0.35)],
    inks: [B.black, B.deepGrey, B.deepRed, B.grey],
  },
  blossom: {
    id: 'blossom',
    label: 'Blossom',
    purpose: 'Reading and humanities: reflective, expressive, human-centered.',
    board: B.paperCream,
    paper: B.white,
    page: B.paperCream,
    ink: B.black,
    muted: B.deepGrey,
    faint: B.grey,
    accent: B.deepRed,
    wash: B.blushMist,
    line: tint(B.grey, 0.7),
    rule: tint(B.grey, 0.62),
    margin: B.blossomPink,
    tape: B.warmTaupe,
    columns: { NOUNS: B.deepGrey, IDEA: B.grey, FORM: B.warmTaupe, VOICE: B.blossomPink },
    notes: [B.blossomPink, B.blushMist, B.warmTaupe, B.white],
    inks: [B.black, B.deepGrey, B.deepRed, B.blossomPink],
  },
  signal: {
    id: 'signal',
    label: 'Signal',
    purpose: 'Math and assessment: analytical, precise, system-oriented.',
    board: B.signalCream,
    paper: B.white,
    page: B.white,
    ink: B.black,
    muted: B.deepGrey,
    faint: B.grey,
    accent: B.signalRed,
    wash: tint(B.calmBlue, 0.6),
    line: tint(B.grey, 0.7),
    rule: tint(B.calmBlue, 0.25),
    margin: tint(B.signalRed, 0.45),
    tape: B.calmBlue,
    columns: { NOUNS: B.scholarlyNavy, IDEA: B.calmBlue, FORM: B.deepGrey, VOICE: B.grey },
    notes: [B.calmBlue, B.signalCream, B.white, tint(B.scholarlyNavy, 0.75)],
    inks: [B.black, B.scholarlyNavy, B.signalRed, B.deepGrey],
  },
};

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

// Notes and ink store a slot ("the first note color"), written as the Blossom
// color for that slot. Each palette draws its own color in the slot, so
// switching palettes recolors everything already on the board.

/** Stored values: the Blossom colors, which every board before palettes used. */
export const NOTE_COLORS = PALETTES.blossom.notes;
export const INK_COLORS = PALETTES.blossom.inks;

// Colors from before the brand pass, by slot.
const LEGACY_NOTES = ['#FFF3A3', '#FFD6E0', '#CDEFFD', '#D7F5D0', '#FFE2BF'];
const LEGACY_NOTE_SLOT = [0, 0, 1, 2, 1];
const LEGACY_INKS = ['#1D2433', '#1F3A8A', '#C0262D', '#1F7A3F'];
const LEGACY_INK_SLOT = [0, 1, 2, 1];

function slotOf(color: string, lists: readonly (readonly string[])[], legacy: string[], legacySlot: number[]): number {
  const c = color.toUpperCase();
  for (const list of lists) {
    const i = list.findIndex((x) => x.toUpperCase() === c);
    if (i >= 0) return i;
  }
  const j = legacy.indexOf(c);
  return j >= 0 ? legacySlot[j]! : -1;
}

const ALL = Object.values(PALETTES);

export function noteSlot(color: string): number {
  return slotOf(color, ALL.map((p) => p.notes), LEGACY_NOTES, LEGACY_NOTE_SLOT);
}

export function inkSlot(color: string): number {
  return slotOf(color, ALL.map((p) => p.inks), LEGACY_INKS, LEGACY_INK_SLOT);
}

/** The color a note is drawn in, in this palette. */
export function noteColor(stored: string, palette: Palette): string {
  const slot = noteSlot(stored);
  return palette.notes[slot >= 0 ? slot : 0]!;
}

/** The color ink (or yarn) is drawn in, in this palette. Yarn's default red is the accent. */
export function inkColor(stored: string, palette: Palette): string {
  if (stored.toUpperCase() === BRAND.deepRed && palette.id === 'signal') return palette.accent;
  const slot = inkSlot(stored);
  return slot >= 0 ? palette.inks[slot]! : stored;
}

/** A color as it should be stored: any palette's or an old color becomes its slot's Blossom color. */
export function storedNoteColor(color: string): string {
  const slot = noteSlot(color);
  return slot >= 0 ? NOTE_COLORS[slot]! : color.toUpperCase();
}

export function storedInkColor(color: string): string {
  const slot = inkSlot(color);
  return slot >= 0 ? INK_COLORS[slot]! : color.toUpperCase();
}
