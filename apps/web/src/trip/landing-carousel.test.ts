import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstScreen } from './FirstScreen';
import { readFileSync } from 'node:fs';

const landing = () => renderToStaticMarkup(createElement(FirstScreen, { onStart: () => {}, boards: [], onOpen: () => {} }));

describe('landing carousel', () => {
  it('adds a named manual carousel below both audience controls without replacing the demo or trip action', () => {
    const html = landing();
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.indexOf('aria-roledescription="carousel"')).toBeGreaterThan(html.indexOf('Create a tour board'));
    expect(html).toContain('Make this my trip');
    expect(html).toContain('Product demo + how it works');
    expect(html).toContain('2:40');
    expect(html).toContain('Connect Muse to MoT');
    expect(html).toContain('controls="" playsInline="" preload="none"');
    expect(html).toContain('/assets/mot-final-3segments-2m40-20261104.mp4');
    expect(html).toContain('aria-label="Previous slide"');
    expect(html).toContain('aria-label="Next slide"');
    expect(html.match(/aria-label="Show slide [1-8]:/g)).toHaveLength(8);
    expect(html).toContain('aria-current="true"');
  });

  it('loads just the selected image pair, reserves its size, and supplies HTML copy for the outlined text', () => {
    const html = landing();
    expect(html).toContain('/assets/landing-carousel/slide-01-background.jpg');
    expect(html).toContain('/assets/landing-carousel/slide-01-overlay.svg');
    expect(html).not.toContain('/assets/landing-carousel/slide-02-');
    expect(html).toContain('width="1600" height="900" loading="lazy" decoding="async"');
    expect(html).toContain('<h3>One trip board. Your own magazine.</h3>');
    expect(html).toContain('Bring your bookings, saved places and photos into one trip board.');
    expect(html).toContain('aria-live="polite"');
  });

  it.each([
    ['01', 'One trip board. Your own magazine.', 'then turn the trip into a magazine to keep.'],
    ['02', 'Build a trip together.', 'so you can plan with everyone’s ideas.'],
    ['03', 'Use ranked-choice voting.', 'When the group wants different things, each household ranks its favorite places.'],
    ['04', 'Make a scrapbook of your trip.', 'Keep the stories behind your photos.'],
    ['05', 'Create your own travel magazine.', 'an HTML magazine to read in a browser'],
    ['06', 'Find souvenirs. Choose gifts.', 'save favorites as souvenir or gift ideas.'],
    ['07', 'Share your trip. Keep notes private.', 'without sending your private notes and photos.'],
    ['08', 'Build your magazine as you travel.', 'while the details are fresh.'],
  ])('names the actual feature in slide %s, including its outlined overlay’s accessible copy', (number, title, feature) => {
    const svg = readFileSync(new URL(`../../public/assets/landing-carousel/slide-${number}-overlay.svg`, import.meta.url), 'utf8');
    expect(svg).toContain(`aria-label="${title}: `);
    expect(svg).toContain(feature);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
  });

  it('describes external Muse support and distinguishes generated scenes from physical products', () => {
    const html = landing();
    expect(html).toContain('Works with Muse AI. Ask Muse to open Ministry of Tourism and help plan your trip, or use the board yourself.');
    expect(html).not.toContain('Muse is not connected yet');
    expect(html).toContain('AI-generated scenes');
    expect(html).toContain('shirt details may differ');
    expect(html).toContain('photo-book printing is a future idea');
  });
});
