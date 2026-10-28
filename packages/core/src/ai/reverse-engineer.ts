// Reverse Engineer: a model reads a pasted piece and maps it onto the four
// columns. This module holds everything except the network call: the prompt,
// the answer's shape, and placing the answer on the board. Every quote is
// checked against the source; the model only quotes and labels.
import { z } from 'zod';
import { FRAMEWORK_CARDS, getFrameworkCard, type CardTypeId } from '../framework/catalog.ts';
import { findQuote } from '../doc/links.ts';
import { LANES } from '../doc/model.ts';
import type { Actor } from '../doc/model.ts';
import { CommandError } from '../commands/define.ts';
import type { BoardSession } from '../commands/session.ts';

const CARD_TYPES = FRAMEWORK_CARDS.map((c) => c.id) as [CardTypeId, ...CardTypeId[]];

export const PIECE_KINDS = ['story', 'personal essay', 'argument', 'poem', 'other'] as const;

export const ReverseEngineerResult = z.object({
  kind: z.enum(PIECE_KINDS).describe('What kind of piece this is, decided before choosing cards'),
  paragraphs: z
    .array(
      z.object({
        index: z.number().int(),
        question: z.string().describe('The hidden question this paragraph answers for the reader, in under 12 words; an empty string if it answers none'),
      }),
    )
    .describe('One entry per paragraph of the source, in order'),
  cards: z
    .array(
      z.object({
        type: z.enum(CARD_TYPES).describe('One of the 48 framework card ids'),
        quote: z.string().describe('An exact, contiguous excerpt from the source, copied character for character, under 300 characters'),
        why: z.string().describe('Why this passage works, in one short sentence'),
        paragraph: z.number().int().describe('Which paragraph the quote comes from'),
      }),
    )
    .describe('Framework cards found in the source, each tied to one exact quote'),
});

export type ReverseEngineerResult = z.infer<typeof ReverseEngineerResult>;

export function reverseEngineerSystemPrompt(): string {
  const columns = ['NOUNS', 'IDEA', 'FORM', 'VOICE']
    .map((category) => {
      const cards = FRAMEWORK_CARDS.filter((c) => c.category === category)
        .map((c) => `- ${c.id} (${c.name}): ${c.question}`)
        .join('\n');
      return `${category}\n${cards}`;
    })
    .join('\n\n');
  return [
    'You map a piece of writing onto a fixed framework of 48 card types in four columns, so a writer can see how and why the piece works.',
    'The card types are fixed. Use only these ids:',
    columns,
    'Rules:',
    '- Every quote must be copied exactly from the source: same words, punctuation and spacing. Never paraphrase, fix or shorten inside a quote.',
    '- Keep quotes short: the smallest passage that shows the pattern, under 300 characters.',
    '- Use a card type more than once when the piece does (for example, several characters).',
    '- Cover all four columns where the piece supports it; skip a card type rather than force it.',
    '- "why" is one plain sentence about what the passage does for the reader. Do not rewrite the passage.',
    '- For each numbered paragraph, give the hidden question it answers for the reader. Section headings are not paragraphs.',
    '- First decide what kind of piece it is (story, personal essay, argument, poem, other), and read the cards through that kind.',
    '',
    'Reading nonfiction (arguments and essays):',
    "- Nouns cards still apply, read through the argument. A Character can be a thinker, a group, or a thing the piece treats as a protagonist (a neuron, a company, a law). A Setting can be a field, an institution, a lab or an era. Tool and Object are the instruments and evidence the argument handles. Time is a date or period in the argument's own history.",
    '- Weather, Texture and Imagery count only when the language is literal or a deliberate image; do not stretch a dry passage to fill them.',
    '- Idea cards carry most of an argument: name its Thesis, the steps of its Argument, its Material (data, experiments), its References, and the Mystery it leaves open.',
    '- Form cards follow how the case is built: how it opens, how sections hand off, where it concedes, and how it closes.',
  ].join('\n');
}

export function reverseEngineerUserPrompt(title: string, text: string): string {
  return reverseEngineerPartPrompts(title, preparePiece(text))[0]!;
}

