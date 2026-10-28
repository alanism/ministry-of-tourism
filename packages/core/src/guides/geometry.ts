// Path math for guides: a smooth curve through the control points (centripetal
// Catmull-Rom), sampled by arc length so stops sit evenly along it.
import type { Point } from './presets.ts';

const SEGMENT_SAMPLES = 24;

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** Dense polyline along the curve through all control points. */
export function samplePath(points: readonly Point[]): Point[] {
  if (points.length < 2) return points.map((p) => [p[0], p[1]] as Point);
  if (points.length === 2) return [points[0]!, points[1]!].map((p) => [p[0], p[1]] as Point);
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < SEGMENT_SAMPLES; s++) out.push(catmullRom(p0, p1, p2, p3, s / SEGMENT_SAMPLES));
  }
  const last = points[points.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

function lengths(samples: readonly Point[]): number[] {
  const acc = [0];
  for (let i = 1; i < samples.length; i++) {
    const [ax, ay] = samples[i - 1]!;
    const [bx, by] = samples[i]!;
    acc.push(acc[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return acc;
}

/** The point and direction at fraction t (0..1) of the path's length. */
export function pointAt(samples: readonly Point[], t: number): { point: Point; angle: number } {
  const acc = lengths(samples);
  const total = acc[acc.length - 1]!;
  const target = Math.min(1, Math.max(0, t)) * total;
  let i = 1;
  while (i < acc.length - 1 && acc[i]! < target) i++;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  const span = acc[i]! - acc[i - 1]! || 1;
  const k = (target - acc[i - 1]!) / span;
  return { point: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** The closest point on the path, its distance, and its fraction t along the path. */
export function nearestOnPath(samples: readonly Point[], p: Point): { point: Point; distance: number; t: number } {
  const acc = lengths(samples);
  const total = acc[acc.length - 1]! || 1;
  let best = { point: samples[0]! as Point, distance: Infinity, t: 0 };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const q: Point = [a[0] + dx * k, a[1] + dy * k];
    const distance = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (distance < best.distance) best = { point: q, distance, t: (acc[i - 1]! + Math.sqrt(len2) * k) / total };
  }
  return best;
}
