// The read-aloud test: line up what the writer said with what the text says,
// word by word, and find the stumbles: skipped words, repeats, fillers,
// changed words and (when the transcript has timings) long pauses.

export interface SpokenWord {
  text: string;
  /** Seconds from the start of the recording, when the transcriber gives them. */
  start?: number;
  end?: number;
}

export type StumbleKind = 'skipped' | 'repeated' | 'filler' | 'changed' | 'pause';

export interface Stumble {
  kind: StumbleKind;
  /** The word in the text where it happened, and its character range. */
  word: string;
  start: number;
  end: number;
  /** What was said instead, for changed words and fillers. */
  spoken?: string;
}

export interface ReadingResult {
  stumbles: Stumble[];
  /** Share of the text's words read as written, 0 to 1. */
  accuracy: number;
  words: number;
  /** With `partial`, the stretch of the text that was read. */
  range?: { start: number; end: number };
}

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm']);
const PAUSE_SECONDS = 1.2;

interface Token {
  norm: string;
  text: string;
  start: number;
  end: number;
}

const normalize = (word: string) => word.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

export function textWords(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu)) {
    const norm = normalize(match[0]);
    if (norm) tokens.push({ norm, text: match[0], start: match.index!, end: match.index! + match[0].length });
  }
  return tokens;
}

/** Splits a plain transcript into words (when the transcriber gives no word list). */
export function transcriptWords(transcript: string): SpokenWord[] {
  return textWords(transcript).map((t) => ({ text: t.text }));
}

export interface AlignOptions {
  /** The writer read only part of the text: ignore unread words before the first and after the last word they read. */
  partial?: boolean;
}

export function alignReading(text: string, spoken: SpokenWord[], options: AlignOptions = {}): ReadingResult {
  const expected = textWords(text);
  const said = spoken.map((w) => ({ ...w, norm: normalize(w.text) })).filter((w) => w.norm);
  const n = expected.length;
  const m = said.length;

  // Longest common subsequence of words.
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = expected[i]!.norm === said[j]!.norm ? table[at(i + 1, j + 1)]! + 1 : Math.max(table[at(i + 1, j)]!, table[at(i, j + 1)]!);
    }
  }

  const stumbles: Stumble[] = [];
  const mark = (kind: StumbleKind, token: Token | undefined, spokenText?: string) => {
    const word = token ?? expected[expected.length - 1];
    if (word) stumbles.push({ kind, word: word.text, start: word.start, end: word.end, ...(spokenText ? { spoken: spokenText } : {}) });
  };

  let i = 0;
  let j = 0;
  let matched = 0;
  const matchedAt: number[] = [];
  let lastSpokenEnd: number | undefined;
  while (i < n || j < m) {
    if (i < n && j < m && expected[i]!.norm === said[j]!.norm) {
      const start = said[j]!.start;
      if (start !== undefined && lastSpokenEnd !== undefined && start - lastSpokenEnd > PAUSE_SECONDS) mark('pause', expected[i]);
      lastSpokenEnd = said[j]!.end ?? start ?? lastSpokenEnd;
      matched++;
      matchedAt.push(i);
      i++;
      j++;
    } else if (j < m && (i >= n || table[at(i, j + 1)]! >= table[at(i + 1, j)]!)) {
      // Said something the text doesn't have here.
      const word = said[j]!;
      const previous = said[j - 1]?.norm;
      if (FILLERS.has(word.norm)) mark('filler', expected[i], word.text);
      else if (word.norm === previous || word.norm === expected[i - 1]?.norm) mark('repeated', expected[i - 1] ?? expected[i], word.text);
      else if (i < n && !(j + 1 < m && said[j + 1]!.norm === expected[i]!.norm) && table[at(i + 1, j + 1)]! === table[at(i, j)]!) {
        // A substitution: this spoken word stands where the text's word should be.
        mark('changed', expected[i], word.text);
        i++;
      }
      lastSpokenEnd = word.end ?? word.start ?? lastSpokenEnd;
      j++;
    } else {
      mark('skipped', expected[i]);
      i++;
    }
  }

  if (options.partial && matchedAt.length > 0) {
    const first = expected[matchedAt[0]!]!.start;
    const last = expected[matchedAt[matchedAt.length - 1]!]!.end;
    const inside = stumbles.filter((s) => s.kind !== 'skipped' || (s.start >= first && s.end <= last));
    const read = matchedAt[matchedAt.length - 1]! - matchedAt[0]! + 1;
    return { stumbles: inside, accuracy: matched / read, words: read, range: { start: first, end: last } };
  }
  return { stumbles, accuracy: n ? matched / n : 1, words: n };
}

/** A one-line summary for the writer. */
export function describeReading(result: ReadingResult): string {
  if (result.stumbles.length === 0) return `Read cleanly: ${result.words} words, no stumbles.`;
  const counts = new Map<StumbleKind, number>();
  for (const s of result.stumbles) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, count]) => `${count} ${kind === 'pause' ? (count === 1 ? 'long pause' : 'long pauses') : kind}`);
  return `${result.stumbles.length} stumble${result.stumbles.length === 1 ? '' : 's'} (${parts.join(', ')}), ${Math.round(result.accuracy * 100)}% read as written.`;
}
