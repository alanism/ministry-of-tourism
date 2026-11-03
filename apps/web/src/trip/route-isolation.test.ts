import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('MOT-69 route initialization boundary', () => {
  it('mounts only the trip app from the route entry', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    // Mechanical dependency guard: the route entry must only mount the trip app.
    expect(source).not.toMatch(/\buseBoard\s*\(/);
    expect(source).toContain('<TripApp');
  });
});
