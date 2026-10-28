// The dot-grid whiteboard: one large plane with a shader that draws the dots,
// so the grid stays crisp at any zoom. Dragging empty board pans the view.
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { clientToBoard, penSeen, pinching, trackPointer } from './pointer';
import { usePalette } from '../state/palette';

const SPACING = 24;
const EXTENT = 200_000;

const vertexShader = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uSpacing;
  uniform float uZoom;
  uniform vec3 uBoard;
  uniform vec3 uDot;
  varying vec2 vWorld;
  void main() {
    vec2 cell = mod(vWorld + uSpacing * 0.5, uSpacing) - uSpacing * 0.5;
    float radius = max(1.5, 0.9 / uZoom);
    float edge = 1.0 / uZoom;
    float dotMask = 1.0 - smoothstep(radius - edge, radius + edge, length(cell));
    // Dots fade out when zoomed far out, so the board doesn't turn gray.
    float visible = smoothstep(0.18, 0.45, uZoom);
    gl_FragColor = vec4(mix(uBoard, uDot, dotMask * visible * 0.6), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Marker: collect board points while the pointer is down, then save one stroke. */
function drawStroke(event: ThreeEvent<PointerEvent>) {
  const points: number[] = [];
  const add = (clientX: number, clientY: number) => {
    const p = clientToBoard(clientX, clientY);
    const n = points.length;
    // Skip points closer than a pixel or so to keep strokes light.
    if (n >= 2 && Math.hypot(p.x - points[n - 2]!, p.y - points[n - 1]!) < 1.5 / useUi.getState().view.zoom) return;
    points.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
    useUi.getState().setLiveStroke([...points]);
  };
  add(event.clientX, event.clientY);
  trackPointer(
    (e) => add(e.clientX, e.clientY),
    () => {
      useUi.getState().setLiveStroke(null);
      if (points.length >= 4) run('stroke_add', { points, color: useUi.getState().inkColor });
    },
    // A second finger means a pinch, not a line.
    { pointerId: event.pointerId, onCancel: () => useUi.getState().setLiveStroke(null) },
  );
}

export function Surface() {
  const zoom = useUi((s) => s.view.zoom);
  const palette = usePalette();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uSpacing: { value: SPACING },
          uZoom: { value: 1 },
          uBoard: { value: new THREE.Color() },
          uDot: { value: new THREE.Color() },
        },
      }),
    [],
  );
  material.uniforms.uZoom!.value = zoom;
  // The whiteboard and its dots follow the board's palette.
  (material.uniforms.uBoard!.value as THREE.Color).set(palette.board);
  (material.uniforms.uDot!.value as THREE.Color).set(palette.faint).lerp(new THREE.Color(palette.board), 0.35);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if ((event.button !== 0 && event.button !== 1) || pinching) return;
    const ui = useUi.getState();
    // With a pen in use, fingers pan and only the pen draws.
    const fingerWithPen = event.pointerType === 'touch' && penSeen;
    if (ui.tool === 'marker' && event.button === 0 && !fingerWithPen) {
      drawStroke(event);
      return;
    }
    if (ui.tool === 'yarn') ui.setYarnFrom(null);
    ui.select(null);
    const start = { x: event.clientX, y: event.clientY };
    const origin = useUi.getState().view;
    document.body.style.cursor = 'grabbing';
    const done = () => (document.body.style.cursor = '');
    trackPointer(
      (e) =>
        useUi.getState().setView({
          x: origin.x - (e.clientX - start.x) / origin.zoom,
          y: origin.y - (e.clientY - start.y) / origin.zoom,
        }),
      done,
      { pointerId: event.pointerId, onCancel: done },
    );
  };

  return (
    <mesh position={[0, 0, -10]} material={material} onPointerDown={onPointerDown}>
      <planeGeometry args={[EXTENT, EXTENT]} />
    </mesh>
  );
}
