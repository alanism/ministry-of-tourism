import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });

describe('board camera controls', () => {
  it('maps the slider endpoints and midpoint to the existing zoom limits', async () => {
    const { zoomAt, zoomPosition } = await import('./board-camera');
    expect(zoomAt(0)).toBeCloseTo(0.15);
    expect(zoomAt(100)).toBeCloseTo(4);
    expect(zoomAt(50)).toBeCloseTo(Math.sqrt(0.15 * 4));
    for (const zoom of [0.15, 0.5, 1, 2, 4]) expect(zoomAt(zoomPosition(zoom))).toBeCloseTo(zoom);
  });

  it('clamps the slider rather than letting it exceed camera bounds', async () => {
    const { zoomAt } = await import('./board-camera');
    expect(zoomAt(-10)).toBeCloseTo(0.15);
    expect(zoomAt(110)).toBeCloseTo(4);
  });

  it('pans in board coordinates at a consistent screen speed, including diagonals', async () => {
    const { panCamera } = await import('./board-camera');
    expect(panCamera({ x: 20, y: 30, zoom: 1 }, 1, 0, 0.1)).toEqual({ x: 68, y: 30 });
    expect(panCamera({ x: 20, y: 30, zoom: 2 }, 0, -1, 0.1)).toEqual({ x: 20, y: 6 });
    const diagonal = panCamera({ x: 0, y: 0, zoom: 1 }, 1, 1, 0.1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(48);
    expect(panCamera({ x: 20, y: 30, zoom: 1 }, 0, 0, 0.1)).toEqual({ x: 20, y: 30 });
  });
});
