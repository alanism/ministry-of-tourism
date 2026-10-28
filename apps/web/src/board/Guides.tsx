// Guides drawn in marker on the whiteboard. Select one to get handles:
// drag an end to stretch it, drag a middle handle to bend it, double-click the
// line to add a bend, double-click a handle to remove it, drag a stop along the
// path, and double-click any label to rename it. Locked guides stay put.
import { Line, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { nearestOnPath, pointAt, samplePath, type GuideStop, type GuideView, type Point } from '@writers-board/core';
import { run } from '../state/board';
import { toScreen, useUi } from '../state/ui';
import { FONTS } from './assets';
import { clientToBoard, trackPointer } from './pointer';
import { usePalette } from '../state/palette';
import { useWritingType } from '../writing/fonts';

// Bigger handles where the pointer is a finger.
const HANDLE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 16 : 9;

const world = ([x, y]: Point): [number, number, number] => [x, -y, 0];

function canEdit(event: ThreeEvent<PointerEvent | MouseEvent>, locked: boolean) {
  const tool = useUi.getState().tool;
  if (tool !== 'select') return false;
  event.stopPropagation();
  return !locked;
}

function openLabel(guideId: string, field: string, value: string, at: Point) {
  const screen = toScreen(useUi.getState().view, at[0], at[1]);
  useUi.getState().setLabelEdit({ guideId, field, value, x: screen.left, y: screen.top });
}

function Handle({ at, color, onPointerDown, onDoubleClick }: {
  at: Point;
  color: string;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <mesh position={[at[0], -at[1], 3]} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
      <circleGeometry args={[HANDLE, 24]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function PathGuide({ guide, selected }: { guide: GuideView; selected: boolean }) {
  const palette = usePalette();
  const type = useWritingType();
  const ACCENT = palette.accent;
  const MARKER = palette.muted;
  const [draftPoints, setDraftPoints] = useState<Point[] | null>(null);
  const [draftStops, setDraftStops] = useState<GuideStop[] | null>(null);
  const points = draftPoints ?? guide.points;
  const stops = draftStops ?? guide.stops;
  const samples = useMemo(() => samplePath(points), [points]);
  const color = selected ? ACCENT : MARKER;

  const moveWhole = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    const editable = canEdit(event, guide.locked);
    useUi.getState().select(guide.id);
    if (!editable) return;
    const start = clientToBoard(event.clientX, event.clientY);
    let latest: Point[] | null = null;
    trackPointer(
      (e) => {
        const p = clientToBoard(e.clientX, e.clientY);
        latest = guide.points.map(([x, y]) => [Math.round(x + p.x - start.x), Math.round(y + p.y - start.y)]);
        setDraftPoints(latest);
      },
      () => {
        if (latest) run('guide_update', { id: guide.id, points: latest });
        setDraftPoints(null);
      },
      { pointerId: event.pointerId, onCancel: () => setDraftPoints(null) },
    );
  };

  const dragPoint = (index: number) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !canEdit(event, guide.locked)) return;
    let latest: Point[] | null = null;
    trackPointer(
      (e) => {
        const p = clientToBoard(e.clientX, e.clientY);
        latest = guide.points.map((q, i) => (i === index ? [Math.round(p.x), Math.round(p.y)] : q));
        setDraftPoints(latest);
      },
      () => {
        if (latest) run('guide_update', { id: guide.id, points: latest });
        setDraftPoints(null);
      },
      { pointerId: event.pointerId, onCancel: () => setDraftPoints(null) },
    );
  };

  const removePoint = (index: number) => (event: ThreeEvent<MouseEvent>) => {
    if (!canEdit(event, guide.locked) || guide.points.length <= 2) return;
    run('guide_update', { id: guide.id, points: guide.points.filter((_, i) => i !== index) });
  };

  const addBend = (event: ThreeEvent<MouseEvent>) => {
    if (!canEdit(event, guide.locked)) return;
    const p = clientToBoard(event.clientX, event.clientY);
    const at = nearestOnPath(samples, [p.x, p.y]).t;
    const ts = guide.points.map((q) => nearestOnPath(samples, q).t);
    const index = ts.findIndex((t) => t > at);
    const insertAt = index === -1 ? guide.points.length - 1 : Math.max(1, index);
    const next = [...guide.points];
    next.splice(insertAt, 0, [Math.round(p.x), Math.round(p.y)]);
    run('guide_update', { id: guide.id, points: next });
  };

  const dragStop = (stopId: string) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !canEdit(event, guide.locked)) return;
    let latest: GuideStop[] | null = null;
    trackPointer(
      (e) => {
        const p = clientToBoard(e.clientX, e.clientY);
        const t = Math.round(nearestOnPath(samples, [p.x, p.y]).t * 1000) / 1000;
        latest = guide.stops.map((s) => (s.id === stopId ? { ...s, t } : s));
        setDraftStops(latest);
      },
      () => {
        if (latest) run('guide_update', { id: guide.id, stops: latest });
        setDraftStops(null);
      },
      { pointerId: event.pointerId, onCancel: () => setDraftStops(null) },
    );
  };

  const start = points[0]!;
  return (
    <group>
      {/* Wide, invisible hit area so the line is easy to grab. */}
      <Line points={samples.map(world)} lineWidth={22} worldUnits transparent opacity={0.001} onPointerDown={moveWhole} onDoubleClick={addBend} />
      <Line points={samples.map(world)} lineWidth={3.5} worldUnits color={color} transparent opacity={guide.locked ? 0.45 : 0.8} />
      <Text
        font={FONTS.marker}
        fontSize={22}
        color={color}
        anchorX="left"
        anchorY="bottom"
        position={[start[0], -start[1] + 34, 1]}
        onDoubleClick={(e) => canEdit(e, guide.locked) && openLabel(guide.id, 'title', guide.title, [start[0], start[1] - 50])}
      >
        {guide.locked ? `${guide.title} (locked)` : guide.title}
      </Text>
      {stops.map((stop) => {
        const { point } = pointAt(samples, stop.t);
        return (
          <group key={stop.id}>
            <mesh position={[point[0], -point[1], 2]} onPointerDown={dragStop(stop.id)}>
              <circleGeometry args={[7, 24]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <Text
              font={type.handFile}
              fontSize={15 * type.handScale}
              color={stop.label ? palette.ink : palette.faint}
              anchorX="center"
              anchorY="bottom"
              maxWidth={150}
              textAlign="center"
              position={[point[0], -point[1] + 12, 1]}
              onDoubleClick={(e) => canEdit(e, guide.locked) && openLabel(guide.id, stop.id, stop.label, [point[0] - 70, point[1] - 40])}
            >
              {stop.label || 'name this stop'}
            </Text>
          </group>
        );
      })}
      {selected &&
        !guide.locked &&
        points.map((p, i) => (
          <Handle key={i} at={p} color={i === 0 || i === points.length - 1 ? ACCENT : palette.margin} onPointerDown={dragPoint(i)} onDoubleClick={removePoint(i)} />
        ))}
    </group>
  );
}

