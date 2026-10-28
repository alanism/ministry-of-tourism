import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLensBundle } from './build.ts';
import { COACHES, TUTORING_LOOP, getCoach } from './coaches.ts';
import { parseRoleCard } from './parse.ts';
import shipped from '../../content/lenses.json' with { type: 'json' };
import config from '../../content/coaches.json' with { type: 'json' };

const contentDir = path.join(import.meta.dirname, '..', '..', 'content');
const readLens = (file: string) => readFileSync(path.join(contentDir, 'lenses', file), 'utf8');

describe('lens importer', () => {
  it('ships lenses.json that matches the markdown (run `npm run lenses:build` if this fails)', () => {
    expect(buildLensBundle(config, readLens)).toEqual(shipped);
  });

  it('ships coach data with role names only, never a source name', () => {
    const text = JSON.stringify(shipped);
    const names = config.coaches.flatMap((c) => [c.sourceKey, ...c.file.replace(/\.md$/, '').split('_')]);
    for (const name of new Set(names.filter((n) => /^[A-Z][a-z]+$/.test(n)))) {
      expect(text, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('gives every coach a role name and five checks', () => {
    expect(COACHES.map((c) => c.role)).toEqual(['Essay Architect', 'Explainer', 'Rhetorician', 'Storyteller', 'Read-Aloud Coach']);
    for (const coach of COACHES) expect(coach.roleCard.outputFormat).toHaveLength(5);
    expect(getCoach('essay-architect')?.roleCard.outputFormat[0]).toEqual({
      name: 'Idea check',
      question: 'is the thesis concrete, contextual, and catalytic?',
    });
  });

  it('reads every veto as a hard "NO" rule', () => {
    for (const coach of COACHES) {
      for (const veto of coach.roleCard.vetoes) expect(veto).toMatch(/^NO /);
    }
  });

  it('links hand-offs between coaches and drops ones outside the five', () => {
    expect(getCoach('essay-architect')!.roleCard.defersTo.map((d) => d.coachId)).toEqual(['rhetorician', 'explainer', 'storyteller', 'read-aloud-coach']);
    expect(getCoach('rhetorician')!.roleCard.defersTo).toEqual([]);
  });

  it('routes the eight tutoring-loop complaints to coaches', () => {
    expect(TUTORING_LOOP.complaints).toHaveLength(8);
    const route = Object.fromEntries(TUTORING_LOOP.complaints.map((c) => [c.complaint, c.coachIds]));
    expect(route['My essay is messy']).toEqual(['essay-architect']);
    expect(route["I don't know how to revise"]).toEqual(['essay-architect', 'rhetorician']);
    expect(route['It feels preachy']).toEqual(['read-aloud-coach', 'storyteller']);
    expect(TUTORING_LOOP.moves).toEqual([
      'Today we fix the thesis',
      'Today we make one sentence memorable',
      'Today we turn telling into showing',
      'Today we read aloud and remove stumble points',
      'Today we make every paragraph answer a question',
    ]);
  });

  it('rejects a role card with a missing field', () => {
    const broken = readLens('Michael_Dean_essay_architecture_lens.md').replace('**Vetoes:**', '**Rules:**');
    expect(() => parseRoleCard(broken)).toThrow(/vetoes/);
  });
});
