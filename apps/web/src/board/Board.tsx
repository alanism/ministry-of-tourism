import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { cardDimensions, type BoardView } from '@writers-board/core';
import { useUi } from '../state/ui';
import { NOTE_SIZE, POLAROID, type Bounds } from './bounds';
import { CameraRig } from './CameraRig';
import { CaptureBridge } from './capture';
import { CardOverview, OVERVIEW_ZOOM } from './CardOverview';
import { Z } from './depth';
import { Guides } from './Guides';
import { ImageItem } from './ImageItem';
import { Ink } from './Ink';
import { Lanes } from './Lanes';
import { Notecard } from './Notecard';
import { StickyNote } from './StickyNote';
import { Surface } from './Surface';
import { Yarn } from './Yarn';
import { Discard } from './Discard';

type Item =
  | { kind: 'card'; id: string; node: BoardView['cards'][number] }
  | { kind: 'note'; id: string; node: BoardView['notes'][number] }
  | { kind: 'image'; id: string; node: BoardView['images'][number] };

function boundsOf(item: Item): Bounds {
  if (item.kind === 'card') return { x: item.node.x, y: item.node.y, ...cardDimensions(item.node.size, item.node.orientation) };
  if (item.kind === 'note') return { x: item.node.x, y: item.node.y, width: NOTE_SIZE, height: NOTE_SIZE };
  const frame = item.node.frame === 'polaroid';
  return {
    x: item.node.x,
    y: item.node.y,
    width: item.node.width + (frame ? POLAROID.side * 2 : 0),
    height: item.node.height + (frame ? POLAROID.side + POLAROID.bottom : 0),
  };
}

/** The view is tracked in coarse cells, so panning only re-renders the board when new cells come into view. */
const CELL = 512;

function useVisibleCells(): string {
  return useUi((s) => {
    const { x, y, zoom, width, height } = s.view;
    const halfW = width / 2 / zoom;
    const halfH = height / 2 / zoom;
    // One screen of margin each way, so items are ready before they scroll in.
    const x0 = Math.floor((x - halfW * 2) / CELL);
    const x1 = Math.ceil((x + halfW * 2) / CELL);
    const y0 = Math.floor((y - halfH * 2) / CELL);
    const y1 = Math.ceil((y + halfH * 2) / CELL);
    return `${x0}:${x1}:${y0}:${y1}`;
  });
}

export function Board({ board }: { board: BoardView }) {
  const showLanes = useUi((s) => s.showLanes);
  const selectedId = useUi((s) => s.selectedId);
  const editingId = useUi((s) => s.editingId);
  const draggingId = useUi((s) => s.draggingId);
  const tool = useUi((s) => s.tool);
  const overview = useUi((s) => s.view.zoom < OVERVIEW_ZOOM);
  const cells = useVisibleCells();

  // Everything on the board shares one stacking order, kept stable so selecting
  // one item doesn't restack (and re-render) all the others; the selected item
  // is raised by its own depth instead.
  const items: Item[] = useMemo(
    () => [
      ...board.images.map((node) => ({ kind: 'image' as const, id: node.id, node })),
      ...board.cards.map((node) => ({ kind: 'card' as const, id: node.id, node })),
      ...board.notes.map((node) => ({ kind: 'note' as const, id: node.id, node })),
    ],
    [board.images, board.cards, board.notes],
  );
  const layers = useMemo(() => new Map(items.map((item, i) => [item.id, i + 1])), [items]);

  // Only items near the view are built. The selected, edited or carried item always is.
  const visible = useMemo(() => {
    const [x0, x1, y0, y1] = cells.split(':').map(Number) as [number, number, number, number];
    return items.filter((item) => {
      if (item.id === selectedId || item.id === editingId || item.id === draggingId) return true;
      if (overview && item.kind === 'card') return false;
      const b = boundsOf(item);
      return b.x + b.width >= x0 * CELL && b.x <= x1 * CELL && b.y + b.height >= y0 * CELL && b.y <= y1 * CELL;
    });
  }, [items, cells, overview, selectedId, editingId, draggingId]);

  return (
    <Canvas
      className={`board-canvas tool-${tool}`}
      orthographic
      flat
      dpr={[1, 2]}
      camera={{ near: 0.1, far: Z.far, position: [0, 0, Z.camera] }}
      gl={{ antialias: true }}
      aria-hidden="true"
      onPointerDownCapture={() => {
        // Save before WebGL selection can unmount the focused text editor.
        const focused = document.activeElement;
        if (focused instanceof HTMLTextAreaElement && focused.closest('.card-editor, .note-editor')) focused.blur();
      }}
    >
      <CameraRig />
      <CaptureBridge />
      <Surface />
      <Ink strokes={board.strokes} />
      {overview && <CardOverview cards={board.cards.filter((c) => c.id !== selectedId || !visible.some((v) => v.id === c.id))} layers={layers} />}
      {/* Text waits on its fonts; the whiteboard and ink show immediately. */}
      <Suspense fallback={null}>
        {showLanes && <Lanes cards={board.cards} />}
        <Guides guides={board.guides} />
        {visible.map((item) =>
          item.kind === 'card' ? (
            <Notecard key={item.id} card={item.node} layer={layers.get(item.id)!} />
          ) : item.kind === 'note' ? (
            <StickyNote key={item.id} note={item.node} layer={layers.get(item.id)!} />
          ) : (
            <ImageItem key={item.id} image={item.node} layer={layers.get(item.id)!} />
          ),
        )}
      </Suspense>
      <Yarn board={board} />
      <Discard board={board} />
    </Canvas>
  );
}
