// Pictures of the board: fit everything in view, render once at a higher
// pixel ratio, and read the canvas back. The view is put back afterwards.
import { useThree, type RootState } from '@react-three/fiber';
import { useEffect } from 'react';
import { cardDimensions, type BoardView } from '@writers-board/core';
import { useUi } from '../state/ui';
import { NOTE_SIZE } from './bounds';

let getState: (() => RootState) | null = null;

/** Mounted inside the Canvas so exports can reach the renderer. */
export function CaptureBridge() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    getState = get;
    // Development only: lets tests and debugging look inside the 3D scene.
    if (import.meta.env.DEV) (window as unknown as { __boardScene?: () => RootState }).__boardScene = get;
    return () => {
      if (getState === get) getState = null;
    };
  }, [get]);
  return null;
}

/** The box around everything on the board, in board units. */
export function boardExtent(board: BoardView): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number, w = 0, h = 0) => {
    xs.push(x, x + w);
    ys.push(y, y + h);
  };
  for (const c of board.cards) {
    const d = cardDimensions(c.size, c.orientation);
    add(c.x, c.y, d.width, d.height);
  }
  for (const n of board.notes) add(n.x, n.y, NOTE_SIZE, NOTE_SIZE);
  for (const i of board.images) add(i.x, i.y, i.width, i.height);
  for (const g of board.guides) if (g.visible) for (const [x, y] of g.points) add(x, y - 40, 0, 120);
  for (const s of board.strokes) for (let k = 0; k < s.points.length; k += 2) add(s.points[k]!, s.points[k + 1]!);
  if (!xs.length) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const frames = (n: number) => new Promise<void>((resolve) => {
  const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
  step(n);
});

/** Renders the whole board (or the current view) to a PNG. */
export async function captureBoard(board: BoardView, options: { whole?: boolean; pixelRatio?: number } = {}): Promise<Blob> {
  const state = getState?.();
  if (!state) throw new Error('Open the board first.');
  const ui = useUi.getState();
  const before = { view: ui.view, selectedId: ui.selectedId, dpr: state.viewport.dpr };
  const extent = options.whole === false ? null : boardExtent(board);
  try {
    ui.select(null);
    if (extent) {
      const pad = 60;
      const zoom = Math.min(4, (ui.view.width - pad * 2) / Math.max(extent.width, 1), (ui.view.height - pad * 2) / Math.max(extent.height, 1));
      ui.setView({ x: extent.x + extent.width / 2, y: extent.y + extent.height / 2, zoom });
    }
    state.setDpr(options.pixelRatio ?? 3);
    // Let the new view lay out and the text settle before reading the pixels.
    await frames(6);
    const { gl, scene, camera } = getState!();
    gl.render(scene, camera);
    return await new Promise<Blob>((resolve, reject) => gl.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('The board could not be captured.'))), 'image/png'));
  } finally {
    state.setDpr(before.dpr);
    useUi.getState().setView(before.view);
    useUi.getState().select(before.selectedId);
  }
}
