// Pointer handling shared by everything on the board: one-pointer drags that
// follow only the finger, pen or mouse that started them, and two-finger
// pinch-to-zoom and pan on touch screens. A pinch cancels any one-finger
// drag in progress, so a second finger never drags a card by accident.
import { MAX_ZOOM, MIN_ZOOM, toBoard, useUi } from '../state/ui';

/** Converts a window pointer position to board coordinates. */
export function clientToBoard(clientX: number, clientY: number): { x: number; y: number } {
  const canvas = document.querySelector('.board-canvas');
  const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return toBoard(useUi.getState().view, clientX - rect.left, clientY - rect.top);
}

interface Tracked {
  cancel: () => void;
}
const tracking = new Set<Tracked>();

/**
 * Follows one pointer until it lifts. Other pointers are ignored. If a pinch
 * starts, `onCancel` runs instead of `onUp` (by default nothing is committed).
 */
export function trackPointer(
  onMove: (e: PointerEvent) => void,
  onUp: (e: PointerEvent) => void,
  options: { pointerId?: number; onCancel?: () => void } = {},
) {
  const mine = (e: PointerEvent) => options.pointerId === undefined || e.pointerId === options.pointerId;
  const move = (e: PointerEvent) => mine(e) && onMove(e);
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelled);
    tracking.delete(entry);
  };
  const up = (e: PointerEvent) => {
    if (!mine(e)) return;
    stop();
    onUp(e);
  };
  const cancelled = (e: PointerEvent) => {
    if (!mine(e)) return;
    stop();
    options.onCancel?.();
  };
  const entry: Tracked = {
    cancel: () => {
      stop();
      options.onCancel?.();
    },
  };
  tracking.add(entry);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelled);
}

/** True while two fingers are on the board. */
export let pinching = false;

/** Once a pen has touched the board, fingers pan and only the pen draws (palm rejection). */
export let penSeen = false;

/** Installs pinch-to-zoom and two-finger pan on the board canvas. Returns a cleanup. */
export function installTouchGestures(element: HTMLElement): () => void {
  const touches = new Map<number, { x: number; y: number }>();
  let last: { cx: number; cy: number; distance: number } | null = null;

  const measure = () => {
    const [a, b] = [...touches.values()];
    if (!a || !b) return null;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinching = true;
      for (const t of [...tracking]) t.cancel();
      last = measure();
    }
  };
  const move = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinching || !last) return;
    const now = measure();
    if (!now) return;
    const { view, setView } = useUi.getState();
    const rect = element.getBoundingClientRect();
    // Keep the board point under the fingers' midpoint under it as they move and spread.
    const anchor = toBoard(view, last.cx - rect.left, last.cy - rect.top);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * (now.distance / last.distance)));
    setView({
      zoom,
      x: anchor.x - (now.cx - rect.left - view.width / 2) / zoom,
      y: anchor.y - (now.cy - rect.top - view.height / 2) / zoom,
    });
    last = now;
  };
  const up = (e: PointerEvent) => {
    if (!touches.delete(e.pointerId)) return;
    if (touches.size < 2) {
      last = null;
      // Stay in the pinch until every finger lifts, so the last finger doesn't start a drag.
      if (touches.size === 0) pinching = false;
    }
  };

  element.addEventListener('pointerdown', down, { capture: true });
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    element.removeEventListener('pointerdown', down, { capture: true });
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}

const lastTap = { id: '', at: 0 };

/** For touch and pen: a second tap on the same thing within a moment is a double-tap. */
export function isDoubleTap(id: string): boolean {
  const now = performance.now();
  const double = lastTap.id === id && now - lastTap.at < 380;
  lastTap.id = double ? '' : id;
  lastTap.at = now;
  return double;
}
