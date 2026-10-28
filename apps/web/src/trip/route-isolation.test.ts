import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('MOT-69 route initialization boundary', () => {
  it('keeps writer initialization in a separately mounted component', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    // Mechanical dependency guard: the route entry must never own the writer hook.
    expect(source).not.toMatch(/\buseBoard\s*\(/);
    expect(source).toContain('<WriterApp');
    expect(source).toContain('<TripApp');
  });
});
