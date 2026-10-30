import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./FirstScreen.tsx', import.meta.url),
  'utf8',
);
const lowerSource = source.toLowerCase();

function collectCssContents(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectCssContents(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.css')
      ? [readFileSync(entryPath, 'utf8')]
      : [];
  });
}

const stylesheet = [
  source,
  ...collectCssContents(fileURLToPath(new URL('../', import.meta.url))),
].join('\n');

describe('FirstScreen product demo video', () => {
  it('renders the original video with native controls instead of autoplay', () => {
    expect(source).toContain('<video');
    expect(source).toMatch(/<video\b[^>]*\bcontrols\b/);
    expect(source).toMatch(/<video\b[^>]*\bplaysInline\b/);
    expect(source).toMatch(/<video\b[^>]*preload="none"/);
    expect(source).not.toContain('autoPlay');
    expect(lowerSource).not.toContain('autoplay');
    expect(source).toContain(
      'poster="/assets/concept-trailer-poster.webp"',
    );
    expect(source).toContain(
      'aria-label="Product demo and how it works video"',
    );
  });

  it('uses the original mp4 as both the video source and watch link', () => {
    expect(source).toMatch(
      /<source\b[^>]*src="\/assets\/mot-product-and-technical-demo-20261030\.mp4"/,
    );
    expect(source).toMatch(/<source\b[^>]*type="video\/mp4"/);
    expect(source).toContain(
      'href="/assets/mot-product-and-technical-demo-20261030.mp4"',
    );
  });

  it('shows the product demo caption', () => {
    expect(source).toContain('Watch the product demo');
    expect(source).toContain('Product demo + how it works · 2:30');
  });

  it('does not render the old sample keepsake receipt', () => {
    expect(source).not.toContain('Sample keepsake');
    expect(source).not.toContain('Sample trip notes');
    expect(source).not.toContain('Bangkok · sample plan');
    expect(source).not.toContain('Walk by the river.');
    expect(source).not.toContain('Save a favorite place.');
    expect(source).not.toContain('Add a photo of your own.');
    expect(source).not.toContain('Sample trip · notes only');
    expect(source).not.toContain('concept photo');
  });

  it('keeps the video responsive in CSS', () => {
    expect(stylesheet).toMatch(
      /(?:video|\.product-demo[-\w]*)[^{]*\{[^}]*max-width\s*:\s*100%[^}]*height\s*:\s*auto/s,
    );
    expect(stylesheet).toMatch(
      /@media\s*\([^)]*max-width\s*:\s*\d+px[^)]*\)\s*\{[\s\S]*?(?:video|\.product-demo[-\w]*)[^{]*\{[^}]*(?:width|max-width)\s*:\s*100%/,
    );
  });
});
