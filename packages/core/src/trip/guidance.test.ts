import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { agentGuidance, GUIDE_ESSENTIALS, GUIDE_PATH, GUIDE_SECTIONS, GUIDE_URL, GUIDE_VERSION, guidanceMarkdown, startHereMarkdown } from './guidance.ts';
import { createTrip, readAllCards, tripParts } from './model.ts';
import { exportTripPackage } from './package.ts';
import { importTripPackage } from './import.ts';
import { TripSession } from './session.ts';

const owner = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const published = new URL(`../../../../apps/web/public${GUIDE_PATH}`, import.meta.url);

describe('MOT-116 one guidance source', () => {
  it('publishes the generated guide unchanged and uses the verified production guide URL', () => {
    expect(readFileSync(published, 'utf8')).toBe(guidanceMarkdown());
    expect(GUIDE_URL).toBe('https://ministryoftourism.web.app/guides/trip-best-practices.md');
    expect(agentGuidance()).toMatchObject({ guide_url: 'https://ministryoftourism.web.app/guides/trip-best-practices.md', version: GUIDE_VERSION });
  });
  it('covers Planning, During trip and Post trip, with post-trip copy on HTML/app and JSON/ZIP and no PDF requirement', () => {
    expect(GUIDE_SECTIONS.map(s => s.title)).toEqual(['Planning', 'During trip', 'Post trip']);
    const post = GUIDE_SECTIONS.find(s => s.phase === 'post')!.points.join(' ');
    expect(post).toMatch(/app pages/);
    expect(post).toMatch(/JSON\/ZIP/);
    expect(guidanceMarkdown()).not.toMatch(/\bPDF\b|print[- ]proof/i);
    for (const essential of GUIDE_ESSENTIALS) expect(guidanceMarkdown()).toContain(essential);
  });
  it('embeds offline essentials in a ZIP and usable guidance in JSON alone, with matching versions', async () => {
    const session = new TripSession(createTrip({ title: 'Guide trip', city: 'Lisbon', timeZone: 'Europe/Lisbon', boardId: 'guide-trip' }));
    session.execute(owner, 'trip_card_create', { kind: 'note', title: 'Shared note', stage: 'plan' });
    session.execute(owner, 'trip_card_create', { kind: 'note', title: 'Secret', body: 'PRIVATE-NOTE', scope: 'private' });
    const files = unzipSync(await exportTripPackage(session.doc));
    const start = strFromU8(files['START-HERE.md']!), guidance = JSON.parse(strFromU8(files['guidance.json']!)), readable = JSON.parse(strFromU8(files['trip.json']!));
    expect(guidance).toEqual(agentGuidance());
    expect(readable.agent_guidance).toEqual(agentGuidance());
    expect(start).toContain(`version: \`${GUIDE_VERSION}\``);
    expect(start).toContain(GUIDE_ESSENTIALS[0]);
    // A JSON-only handoff names no embedded file it cannot resolve.
    // guide_path is the public app route, not a file inside the package; guide_url is its verified public URL.
    const { guide_path, guide_url, ...embedded } = readable.agent_guidance;
    expect(guide_path).toBe(GUIDE_PATH);
    expect(guide_url).toBe(GUIDE_URL);
    expect(JSON.stringify(embedded)).not.toMatch(/START-HERE|\.md\b|\.json\b|assets\//);
    for (const name of [...start.matchAll(/^- `([^`]+)`:/gm)].map(m => m[1]!).filter(n => !['small_edit', 'preferences', 'plan', 'trip_change', 'keepsake'].includes(n))) expect(name === 'assets/' || name in files).toBe(true);
    expect(start).not.toContain('assets/');
    expect(strFromU8(files['START-HERE.md']!) + strFromU8(files['trip.json']!)).not.toContain('PRIVATE-NOTE');
    const reopened = await importTripPackage(await exportTripPackage(session.doc));
    expect(readAllCards(tripParts(reopened.doc)).map(c => c.title)).toEqual(['Shared note']);
  });
  it('lists only files a package actually holds', () => {
    expect(startHereMarkdown(['trip.json', 'START-HERE.md'])).not.toMatch(/guidance\.json|layout\.json|assets\//);
    expect(startHereMarkdown(['trip.json', 'assets/a'])).toContain('`assets/`');
  });
});
