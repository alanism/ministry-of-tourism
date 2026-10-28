// The board's palette, for the 3D board (usePalette) and for the stylesheets
// (applyPalette sets the CSS color roles). One source of truth: core's PALETTES.
import { PALETTES, type CategoryId, type Palette, type PaletteId } from '@writers-board/core';
import { useUi } from './ui';

export function usePalette(): Palette {
  return PALETTES[useUi((s) => s.paletteId)];
}

export function currentPalette(): Palette {
  return PALETTES[useUi.getState().paletteId];
}

export function columnColor(palette: Palette, category: string): string {
  return palette.columns[category as CategoryId] ?? palette.faint;
}

export function applyPalette(id: PaletteId) {
  const p = PALETTES[id];
  const root = document.documentElement;
  const roles: Record<string, string> = {
    board: p.board,
    paper: p.paper,
    page: p.page,
    ink: p.ink,
    muted: p.muted,
    faint: p.faint,
    accent: p.accent,
    wash: p.wash,
    line: p.line,
    rule: p.rule,
    margin: p.margin,
    tape: p.tape,
    'on-dark': p.page === '#FFFFFF' ? p.board : p.page,
    'col-nouns': p.columns.NOUNS,
    'col-idea': p.columns.IDEA,
    'col-form': p.columns.FORM,
    'col-voice': p.columns.VOICE,
  };
  for (const [name, value] of Object.entries(roles)) root.style.setProperty(`--${name}`, value);
  root.dataset.palette = id;
  if (useUi.getState().paletteId !== id) useUi.getState().setPaletteId(id);
}
