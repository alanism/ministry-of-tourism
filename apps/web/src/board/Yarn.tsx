// Yarn (with a little sag and a pin at each end) or a straight arrow between
// two items. In yarn mode, pressing a connection cuts it.
import { inkColor } from '@writers-board/core';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { BoardView, ConnectionView } from '@writers-board/core';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { itemBounds } from './bounds';
import { Z } from './depth';
import { usePalette } from '../state/palette';

function center(board: BoardView, id: string): [number, number] | null {
  const b = itemBounds(board, id);
  return b ? [b.x + b.width / 2, b.y + b.height / 2] : null;
}

function Pin({ at, color }: { at: [number, number]; color: string }) {
  return (
    <mesh position={[at[0], -at[1], 1]}>
      <circleGeometry args={[6, 20]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function Connection({ board, connection }: { board: BoardView; connection: ConnectionView }) {
  const palette = usePalette();
  const a = center(board, connection.from);
  const b = center(board, connection.to);
  if (!a || !b) return null;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const points: [number, number, number][] = [];
  const sag = connection.style === 'yarn' ? Math.min(60, length * 0.08) : 0;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    points.push([a[0] + (b[0] - a[0]) * t, -(a[1] + (b[1] - a[1]) * t + sag * 4 * t * (1 - t)), 0]);
  }
  const cut = (event: ThreeEvent<PointerEvent>) => {
    if (useUi.getState().tool !== 'yarn') return;
    event.stopPropagation();
    run('connection_delete', { id: connection.id });
  };
  const angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  return (
    <group>
      <Line points={points} lineWidth={14} worldUnits transparent opacity={0.001} onPointerDown={cut} />
      <Line points={points} lineWidth={connection.style === 'yarn' ? 2.5 : 3} worldUnits color={inkColor(connection.color, palette)} />
      {connection.style === 'yarn' ? (
        <>
          <Pin at={a} color={inkColor(connection.color, palette)} />
          <Pin at={b} color={inkColor(connection.color, palette)} />
        </>
      ) : (
        <mesh position={[b[0], -b[1], 1]} rotation={[0, 0, angle - Math.PI / 2]}>
          <coneGeometry args={[9, 20, 3]} />
          <meshBasicMaterial color={inkColor(connection.color, palette)} />
        </mesh>
      )}
    </group>
  );
}

/** Yarn draws above every item so it reads like string pinned across the board. */
export function Yarn({ board }: { board: BoardView }) {
  return (
    <group position={[0, 0, Z.yarn]}>
      {board.connections.map((connection) => (
        <Connection key={connection.id} board={board} connection={connection} />
      ))}
    </group>
  );
}
