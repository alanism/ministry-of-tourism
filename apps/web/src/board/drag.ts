// Shared press-and-drag behavior for everything that sits on the board.
// In yarn mode a press picks an end instead; in marker/eraser mode presses
// pass through to the whiteboard so drawing works over items.
import type { ThreeEvent } from '@react-three/fiber';
import { useState } from 'react';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { isDoubleTap, pinching, trackPointer } from './pointer';

export interface DragOffset {
  dx: number;
  dy: number;
}

export function useBoardDrag(id: string, onDrop: (offset: DragOffset, event: PointerEvent) => void, options: { onDoubleTap?: () => void } = {}) {
  const [drag, setDrag] = useState<DragOffset | null>(null);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || pinching) return;
    const ui = useUi.getState();
    if (ui.tool === 'marker' || ui.tool === 'eraser') return;
    event.stopPropagation();
    if (ui.tool === 'yarn') {
      if (!ui.yarnFrom) ui.setYarnFrom(id);
      else if (ui.yarnFrom !== id) {
        run('connection_create', { from: ui.yarnFrom, to: id });
        ui.setYarnFrom(null);
      }
      return;
    }
    ui.select(id);
    if (ui.editingId === id) return;
    const start = { x: event.clientX, y: event.clientY };
    const zoom = ui.view.zoom;
    let moved = false;
    const offset = (e: PointerEvent) => ({ dx: (e.clientX - start.x) / zoom, dy: (e.clientY - start.y) / zoom });
    const end = () => {
      document.body.style.cursor = '';
      useUi.getState().setDragging(null);
      setDrag(null);
    };
    document.body.style.cursor = 'grabbing';
    trackPointer(
      (e) => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < (e.pointerType === 'mouse' ? 3 : 8)) return;
        if (!moved) useUi.getState().setDragging(id);
        moved = true;
        setDrag(offset(e));
      },
      (e) => {
        if (moved) onDrop(offset(e), e);
        else if (e.pointerType !== 'mouse' && options.onDoubleTap && isDoubleTap(id)) options.onDoubleTap();
        end();
      },
      // A pinch took over: put it back where it was.
      { pointerId: event.pointerId, onCancel: end },
    );
  };

  return { drag, onPointerDown };
}

/** Dropped things settle with a slight, natural tilt. */
export function settleTilt(): number {
  return Math.round((Math.random() * 3 - 1.5) * 10) / 10;
}
