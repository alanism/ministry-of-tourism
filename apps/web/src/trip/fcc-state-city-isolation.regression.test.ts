import { describe, expect, it } from 'vitest';
import type { FccCityContent, FccResult } from '@writers-board/core';
import { finishSourceLoad } from './fcc-state';

const loaded = (city: string, body = 'Before'): FccResult<FccCityContent> => ({
  status: 'ready',
  retrievedAt: '2026-10-28T00:00:00.000Z',
  sourceVersion: 'v1',
  value: {
    city: { id: city, name: city, countryCode: null, timeZone: null },
    articles: [{
      id: `${city}:11`,
      cityId: city,
      title: 'Article',
      body,
      source: {
        id: `${city}:11`,
        sourceId: '11',
        provider: 'fcc',
        url: 'https://example.org/story',
        canonicalUrl: 'https://example.org/story',
        cityId: city,
        kind: 'article',
        retrievedAt: '2026-10-28T00:00:00.000Z',
        version: 'v1',
        origin: 'editorial',
      },
    }],
    places: [],
    almanac: [],
  },
});

describe('MOT-79 selected-city source state isolation', () => {
  it('keeps the selected city copy when a ready result belongs to another city', () => {
    const previous = {
      result: loaded('san-sebastian'),
      pending: true,
      offline: false,
      updatedKeys: [] as string[],
    };

    const next = finishSourceLoad(previous, loaded('bangkok', 'Other city article'), 'san-sebastian', false);

    expect(next.pending).toBe(false);
    expect(next.result).toBe(previous.result);
    expect(next.result && next.result.status !== 'unavailable' && next.result.value.city.id).toBe('san-sebastian');
    expect(next.updatedKeys).toEqual([]);
  });

  it('does not expose another city as a stale fallback for the selected city', () => {
    const previous = {
      result: loaded('san-sebastian'),
      pending: true,
      offline: false,
      updatedKeys: [] as string[],
    };
    const otherCity = loaded('bangkok', 'Other city article');
    if (otherCity.status === 'unavailable') throw new Error('Expected a loaded other-city result.');
    const staleOtherCity: FccResult<FccCityContent> = {
      ...otherCity,
      status: 'stale',
      error: { code: 'network', message: 'Refresh failed' },
    };

    const next = finishSourceLoad(previous, staleOtherCity, 'san-sebastian', false);

    expect(next.result).toBe(previous.result);
    expect(next.result && next.result.status !== 'unavailable' && next.result.value.city.id).toBe('san-sebastian');
  });

  it('remains unavailable with invalid_feed for a wrong-city result when there is no prior result', () => {
    const previous = {
      pending: true,
      offline: false,
      updatedKeys: [] as string[],
    };

    const next = finishSourceLoad(previous, loaded('bangkok', 'Other city article'), 'san-sebastian', false);

    expect(next.pending).toBe(false);
    expect(next.result?.status).toBe('unavailable');
    expect(next.result?.status === 'unavailable' && next.result.error.code).toBe('invalid_feed');
    expect(next.failure?.code).toBe('invalid_feed');
  });

  it('retains same-city updated markers when rejecting a wrong-city result', () => {
    const previous = {
      result: loaded('san-sebastian'),
      pending: true,
      offline: false,
      updatedKeys: ['existing-marker'],
    };

    const next = finishSourceLoad(previous, loaded('bangkok', 'Other city article'), 'san-sebastian', false);

    expect(next.result).toBe(previous.result);
    expect(next.updatedKeys).toEqual(['existing-marker']);
    expect(next.failure?.code).toBe('invalid_feed');
  });
});
