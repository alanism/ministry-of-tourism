// The brand rule, enforced: Writer's Board uses only UnCommon Core colors
// (the Neutral, Blossom and Signal palettes, each within its own colors), IBM
// Plex for the interface, and the writing pairings' faces. A new off-brand
// color or font fails here, not in review. The vendored Enochian controls keep
// their own atlas materials.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND, INK_COLORS, NOTE_COLORS, PALETTES, tint } from '@writers-board/core';
import { PAIRINGS } from './writing/pairings';

const ROOT = join(import.meta.dirname);
const PALETTE = new Set(Object.values(BRAND).map((c) => c.toLowerCase()));
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
const PALETTE_RGB = new Set(Object.values(BRAND).map(rgb));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'vendor' ? [] : sources(path);
    return /\.(css|tsx?)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const expand = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex).toLowerCase();

describe('brand', () => {
  const files = sources(ROOT).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }));

  it('uses only palette colors in the app', () => {
    const strays: string[] = [];
    for (const { path, text } of files) {
      for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
        // Skip things that only look like colors: `#root`, URL fragments, `#${…}`.
        if (!PALETTE.has(expand(m[0]))) strays.push(`${path}: ${m[0]}`);
      }
      for (const m of text.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
        if (!PALETTE_RGB.has(`${m[1]},${m[2]},${m[3]}`)) strays.push(`${path}: ${m[0]})`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("uses IBM Plex for the interface, and only the pairings' faces for writing", () => {
    const families = new Set(['IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Kalam']);
    for (const p of Object.values(PAIRINGS)) for (const stack of [p.draft, p.hand, p.typewriter]) for (const m of stack.matchAll(/'([^']+)'/g)) families.add(m[1]!);
    const strays: string[] = [];
    for (const { path, text } of files) {
      if (path.endsWith('pairings.ts')) continue;
      for (const m of text.matchAll(/'([A-Z][\w ]+)'(?=[,;\s)])/g)) {
        const family = m[1]!;
        if (!families.has(family) && /font|family/i.test(text.slice(Math.max(0, m.index! - 40), m.index))) strays.push(`${path}: ${family}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it('builds each palette from its own colors, the core neutrals, and tints of them', () => {
    const neutrals = [BRAND.black, BRAND.deepGrey, BRAND.grey, BRAND.white, BRAND.deepRed];
    const own = {
      neutral: [],
      blossom: [BRAND.blossomPink, BRAND.warmTaupe, BRAND.blushMist, BRAND.paperCream],
      signal: [BRAND.signalRed, BRAND.scholarlyNavy, BRAND.calmBlue, BRAND.signalCream],
    } as const;
    for (const palette of Object.values(PALETTES)) {
      const allowed = [...neutrals, ...own[palette.id]];
      const ok = (c: string) => allowed.some((a) => a === c || Array.from({ length: 101 }, (_, i) => tint(a, i / 100)).includes(c));
      const colors = [palette.board, palette.paper, palette.page, palette.ink, palette.muted, palette.faint, palette.accent, palette.wash, palette.line, palette.rule, palette.margin, palette.tape, ...Object.values(palette.columns), ...palette.notes, ...palette.inks];
      expect(colors.filter((c) => !ok(c)), palette.id).toEqual([]);
      expect(new Set(Object.values(palette.columns)).size, `${palette.id} columns`).toBe(4);
    }
    for (const c of [...NOTE_COLORS, ...INK_COLORS]) expect(PALETTE.has(c.toLowerCase())).toBe(true);
  });
});
