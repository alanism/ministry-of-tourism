import { describe, expect, it } from 'vitest';
import { alignReading, describeReading, transcriptWords } from './align.ts';

const TEXT = 'The kettle sang before dawn. Nobody moved.';
const said = (s: string) => transcriptWords(s);

describe('read-aloud alignment', () => {
  it('finds no stumbles in a clean reading, ignoring case and punctuation', () => {
    const result = alignReading(TEXT, said('the kettle sang before dawn nobody moved'));
    expect(result.stumbles).toEqual([]);
    expect(result.accuracy).toBe(1);
    expect(describeReading(result)).toBe('Read cleanly: 7 words, no stumbles.');
  });

  it('marks skipped words on the text', () => {
    const result = alignReading(TEXT, said('the kettle sang dawn nobody moved'));
    expect(result.stumbles).toEqual([{ kind: 'skipped', word: 'before', start: 16, end: 22 }]);
    expect(TEXT.slice(16, 22)).toBe('before');
  });

  it('marks repeats and fillers', () => {
    const result = alignReading(TEXT, said('the kettle kettle sang um before dawn nobody moved'));
    expect(result.stumbles.map((s) => [s.kind, s.word])).toEqual([
      ['repeated', 'kettle'],
      ['filler', 'before'],
    ]);
  });

  it('marks a changed word once, as changed rather than skipped', () => {
    const result = alignReading(TEXT, said('the kettle sang before dusk nobody moved'));
    expect(result.stumbles).toEqual([{ kind: 'changed', word: 'dawn', start: 23, end: 27, spoken: 'dusk' }]);
  });

  it('marks long pauses when the transcript has timings', () => {
    const words = ['the', 'kettle', 'sang', 'before', 'dawn', 'nobody', 'moved'].map((text, i) => ({
      text,
      start: i < 5 ? i * 0.4 : i * 0.4 + 2,
      end: i < 5 ? i * 0.4 + 0.3 : i * 0.4 + 2.3,
    }));
    const result = alignReading(TEXT, words);
    expect(result.stumbles).toEqual([{ kind: 'pause', word: 'Nobody', start: 29, end: 35 }]);
    expect(describeReading(result)).toBe('1 stumble (1 long pause), 100% read as written.');
  });

  it('ignores the unread rest of the text when reading only part', () => {
    const result = alignReading(TEXT, said('sang before dawn'), { partial: true });
    expect(result.stumbles).toEqual([]);
    expect(result.words).toBe(3);
    expect(TEXT.slice(result.range!.start, result.range!.end)).toBe('sang before dawn');
  });
});
