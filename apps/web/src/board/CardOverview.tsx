// Zoomed far out, cards are too small to read, so every card is drawn at once
// as paper, its column's band and a few strokes for its writing: four draw
// calls for the whole board. Cards can still be picked up and moved, and
// double-clicking one zooms in to it.
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cardDimensions, type CardView } from '@writers-board/core';
import { latestBoard, run } from '../state/board';
import { useUi } from '../state/ui';
import { columnColor, usePalette } from '../state/palette';
import { shade } from './assets';
import { snapToGuides } from './bounds';
import { itemZ } from './depth';
import { settleTilt } from './drag';
import { clientToBoard, pinching, trackPointer } from './pointer';

/** Below this zoom the board shows the overview instead of full cards. */
export const OVERVIEW_ZOOM = 0.3;

const BAND = 8;
const MAX_STROKES = 3;

const unit = new THREE.PlaneGeometry(1, 1);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const zAxis = new THREE.Vector3(0, 0, 1);
const color = new THREE.Color();

function place(mesh: THREE.InstancedMesh, i: number, cx: number, cy: number, z: number, w: number, h: number, angle: number, ox = 0, oy = 0) {
  // Offsets are in the card's own frame, so bands and strokes tilt with it.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  position.set(cx + ox * cos - oy * sin, cy + ox * sin + oy * cos, z);
  rotation.setFromAxisAngle(zAxis, angle);
  scale.set(w, h, 1);
  mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
}

export function CardOverview({ cards, layers }: { cards: CardView[]; layers: Map<string, number> }) {
  const edges = useRef<THREE.InstancedMesh>(null);
  const paper = useRef<THREE.InstancedMesh>(null);
  const bands = useRef<THREE.InstancedMesh>(null);
  const strokes = useRef<THREE.InstancedMesh>(null);
  const selectedId = useUi((s) => s.selectedId);
  const lens = useUi((s) => s.lens);
  const palette = usePalette();
  const moving = useRef<{ index: number; dx: number; dy: number } | null>(null);
  const capacity = useMemo(() => Math.max(64, 2 ** Math.ceil(Math.log2(cards.length + 1))), [cards.length]);

  const draw = () => {
    const p = paper.current;
    const b = bands.current;
    const s = strokes.current;
    const e = edges.current;
    if (!p || !b || !s || !e) return;
    const PAPER = new THREE.Color(palette.paper);
    const BOARD = new THREE.Color(palette.board);
    const INK = new THREE.Color(palette.faint);
    const SELECTED = new THREE.Color(palette.accent);
    const EDGE = new THREE.Color(palette.line);
    let strokeCount = 0;
    cards.forEach((card, i) => {
      const { width: w, height: h } = cardDimensions(card.size, card.orientation);
      const move = moving.current?.index === i ? moving.current : null;
      const cx = card.x + w / 2 + (move?.dx ?? 0);
      const cy = -(card.y + h / 2 + (move?.dy ?? 0));
      const angle = move ? 0 : (-card.rotation * Math.PI) / 180;
      const z = itemZ(layers.get(card.id) ?? i + 1, { lifted: Boolean(move), selected: card.id === selectedId });
      const faded = lens !== null && lens !== card.category;
      const selected = card.id === selectedId;

      // A thin darker edge (blue when selected) so paper stands out from the whiteboard.
      place(e, i, cx, cy, z - 0.5, w + (selected ? 10 : 3), h + (selected ? 10 : 3), angle);
      e.setColorAt(i, color.copy(selected ? SELECTED : EDGE).lerp(BOARD, faded ? 0.75 : 0));
      place(p, i, cx, cy, z, w, h, angle);
      p.setColorAt(i, color.copy(PAPER).lerp(BOARD, faded ? 0.75 : 0));
      place(b, i, cx, cy, z + 1, w, BAND, angle, 0, h / 2 - BAND / 2);
      b.setColorAt(i, color.set(shade(columnColor(palette, card.category), 0.12)).lerp(BOARD, faded ? 0.75 : 0));

      // A stroke per line of writing, up to three, so written cards read as written.
      const lines = Math.min(MAX_STROKES, Math.ceil(card.text.trim().length / 40));
      for (let l = 0; l < lines; l++) {
        const last = l === lines - 1;
        const len = (w - 28) * (last ? 0.6 : 1);
        place(s, strokeCount, cx, cy, z + 1, len, 5, angle, -w / 2 + 14 + len / 2, h / 2 - 34 - l * 18);
        s.setColorAt(strokeCount, color.copy(INK).lerp(BOARD, faded ? 0.75 : 0));
        strokeCount++;
      }
    });
    e.count = cards.length;
    p.count = cards.length;
    b.count = cards.length;
    s.count = strokeCount;
    for (const mesh of [e, p, b, s]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  useLayoutEffect(draw);
  // While a card is carried, redraw each frame.
  useFrame(() => moving.current && draw());

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || pinching || event.instanceId === undefined) return;
    const ui = useUi.getState();
    if (ui.tool !== 'select') return;
    event.stopPropagation();
    const index = event.instanceId;
    const card = cards[index];
    if (!card) return;
    ui.select(card.id);
    const start = clientToBoard(event.clientX, event.clientY);
    let moved = false;
    trackPointer(
      (e) => {
        const p = clientToBoard(e.clientX, e.clientY);
        if (!moved && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 3) return;
        moved = true;
        moving.current = { index, dx: p.x - start.x, dy: p.y - start.y };
      },
      (e) => {
        const move = moving.current;
        moving.current = null;
        if (!moved || !move) return draw();
        const { width, height } = cardDimensions(card.size, card.orientation);
        const target = { x: Math.round(card.x + move.dx), y: Math.round(card.y + move.dy), width, height };
        const board = latestBoard();
        const snapped = board && !e.altKey ? snapToGuides(board, target) : null;
        run('card_move', { id: card.id, ...(snapped ?? { x: target.x, y: target.y }), rotation: settleTilt() });
      },
      { pointerId: event.pointerId, onCancel: () => ((moving.current = null), draw()) },
    );
  };

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    const card = event.instanceId !== undefined ? cards[event.instanceId] : undefined;
    if (!card) return;
    event.stopPropagation();
    const { width, height } = cardDimensions(card.size, card.orientation);
    useUi.getState().setView({ x: card.x + width / 2, y: card.y + height / 2, zoom: 1 });
  };

  return (
    <group>
      <instancedMesh key={`edges-${capacity}`} ref={edges} args={[unit, undefined, capacity]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh key={`paper-${capacity}`} ref={paper} args={[unit, undefined, capacity]} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh key={`bands-${capacity}`} ref={bands} args={[unit, undefined, capacity]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh key={`strokes-${capacity}`} ref={strokes} args={[unit, undefined, capacity * MAX_STROKES]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
    </group>
  );
}