function QuadrantGuide({ guide, selected }: { guide: GuideView; selected: boolean }) {
  const palette = usePalette();
  const type = useWritingType();
  const ACCENT = palette.accent;
  const MARKER = palette.muted;
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [a, b] = (draft ?? guide.points) as [Point, Point];
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const color = selected ? ACCENT : MARKER;
  const axes = guide.axes ?? ['', ''];
  const quadrants = guide.quadrants ?? ['', '', '', ''];

  const drag = (mode: 'move' | 'corner') => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    const editable = canEdit(event, guide.locked);
    useUi.getState().select(guide.id);
    if (!editable) return;
    const start = clientToBoard(event.clientX, event.clientY);
    let latest: Point[] | null = null;
    trackPointer(
      (e) => {
        const p = clientToBoard(e.clientX, e.clientY);
        const dx = Math.round(p.x - start.x);
        const dy = Math.round(p.y - start.y);
        latest =
          mode === 'move'
            ? guide.points.map(([x, y]) => [x + dx, y + dy] as Point)
            : [[x0, y0], [Math.max(x0 + 120, x1 + dx), Math.max(y0 + 120, y1 + dy)]];
        setDraft(latest);
      },
      () => {
        if (latest) run('guide_update', { id: guide.id, points: latest });
        setDraft(null);
      },
      { pointerId: event.pointerId, onCancel: () => setDraft(null) },
    );
  };

  const outline: [number, number, number][] = [world([x0, y0]), world([x1, y0]), world([x1, y1]), world([x0, y1]), world([x0, y0])];
  const label = (field: string, value: string, at: Point) => (e: ThreeEvent<MouseEvent>) =>
    canEdit(e, guide.locked) && openLabel(guide.id, field, value, at);
  const quadrantAt: Point[] = [
    [x0 + 16, y0 + 16],
    [x1 - 16, y0 + 16],
    [x0 + 16, y1 - 16],
    [x1 - 16, y1 - 16],
  ];

  return (
    <group>
      <mesh position={[cx, -cy, -1]} onPointerDown={drag('move')}>
        <planeGeometry args={[x1 - x0, y1 - y0]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.001} />
      </mesh>
      <Line points={outline} lineWidth={2} worldUnits color={color} transparent opacity={0.55} />
      <Line points={[world([cx, y0]), world([cx, y1])]} lineWidth={3} worldUnits color={color} transparent opacity={0.8} />
      <Line points={[world([x0, cy]), world([x1, cy])]} lineWidth={3} worldUnits color={color} transparent opacity={0.8} />
      <Text font={FONTS.marker} fontSize={22} color={color} anchorX="left" anchorY="bottom" position={[x0, -y0 + 8, 1]}
        onDoubleClick={label('title', guide.title, [x0, y0 - 40])}>
        {guide.locked ? `${guide.title} (locked)` : guide.title}
      </Text>
      <Text font={FONTS.marker} fontSize={18} color={color} anchorX="center" anchorY="top" position={[cx, -y1 - 8, 1]}
        onDoubleClick={label('axis-0', axes[0], [cx - 70, y1 + 8])}>
        {`${axes[0]} →`}
      </Text>
      <Text font={FONTS.marker} fontSize={18} color={color} anchorX="center" anchorY="bottom" position={[x0 - 10, -cy, 1]} rotation={[0, 0, Math.PI / 2]}
        onDoubleClick={label('axis-1', axes[1], [x0 - 160, cy])}>
        {`${axes[1]} →`}
      </Text>
      {quadrants.map((name, i) => (
        <Text key={i} font={type.handFile} fontSize={16 * type.handScale} color={palette.muted} anchorX={i % 2 === 0 ? 'left' : 'right'} anchorY="top"
          position={[quadrantAt[i]![0], -quadrantAt[i]![1], 1]}
          onDoubleClick={label(`quadrant-${i}`, name, [quadrantAt[i]![0] - (i % 2 ? 140 : 0), quadrantAt[i]![1]])}>
          {name || 'name this corner'}
        </Text>
      ))}
      {selected && !guide.locked && <Handle at={[x1, y1]} color={ACCENT} onPointerDown={drag('corner')} />}
    </group>
  );
}

export function Guides({ guides }: { guides: GuideView[] }) {
  const selectedId = useUi((s) => s.selectedId);
  return (
    <group position={[0, 0, -3]}>
      {guides
        .filter((g) => g.visible)
        .map((guide) =>
          guide.kind === 'quadrant' ? (
            <QuadrantGuide key={guide.id} guide={guide} selected={guide.id === selectedId} />
          ) : (
            <PathGuide key={guide.id} guide={guide} selected={guide.id === selectedId} />
          ),
        )}
    </group>
  );
}