/** One prompt per part of the piece; a short piece is a single part. */
export function reverseEngineerPartPrompts(title: string, piece: PreparedPiece): string[] {
  return piece.parts.map((part, i) => {
    const body = piece.paragraphs
      .filter((p) => p.index >= part.first && p.index <= part.last)
      .map((p) => (p.heading ? `§ ${p.text}` : `[${p.index}] ${p.text}`))
      .join('\n\n');
    const intro =
      piece.parts.length === 1
        ? 'Source, with paragraph numbers in brackets (the numbers are not part of the text). Lines starting with § are section headings.'
        : [
            `This is part ${i + 1} of ${piece.parts.length} of a long piece${part.title ? `, starting at the section “${part.title}”` : ''}.`,
            `Paragraph numbers continue across parts; give a question for each numbered paragraph in this part only (${part.first} to ${part.last}).`,
            'Give only the strongest examples: at most one card per type for this part. Lines starting with § are section headings.',
          ].join(' ');
    return `Title: ${title}\n\n${intro}\n\n${body}`;
  });
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * What gets read and quoted: the piece without citation markers or the
 * leftovers of a copied web page (figure labels, numbers, buttons), with
 * prose paragraphs numbered and section headings kept, split into parts when
 * it's too long for one reading.
 */
export interface PreparedPiece {
  /** The cleaned text: stored as the source, so every quote matches it. */
  text: string;
  /** Numbered prose paragraphs, and headings (numbered with the paragraph after them, flagged as headings). */
  paragraphs: { index: number; text: string; heading: boolean }[];
  /** Paragraph-number ranges read together, one model call each. */
  parts: { title: string; first: number; last: number }[];
  /** Section headings, with the first paragraph number under each. */
  sections: { title: string; first: number }[];
  /** Lines left out as figure or page debris. */
  removed: string[];
  /** Citation markers like [4] taken out. */
  markers: number;
}

const PART_WORDS = 3500;
const MAX_PART_WORDS = 6000;

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
/** How much of a line is letters, not counting spaces or punctuation (so “No.” is all letters). */
const letterShare = (s: string) => {
  const visible = s.replace(/[\s\p{P}]/gu, '');
  return visible ? (visible.match(/\p{L}/gu)?.length ?? 0) / visible.length : 0;
};
/** Ends a sentence (allowing a closing quote or bracket), or leads into a list. */
const endsSentence = (s: string) => /[.?!…:]["'”’)\]]*$/.test(s.trim());
/** A one-word line counts only as a spoken line, like “No.” (not a fragment like "ps:"). */
const isLoneWordSpeech = (s: string) => /^["“‘']?\p{Lu}\p{L}*[.?!…]["”’']*$/u.test(s.trim());
const isProse = (s: string) =>
  letterShare(s) > 0.6 &&
  (wordCount(s) > 1 || isLoneWordSpeech(s)) &&
  // A long line can also stop mid-word or mid-speech ("…isn't working at -'"), closing quotes and all.
  (endsSentence(s) || (wordCount(s) >= 12 && /(?:[,;—–-]|\p{L})["'”’)\]]*$/u.test(s.trim())));
const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
const looksLikeHeading = (s: string) =>
  wordCount(s) >= 1 &&
  wordCount(s) <= 9 &&
  s.length <= 70 &&
  /^\p{Lu}/u.test(s.trim()) &&
  letterShare(s) > 0.8 &&
  !/[.,;:]$/.test(s.trim()) &&
  // An image caption ends with its date, "(1504)" or "(c. 1120)"; a heading doesn't.
  !/\(\D*\d[^)]*\)$/.test(s.trim());

/** `skipDebris: false` keeps every line as pasted (citation markers still come out). */
export function preparePiece(raw: string, options: { skipDebris?: boolean } = {}): PreparedPiece {
  let markers = 0;
  let text = raw.replace(/\r\n?/g, '\n');
  // Citation markers: "Zoom In[4]" and "[8, 12]". A marker that broke the line
  // ("Zoom In[4]⏎. It showed") is rejoined with the text after it.
  text = text.replace(/\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]([ \t]*\n[ \t]*)?/g, (_m: string, broke: string | undefined, offset: number, whole: string) => {
    markers++;
    if (!broke) return '';
    const next = whole.charAt(offset + _m.length);
    return /[.,;:!?)’”'"]/.test(next) ? '' : ' ';
  });
  // A footnote number glued to the end of a sentence (“…cat faces”.2"), or to a
  // word just before a line break; never the digits of a number like 49.25.
  text = text.replace(/(\p{L}["”’]?[.!?]["”’]?)\d{1,2}(?=\n)/gu, '$1').replace(/(\p{Ll})\d{1,2}\n+(?=[.,;:])/gu, '$1');

  let lines = splitParagraphs(text);
  const proseWords = lines.filter(isProse).reduce((n, l) => n + wordCount(l), 0);
  const allWords = lines.reduce((n, l) => n + wordCount(l), 0);
  // Only a mostly-prose piece gets filtered: a poem's short lines are the poem.
  const prose = allWords > 0 && proseWords / allWords > 0.6;
  const filter = options.skipDebris !== false && prose;
  // In prose, a long line that stops mid-sentence before a lowercase word was
  // hard-wrapped ("go home and see that⏎lawyer you wanted"): join it back up.
  if (prose) lines = splitParagraphs(text.replace(/([^\n]{40,}[^\n.?!:;"”’)\]])\n(?=\p{Ll})/gu, '$1 '));

  const kept: { text: string; heading: boolean }[] = [];
  const removed: string[] = [];
  lines.forEach((line, i) => {
    // Numbered sections ("II.", "IV") are headings when prose follows them.
    if (filter && /^[IVXLC]{1,6}\.?$/.test(line.trim()) && lines[i + 1] && isProse(lines[i + 1]!)) {
      kept.push({ text: line, heading: true });
      return;
    }
    if (!filter || isProse(line)) {
      kept.push({ text: line, heading: false });
      return;
    }
    const next = lines[i + 1];
    // A line that starts like the one above it ("Rank 5…", "Rank 6…") belongs to a list, not a heading.
    // (Only when that line above was dropped: a title and subtitle can both start with "The".)
    const inList = i > 0 && removed.at(-1) === lines[i - 1] && firstWord(lines[i - 1]!) === firstWord(line);
    // A lone word right after page clutter ("Share", "Article") is clutter too.
    const afterClutter = wordCount(line) === 1 && removed.at(-1) === lines[i - 1];
    // The piece's first line is its title, whatever follows it (a byline, a date).
    const isTitle = i === 0 && wordCount(line) <= 12 && line.length <= 90 && letterShare(line) > 0.8 && !/[.,;:]$/.test(line.trim());
    if (isTitle || (looksLikeHeading(line) && !inList && !afterClutter && next && isProse(next) && wordCount(next) >= 12)) kept.push({ text: line, heading: true });
    else removed.push(line);
  });

  let n = 0;
  const paragraphs = kept.map((p) => (p.heading ? { ...p, index: n + 1 } : { ...p, index: ++n }));
  const sections = paragraphs.filter((p) => p.heading).map((p) => ({ title: p.text, first: p.index }));

  // Parts break at a heading once they have enough words, and anywhere if one runs far too long.
  const parts: (PreparedPiece['parts'][number] & { words: number })[] = [];
  for (const p of paragraphs) {
    const current = parts.at(-1);
    if (!current || (p.heading && current.words >= PART_WORDS) || (!p.heading && current.words >= MAX_PART_WORDS)) {
      parts.push({ title: p.heading ? p.text : '', first: p.index, last: p.index - 1, words: 0 });
    }
    const part = parts.at(-1)!;
    if (!p.heading) {
      part.last = p.index;
      part.words += wordCount(p.text);
    }
  }
  const real = parts.filter((p) => p.last >= p.first).map(({ title, first, last }) => ({ title, first, last }));

  return {
    text: kept.map((p) => p.text).join('\n\n'),
    paragraphs,
    parts: real.length ? real : [{ title: '', first: 1, last: 0 }],
    sections,
    removed,
    markers,
  };
}

/** One answer from several parts: paragraphs in order, and at most two cards of any type. */
export function mergeReverseResults(results: ReverseEngineerResult[]): ReverseEngineerResult {
  const tally = new Map<ReverseEngineerResult['kind'], number>();
  for (const r of results) tally.set(r.kind, (tally.get(r.kind) ?? 0) + 1);
  const kind = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const perType = new Map<string, number>();
  const cards = results
    .flatMap((r) => r.cards)
    .filter((c) => {
      const seen = perType.get(c.type) ?? 0;
      perType.set(c.type, seen + 1);
      return seen < 2;
    });
  const seen = new Set<number>();
  const paragraphs = results
    .flatMap((r) => r.paragraphs)
    .filter((p) => (seen.has(p.index) ? false : (seen.add(p.index), true)))
    .sort((a, b) => a.index - b.index);
  return { kind, paragraphs, cards };
}

// Typographic differences models often introduce when copying.
function normalizeChar(ch: string): string {
  if ('‘’‚‛′'.includes(ch)) return "'";
  if ('“”„‟″'.includes(ch)) return '"';
  if ('‐‑‒–—―'.includes(ch)) return '-';
  if (/\s/.test(ch)) return ' ';
  return ch;
}

/**
 * Finds a quote in the source even if the model changed curly quotes, dashes
 * or spacing. Returns the source's own text for that span (so what gets
 * linked is always verbatim source), or null.
 */
export function locateLoose(source: string, quote: string): string | null {
  if (findQuote(source, quote).ok || source.includes(quote)) return quote;
  const map: number[] = [];
  let normalized = '';
  for (let i = 0; i < source.length; i++) {
    const ch = normalizeChar(source[i]!);
    if (ch === ' ' && normalized.endsWith(' ')) continue;
    normalized += ch;
    map.push(i);
  }
  const needle = [...quote.trim()].map(normalizeChar).join('').replace(/ +/g, ' ');
  const at = normalized.indexOf(needle);
  if (at === -1 || !needle) return null;
  const start = map[at]!;
  const end = map[at + needle.length - 1]! + 1;
  return source.slice(start, end);
}

export interface ReverseEngineerOutcome {
  sourceId: string;
  guideId: string | null;
  kind: ReverseEngineerResult['kind'];
  /** How the piece was read: in how many parts, and what was left out of it. */
  parts: number;
  removed: number;
  markers: number;
  placed: { cardId: string; type: string; quote: string }[];
  rejected: { type: string; quote: string; reason: string }[];
}

/**
 * Places the model's answer on the board as one agent run, so a single
 * "undo agent run" removes all of it.
 */
export function applyReverseEngineer(
  session: BoardSession,
  agent: Actor,
  input: { title: string; author?: string; text: string },
  result: ReverseEngineerResult,
  origin: { x: number; y: number },
  piece: PreparedPiece = preparePiece(input.text),
): ReverseEngineerOutcome {
  const outcome: ReverseEngineerOutcome = {
    sourceId: '',
    guideId: null,
    kind: result.kind,
    parts: piece.parts.length,
    removed: piece.removed.length,
    markers: piece.markers,
    placed: [],
    rejected: [],
  };
  // The cleaned text is what's stored and quoted, so every card links to it.
  input = { ...input, text: piece.text };
  session.beginRun(agent);
  try {
    outcome.sourceId = session.execute<{ id: string }>(agent, 'source_add', input).id;

    // Form cards follow the piece along a timeline of its hidden questions: one
    // stop per paragraph, or for a long piece one per section, so the timeline
    // stays readable.
    const answered = [...result.paragraphs].sort((a, b) => a.index - b.index);
    const bySection = piece.parts.length > 1 && piece.sections.length > 1;
    const paragraphs = bySection
      ? piece.sections.map((section) => ({
          index: section.first,
          question: `${section.title}: ${answered.find((p) => p.index >= section.first)?.question.trim() || 'what does this section answer?'}`,
        }))
      : answered;
    const slotOf = (paragraph: number) =>
      bySection ? Math.max(0, piece.sections.findLastIndex((s) => s.first <= paragraph)) : Math.max(0, paragraphs.findIndex((p) => p.index === paragraph));
    const timelineY = origin.y;
    const spacing = 300;
    const length = Math.max(1, paragraphs.length - 1) * spacing;
    if (paragraphs.length > 1) {
      const guide = session.execute<{ id: string }>(agent, 'guide_create', { preset: 'timeline', x: origin.x, y: timelineY });
      outcome.guideId = guide.id;
      session.execute(agent, 'guide_update', {
        id: guide.id,
        title: `${input.title}: paragraph by paragraph`,
        points: [
          [origin.x, timelineY],
          [origin.x + length, timelineY],
        ],
        stops: paragraphs.map((p, i) => ({
          id: `p${p.index}`,
          t: paragraphs.length === 1 ? 0 : i / (paragraphs.length - 1),
          label: bySection ? p.question : `${p.index}. ${p.question.trim() || 'Answers no question: cut or rewrite?'}`,
        })),
      });
    }

    const formRows = new Map<number, number>();
    // Form cards go first, under their paragraph on the timeline; the other
    // three columns form a block below them, one column each.
    const ROW = 168;
    const verified = result.cards.flatMap((card) => {
      const quote = locateLoose(input.text, card.quote);
      if (quote) return [{ ...card, quote, category: getFrameworkCard(card.type)!.category }];
      outcome.rejected.push({ type: card.type, quote: card.quote, reason: 'not in the source' });
      return [];
    });
    const positions = new Map<(typeof verified)[number], { x: number; y: number }>();
    for (const card of verified.filter((c) => c.category === 'FORM')) {
      const slot = slotOf(card.paragraph);
      const row = formRows.get(slot) ?? 0;
      formRows.set(slot, row + 1);
      positions.set(card, { x: origin.x + slot * spacing - 120, y: timelineY + 90 + row * ROW });
    }
    const blockTop = timelineY + 90 + Math.max(0, ...formRows.values()) * ROW + 60;
    (['NOUNS', 'IDEA', 'VOICE'] as const).forEach((category, column) => {
      verified
        .filter((c) => c.category === category)
        .forEach((card, row) => positions.set(card, { x: origin.x - 120 + column * spacing, y: blockTop + row * ROW }));
    });

    for (const card of verified) {
      const quote = card.quote;
      const occurrence = countBefore(piece, quote, card.paragraph);
      const position = positions.get(card);
      try {
        const created = session.execute<{ cardId: string }>(agent, 'card_create_from_quote', {
          type: card.type,
          sourceId: outcome.sourceId,
          quote,
          occurrence,
          annotation: card.why.slice(0, 2000),
          ...position,
        });
        outcome.placed.push({ cardId: created.cardId, type: card.type, quote });
      } catch (error) {
        const reason = error instanceof CommandError ? error.message : String(error);
        outcome.rejected.push({ type: card.type, quote: card.quote, reason });
      }
    }
  } finally {
    session.endRun(agent);
  }
  return outcome;
}

/** Picks the occurrence of the quote that falls in (or after) the given paragraph. */
function countBefore(piece: PreparedPiece, quote: string, paragraph: number): number | undefined {
  const text = piece.text;
  const hits: number[] = [];
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) hits.push(at);
  if (hits.length <= 1) return undefined;
  const target = piece.paragraphs.find((p) => !p.heading && p.index === paragraph)?.text;
  const paragraphStart = target ? text.indexOf(target) : 0;
  const index = hits.findIndex((h) => h >= paragraphStart);
  return (index === -1 ? 0 : index) + 1;
}

/** Where a Reverse Engineer timeline goes: under the lanes, clear of existing cards. */
export function reverseEngineerOrigin(lowestY: number): { x: number; y: number } {
  return { x: LANES.startX + 120, y: Math.max(lowestY + 220, 900) };
}
