import { describe, expect, it } from 'vitest';
import { buildPdf } from './pdf.ts';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const image = { kind: 'image' as const, jpeg, width: 1184, height: 1680 };
const decode = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('PDF raster placement', () => {
  it.each([[419.53, 595.28], [595.28, 419.53], [420, 595]])(
    'preserves aspect ratio and keeps fractional page edges inside %s × %s points',
    (pageWidth, pageHeight) => {
      const pdf = decode(buildPdf([{ ...image, fullBleed: true, pageSize: [pageWidth, pageHeight] }]));
      const match = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im0/.exec(pdf)!;
      const [width, height, x, y] = match.slice(1).map(Number) as [number, number, number, number];
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x + width).toBeLessThan(pageWidth);
      expect(y + height).toBeLessThan(pageHeight);
      expect(Math.abs(width / height - image.width / image.height)).toBeLessThan(1e-8);
      expect(Math.abs(x - (pageWidth - width) / 2)).toBeLessThan(1e-6);
      expect(Math.abs(y - (pageHeight - height) / 2)).toBeLessThan(1e-6);
    },
  );

  it('retains the existing framed-image placement and manuscript page', () => {
    const pdf = decode(buildPdf([
      { kind: 'image', jpeg, width: 600, height: 800 },
      { kind: 'text', lines: ['Existing manuscript'] },
    ]));
    expect(pdf).toContain('q 405.00 0 0 540.00 193.50 36.00 cm /Im0 Do Q');
    expect(pdf).toContain('(Existing manuscript) Tj');
  });
});
