import * as THREE from 'three';
import plexSans from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url';
import plexSansSemibold from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import plexMonoSemibold from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff?url';
import kalamBold from '@fontsource/kalam/files/kalam-latin-700-normal.woff?url';

// Fonts are bundled with the app (no font CDN at runtime). IBM Plex is the
// brand type; Kalam bold is the whiteboard marker. The writer's handwriting
// comes from their chosen pairing (writing/fonts.ts).
export const FONTS = {
  ui: plexSans,
  uiBold: plexSansSemibold,
  label: plexMonoSemibold,
  marker: kalamBold,
};

let shadow: THREE.Texture | null = null;

/** A soft rounded-rectangle shadow, drawn once and stretched under every card. */
export function shadowTexture(): THREE.Texture {
  if (shadow) return shadow;
  const size = 128;
  const pad = 28;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, 8);
  ctx.fill();
  shadow = new THREE.CanvasTexture(canvas);
  shadow.colorSpace = THREE.SRGBColorSpace;
  return shadow;
}

/** Darkens a hex color for card bands and lane labels. */
export function shade(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(1 - amount);
  return `#${color.getHexString()}`;
}
