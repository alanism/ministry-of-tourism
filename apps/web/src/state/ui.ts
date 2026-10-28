// View and selection state. This is per-viewer and never part of the board
// document; the camera position is remembered in localStorage for convenience.
import { DEFAULT_PALETTE, type PaletteId, INK_COLORS } from '@writers-board/core';
import { create } from 'zustand';
import type { CategoryId } from '@writers-board/core';

export interface ViewState {
  /** Board coordinates at the center of the screen (y grows downward). */
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/** select: move and edit things; marker: draw ink; eraser: remove ink; yarn: tie two items together. */
export type Tool = 'select' | 'marker' | 'eraser' | 'yarn';

/** A small text box over the board for renaming a guide, a stop or a grid label. */
export interface LabelEdit {
  guideId: string;
  /** 'title', a stop id, 'axis-0'/'axis-1', or 'quadrant-0'..'quadrant-3'. */
  field: string;
  value: string;
  x: number;
  y: number;
}

/** Board is home; the writing modes are for drafting. */
export type Mode = 'board' | 'notebook' | 'typewriter';

export type Dialog = 'settings' | 'reverse' | 'agents' | 'storyboard' | 'boards' | 'artwork' | null;

interface UiState {
  /** Razor lens: show one column, fade the rest. */
  lens: CategoryId | null;
  setLens: (lens: CategoryId | null) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  view: ViewState;
  selectedId: string | null;
  editingId: string | null;
  flipped: Record<string, boolean>;
  showLanes: boolean;
  draggingId: string | null;
  tool: Tool;
  inkColor: string;
  yarnFrom: string | null;
  liveStroke: number[] | null;
  labelEdit: LabelEdit | null;
  /** Cards being dealt by Draw 3: when each one leaves the deck (ms, performance clock). */
  dealing: Record<string, number>;
  /** The open board's palette, mirrored here so the 3D board can follow it. */
  paletteId: PaletteId;
  setPaletteId: (id: PaletteId) => void;
  /** The last things thrown away, for the "thrown away · Undo" note. */
  lastDiscard: { cards: number; notes: number; at: number } | null;
  /** Ids thrown away recently: if they come back (undo), they flatten out again. */
  thrown: Set<string>;
  discarded: (items: { id: string; kind: 'card' | 'note' }[]) => void;
  clearDiscard: () => void;
  deal: (ids: string[]) => void;
  setView: (patch: Partial<ViewState>) => void;
  select: (id: string | null) => void;
  edit: (id: string | null) => void;
  toggleFlip: (id: string) => void;
  setShowLanes: (show: boolean) => void;
  setDragging: (id: string | null) => void;
  setTool: (tool: Tool) => void;
  setInkColor: (color: string) => void;
  setYarnFrom: (id: string | null) => void;
  setLiveStroke: (points: number[] | null) => void;
  setLabelEdit: (edit: LabelEdit | null) => void;
}

const VIEW_KEY = 'writers-board:view';
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

function savedView(): Pick<ViewState, 'x' | 'y' | 'zoom'> {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.zoom)) return saved;
  } catch {
    // Storage can be unavailable; fall back to the default view.
  }
  return homeView(window.innerWidth, window.innerHeight);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set) => ({
  lens: null,
  setLens: (lens) => set({ lens }),
  mode: 'board',
  setMode: (mode) => set({ mode, editingId: null, labelEdit: null }),
  dialog: null,
  setDialog: (dialog) => set({ dialog }),
  view: { ...savedView(), width: 1, height: 1 },
  selectedId: null,
  editingId: null,
  flipped: {},
  dealing: {},
  paletteId: DEFAULT_PALETTE,
  setPaletteId: (paletteId) => set({ paletteId }),
  lastDiscard: null,
  thrown: new Set(),
  discarded: (items) =>
    set((s) => ({
      lastDiscard: { cards: items.filter((i) => i.kind === 'card').length, notes: items.filter((i) => i.kind === 'note').length, at: Date.now() },
      thrown: new Set([...s.thrown, ...items.map((i) => i.id)]),
    })),
  clearDiscard: () => set({ lastDiscard: null }),
  deal: (ids) => {
    const now = performance.now();
    set({ dealing: Object.fromEntries(ids.map((id, i) => [id, now + i * 140])) });
    // Clear the record once the last card has landed.
    setTimeout(() => set({ dealing: {} }), 140 * ids.length + 1200);
  },
  showLanes: true,
  draggingId: null,
  setView: (patch) =>
    set((state) => {
      const view = { ...state.view, ...patch };
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(VIEW_KEY, JSON.stringify({ x: view.x, y: view.y, zoom: view.zoom }));
        } catch {
          // Not saving the camera is harmless.
        }
      }, 300);
      return { view };
    }),
  select: (id) => set((state) => ({ selectedId: id, editingId: state.editingId === id ? id : null })),
  edit: (id) => set({ editingId: id, selectedId: id ?? null }),
  toggleFlip: (id) => set((state) => ({ flipped: { ...state.flipped, [id]: !state.flipped[id] } })),
  setShowLanes: (showLanes) => set({ showLanes }),
  setDragging: (draggingId) => set({ draggingId }),
  tool: 'select',
  inkColor: INK_COLORS[0] as string,
  yarnFrom: null,
  liveStroke: null,
  labelEdit: null,
  setTool: (tool) => set({ tool, yarnFrom: null, liveStroke: null }),
  setInkColor: (inkColor) => set({ inkColor }),
  setYarnFrom: (yarnFrom) => set({ yarnFrom }),
  setLiveStroke: (liveStroke) => set({ liveStroke }),
  setLabelEdit: (labelEdit) => set({ labelEdit }),
}));

/** A view that frames the four framework lanes to the right of the card palette. */
/** Where the board opens: the lanes, readable, starting just below the toolbar. */
export function homeView(width: number, height: number): Pick<ViewState, 'x' | 'y' | 'zoom'> {
  const palette = width > 720 ? 250 : 0;
  const lanesLeft = 36;
  const lanesWidth = 1356;
  // Fit all four lanes when the screen allows, but never so small that a
  // card's question can't be read; narrower screens pan to the rest.
  const zoom = Math.min(1, Math.max(0.75, (width - palette - 48) / lanesWidth));
  const chromeBottom = typeof document === 'undefined' ? 130 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-bottom')) || 130;
  const fits = (width - palette - 48) / lanesWidth >= 0.75;
  const left = palette + 24;
  return {
    zoom,
    x: fits ? lanesLeft + lanesWidth / 2 - (palette + (width - palette) / 2 - width / 2) / zoom : lanesLeft + (width / 2 - left) / zoom,
    // The lane headings sit at y = 56; put them a little below the toolbar.
    y: 56 + (height / 2 - (chromeBottom + 16)) / zoom,
  };
}

/** Board coordinates to screen pixels. */
export function toScreen(view: ViewState, bx: number, by: number) {
  return { left: (bx - view.x) * view.zoom + view.width / 2, top: (by - view.y) * view.zoom + view.height / 2 };
}

/** Screen pixels to board coordinates. */
export function toBoard(view: ViewState, sx: number, sy: number) {
  return { x: view.x + (sx - view.width / 2) / view.zoom, y: view.y + (sy - view.height / 2) / view.zoom };
}
