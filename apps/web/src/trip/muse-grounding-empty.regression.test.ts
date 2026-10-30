import { describe, expect, it } from 'vitest';
import { buildMuseRequest, createTrip, TripSession, type FccCityContent } from '@writers-board/core';

describe('MOT-82 Muse grounding truthfulness', () => {
  it('reports unavailable grounding when the selected-city issue contains no articles', () => {
    const session = new TripSession(createTrip({
      title: 'Grounding trip',
      city: 'San Sebastian',
      cityId: 'san-sebastian',
      timeZone: null,
    }));
    const emptyIssue: FccCityContent = {
      city: { id: 'san-sebastian', name: 'San Sebastian', countryCode: 'ES', timeZone: null },
      articles: [],
      places: [],
      almanac: [],
    };

    const request = buildMuseRequest(session, {
      prompt: 'Suggest a plan.',
      cardIds: [],
      cityContent: emptyIssue,
    });

    expect(request.grounding.cityId).toBe('san-sebastian');
    expect(request.grounding.articles).toEqual([]);
    expect(request.grounding.level).toBe('unavailable');
    session.destroy();
  });
});
