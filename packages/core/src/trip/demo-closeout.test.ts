import { describe, expect, it } from 'vitest';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { photobookPages, posterSvg } from './render.ts';

const you = { kind: 'human', id: 'you', name: 'You' } as const;
const make = () => new TripSession(createTrip({title: 'Bangkok memories', city: 'bangkok', timeZone: 'Asia/Bangkok'}));

describe('demo output contracts', () => {
  it('places poster pins from their coordinates, excludes private pins and retains source coordinates', () => {
    const s = make();
    for (const c of [
      {title: 'East', lat: 13, lng: 101, scope: 'stay'},
      {title: 'West', lat: 13, lng: 100, scope: 'stay'},
      {title: 'Secret address', lat: 20, lng: 120, scope: 'private'},
    ]) s.execute(you, 'trip_card_create', {kind: 'place', title: c.title, scope: c.scope, location: {lat: c.lat, lng: c.lng, source: 'traveler'}});
    const {svg} = posterSvg(s.doc);
    const positions = new Map([...svg.matchAll(/data-lng="([\d.]+)"[^>]*><circle cx="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]));
    expect(positions.size).toBe(2);
    expect(positions.get(101)).toBeGreaterThan(positions.get(100)!);
    expect(svg).toContain('data-lng="101"');
    expect(svg).not.toContain('Secret address');
  });

  it('pads photobook pages to multiples of four and includes the trip title and local date', () => {
    const s = make();
    for (let i = 0; i < 25; i++) s.execute(you, 'trip_card_create', {kind: 'note', title: `Memory ${i}`, day: '2026-10-28'});
    const book = photobookPages(s.doc);
    expect(book.pages.length).toBe(28);
    expect(book.pages[0]).toContain('Bangkok memories');
    expect(book.pages[0]).toContain('2026-10-28');
    expect(book.pages[0]).toContain(book.label);
  });
});
