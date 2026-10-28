// Geometry and materials shared by every item of the same size or color, so a
// board with a thousand cards builds a handful of shapes, not thousands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shadowTexture } from './assets';

const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.Material>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let geometry = geometries.get(key) as T | undefined;
  if (!geometry) {
    geometry = make();
    geometries.set(key, geometry);
  }
  return geometry;
}

export function plane(width: number, height: number): THREE.BufferGeometry {
  return cached(`plane:${width}:${height}`, () => new THREE.PlaneGeometry(width, height));
}

/** A flat rounded rectangle, centered. */
export function roundedRect(width: number, height: number, radius: number): THREE.BufferGeometry {
  return cached(`round:${width}:${height}:${radius}`, () => {
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return new THREE.ShapeGeometry(shape, 4);
  });
}

/** All of a card's ruled lines as one shape. */
export function ruledLines(width: number, rows: readonly number[]): THREE.BufferGeometry {
  return cached(`rules:${width}:${rows.join(',')}`, () => {
    const parts = rows.map((y) => new THREE.PlaneGeometry(width, 0.6).translate(0, y, 0));
    const merged = parts.length ? mergeGeometries(parts)! : new THREE.BufferGeometry();
    parts.forEach((p) => p.dispose());
    return merged;
  });
}

export function ring(inner: number, outer: number): THREE.BufferGeometry {
  return cached(`ring:${inner}:${outer}`, () => new THREE.RingGeometry(inner, outer, 32));
}

/** A plain color, shared. Pass `side` for paper seen from both faces. */
export function flat(color: string, options: { side?: THREE.Side; opacity?: number } = {}): THREE.MeshBasicMaterial {
  const key = `flat:${color}:${options.side ?? 0}:${options.opacity ?? 1}`;
  let material = materials.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      side: options.side ?? THREE.FrontSide,
      ...(options.opacity !== undefined ? { transparent: true, opacity: options.opacity, depthWrite: false } : {}),
    });
    materials.set(key, material);
  }
  return material;
}

/** The soft shadow under an item, resting or lifted. */
export function shadowMaterial(lifted: boolean): THREE.MeshBasicMaterial {
  const key = `shadow:${lifted}`;
  let material = materials.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: lifted ? 0.22 : 0.16, depthWrite: false });
    materials.set(key, material);
  }
  return material;
}
