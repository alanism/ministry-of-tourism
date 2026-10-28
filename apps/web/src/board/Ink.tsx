// Marker strokes on the whiteboard, plus the stroke being drawn right now.
// With the eraser tool, pressing a stroke removes it.
import { inkColor } from '@writers-board/core';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { StrokeView } from '@writers-board/core';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { usePalette } from '../state/palette';

function toWorld(points: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i]!, -points[i + 1]!, 0]);
  return out;
}

function Stroke({ stroke }: { stroke: StrokeView }) {
  const palette = usePalette();
  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (useUi.getState().tool !== 'eraser') return;
    event.stopPropagation();
    run('stroke_delete', { id: stroke.id });
  };
  return (
    <group>
      <Line points={toWorld(stroke.points)} lineWidth={Math.max(12, stroke.width * 3)} worldUnits transparent opacity={0.001} onPointerDown={onPointerDown} />
      <Line points={toWorld(stroke.points)} lineWidth={stroke.width} worldUnits color={inkColor(stroke.color, palette)} />
    </group>
  );
}

export function Ink({ strokes }: { strokes: StrokeView[] }) {
  const palette = usePalette();
  const live = useUi((s) => s.liveStroke);
  const color = useUi((s) => s.inkColor);
  return (
    <group position={[0, 0, -2]}>
      {strokes.map((stroke) => (
        <Stroke key={stroke.id} stroke={stroke} />
      ))}
      {live && live.length >= 4 && <Line points={toWorld(live)} lineWidth={3} worldUnits color={inkColor(color, palette)} />}
    </group>
  );
}
