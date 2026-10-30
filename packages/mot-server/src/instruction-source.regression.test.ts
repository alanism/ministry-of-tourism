import { expect, it } from 'vitest';
import { PROVIDER_INSTRUCTION } from './index.ts';

it('keeps article citations allowed on new cards when merging command-shape guidance', () => {
  expect(PROVIDER_INSTRUCTION).toContain('For each article-grounded trip_card_create, include input.source');
  expect(PROVIDER_INSTRUCTION).not.toMatch(/Never set [^.]*"source"/);
  expect(PROVIDER_INSTRUCTION).toContain('Never replace source or sourceText on existing cards');
});
