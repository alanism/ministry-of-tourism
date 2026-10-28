// Throwing things away: when a card or sticky note leaves the board (whoever
// removed it), it crumples into a paper ball where it was and is tossed in an
// arc into the bin in the view corner. Undo brings it back, flattening out.
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cardDimensions, noteColor, type BoardView } from '@writers-board/core';
import { NOTE_SIZE } from './bounds';
import { clientToBoard } from './pointer';
import { Z } from './depth';
import { columnColor, currentPalette } from '../state/palette';
import { useUi } from '../state/ui';
import { soundsOn } from '../ui/Switch';
import { boardSounds } from '../writing/sounds';

const CRUMPLE_MS = 240;
const TOSS_MS = 520;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Throw {
  key: string;
  kind: 'card' | 'note';
  from: { x: number; y: number; size: number };
  to: { x: number; y: number };
  paper: string;
  band: string;
  at: number;
}

/** A crumpled ball: an icosphere pushed in and out at random, shaded by its folds. */
function crumpledBall(paper: string, band: string): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const pos = geometry.attributes.position!;
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    // The same corner moves the same way on every face, so the ball stays closed.
    let push = seen.get(key);
    if (push === undefined) seen.set(key, (push = 0.72 + Math.random() * 0.42));
    pos.setXYZ(i, pos.getX(i) * push, pos.getY(i) * push, pos.getZ(i) * push);
  }
  geometry.computeVertexNormals();
  // Flat faces, lit from the upper left: folds read as light and shadow without scene lights.
  const light = new THREE.Vector3(-0.5, 0.6, 0.8).normalize();
  const normal = new THREE.Vector3();
  const base = new THREE.Color(paper);
  const stripe = new THREE.Color(band);
  const colors: number[] = [];
  const nrm = geometry.attributes.normal!;
  for (let i = 0; i < pos.count; i += 3) {
    normal.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).normalize();
    const shade = 0.62 + 0.38 * Math.max(0, normal.dot(light));
    // A few faces keep a scrap of the card's colored band.
    const color = (i / 3) % 11 === 0 ? stripe.clone() : base.clone();
    color.multiplyScalar(shade);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function Ball({ t, onDone }: { t: Throw; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => crumpledBall(t.paper, t.band), [t.paper, t.band]);
  const spin = useMemo(() => new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 8 - 4), []);
  const done = useRef(false);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || done.current) return;
    const elapsed = performance.now() - t.at;
    const radius = 26;
    if (elapsed < CRUMPLE_MS) {
      // Scrunching up where it lay.
      const k = elapsed / CRUMPLE_MS;
      const eased = 1 - (1 - k) ** 2;
      mesh.position.set(t.from.x, -t.from.y, Z.lifted);
      mesh.scale.setScalar(t.from.size * (1 - eased) + radius * eased);
      mesh.scale.z = mesh.scale.x * (0.15 + 0.85 * eased);
      mesh.rotation.set(spin.x * k * 0.3, spin.y * k * 0.3, spin.z * k * 0.3);
      return;
    }
    const k = Math.min(1, (elapsed - CRUMPLE_MS) / TOSS_MS);
    // A thrown arc: up first, then down into the bin.
    const x = t.from.x + (t.to.x - t.from.x) * k;
    // Arc high enough to read as a throw, but never up under the toolbar.
    const { view } = useUi.getState();
    const toolbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-bottom')) || 130;
    const ceiling = view.y - view.height / 2 / view.zoom + (toolbar + 24) / view.zoom;
    const lift = Math.max(30, Math.min(Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y) * 0.35 + 120, Math.min(t.from.y, t.to.y) - ceiling));
    const y = t.from.y + (t.to.y - t.from.y) * k - lift * 4 * k * (1 - k);
    mesh.position.set(x, -y, Z.lifted);
    mesh.scale.setScalar(radius * (1 - 0.35 * k));
    mesh.rotation.x += spin.x * 0.016;
    mesh.rotation.y += spin.y * 0.016;
    mesh.rotation.z += spin.z * 0.016;
    if (k >= 1) {
      done.current = true;
      if (soundsOn()) boardSounds.binLand();
      document.querySelector('.trash-bin')?.animate(
        [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(2px) rotate(-6deg)' }, { transform: 'translateY(0) rotate(4deg)' }, { transform: 'none' }],
        { duration: 320, easing: 'ease-out' },
      );
      onDone();
    }
  });

  return (
    <mesh ref={ref} geometry={geometry} raycast={() => null}>
      <meshBasicMaterial vertexColors />
    </mesh>
  );
}

/** Where the bin is, in board coordinates. */
function binPoint(): { x: number; y: number } {
  const bin = document.querySelector('.trash-bin')?.getBoundingClientRect();
  if (bin) return clientToBoard(bin.left + bin.width / 2, bin.top + bin.height / 2);
  const { view } = useUi.getState();
  return { x: view.x + view.width / 2 / view.zoom, y: view.y + view.height / 2 / view.zoom };
}

export function Discard({ board }: { board: BoardView }) {
  const [throws, setThrows] = useState<Throw[]>([]);
  const last = useRef<Map<string, Omit<Throw, 'key' | 'to' | 'at'>>>(new Map());

  // Compare with the last snapshot: anything gone was thrown away.
  useLayoutEffect(() => {
    const palette = currentPalette();
    const now = new Map<string, Omit<Throw, 'key' | 'to' | 'at'>>();
    for (const c of board.cards) {
      const { width, height } = cardDimensions(c.size, c.orientation);
      now.set(c.id, { kind: 'card', from: { x: c.x + width / 2, y: c.y + height / 2, size: width / 2 }, paper: palette.paper, band: columnColor(palette, c.category) });
    }
    for (const n of board.notes) {
      const paper = noteColor(n.color, palette);
      now.set(n.id, { kind: 'note', from: { x: n.x + NOTE_SIZE / 2, y: n.y + NOTE_SIZE / 2, size: NOTE_SIZE / 2 }, paper, band: paper });
    }
    const gone = [...last.current.entries()].filter(([id]) => !now.has(id));
    last.current = now;
    if (!gone.length) return;
    useUi.getState().discarded(gone.map(([id, g]) => ({ id, kind: g.kind })));
    if (REDUCED_MOTION) return;
    if (soundsOn()) boardSounds.crumple();
    const to = binPoint();
    const at = performance.now();
    setThrows((list) => [...list, ...gone.map(([id, g], i) => ({ ...g, key: `${id}:${at}`, to, at: at + i * 90 }))]);
  }, [board.cards, board.notes]);

  return (
    <>
      {throws.map((t) => (
        <Ball key={t.key} t={t} onDone={() => setThrows((list) => list.filter((x) => x.key !== t.key))} />
      ))}
    </>
  );
}
