// Preparing a pasted piece: lines from a copied web essay (with its figure
// leftovers and citation markers), a poem, and a story with short dialogue.
import { describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import type { BoardView } from '../commands/board-commands.ts';
import { BoardSession } from '../commands/session.ts';
import { applyReverseEngineer, mergeReverseResults, preparePiece, reverseEngineerPartPrompts, reverseEngineerSystemPrompt, type ReverseEngineerResult } from './reverse-engineer.ts';

const SCRAPE = [
  'Neural Networks Are Already Clean',
  'Pause',
  'The Short Version',
  'I think I have good news about the nature of neural networks.',
  'In 2019, Chris Olah and I found the circuit that was originally introduced as the superposition phenomenon in Zoom In[4]',
  '. It showed a car feature appearing to spread into a set of unrelated dog neurons.',
  'Anthropic’s Towards Monosemanticity[10]',
  ' (2023), studying a small one-layer model, gave the median neuron a 0 on its rubric out of a possible 14.',
  'Rank 1: ladybug',
  'Rank 2: ladybug',
  '+49.25',
  'Ladybugs · Neuron 127',
  'Cars and Animals',
  'The most famous polysemantic neuron is 4e:55 of InceptionV1, which looked like an arbitrary mixture of cats and cars.',
  'In Zoom In, which I co-authored, we said outright that it “isn’t responding to some commonality of cars and cat faces”.2',
  '',
  'After months of seeing clean neurons, I wondered if we’d misinterpreted some early prominent examples of polysemanticity and superposition.',
].join('\n');

describe('preparing a pasted piece', () => {
  const piece = preparePiece(SCRAPE);

  it('takes out citation markers and rejoins the lines they broke', () => {
    expect(piece.markers).toBe(2);
    expect(piece.text).toContain('phenomenon in Zoom In. It showed a car feature');
    expect(piece.text).toContain('Towards Monosemanticity (2023), studying');
    expect(piece.text).toContain('cars and cat faces”.\n\nAfter months');
    expect(piece.text).not.toMatch(/\[\d+\]/);
  });

  it('leaves out figure leftovers but keeps section headings', () => {
    expect(piece.removed).toEqual(expect.arrayContaining(['Pause', 'Rank 1: ladybug', '+49.25', 'Ladybugs · Neuron 127']));
    // The first line is the piece's title, even though a figure label follows it.
    expect(piece.sections.map((s) => s.title)).toEqual(['Neural Networks Are Already Clean', 'The Short Version', 'Cars and Animals']);
    expect(piece.text.startsWith('Neural Networks Are Already Clean\n\nThe Short Version')).toBe(true);
    expect(piece.paragraphs.filter((p) => !p.heading).map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('leaves a poem alone: its short lines are the poem', () => {
    const poem = 'The kettle sang\nbefore the dawn\nand no one moved\n\nGran at the stove\nher blue mug\nchipped at the lip';
    const read = preparePiece(poem);
    expect(read.removed).toEqual([]);
    expect(read.text.split('\n\n')).toHaveLength(6);
  });

  it('keeps short dialogue in a story', () => {
    const story = [
      'She set the mug down on the windowsill and looked at me for a long time without saying anything at all.',
      '“No.”',
      '“Why not?”',
      'The kettle started up again, quietly at first and then louder, until neither of us could pretend not to hear it.',
    ].join('\n\n');
    expect(preparePiece(story).removed).toEqual([]);
  });

  it('splits a long piece into parts at its headings, numbering paragraphs straight through', () => {
    const section = (title: string) => [title, ...Array.from({ length: 30 }, (_, i) => `${title} paragraph ${i + 1} ${'turns the argument over once more and looks again at the evidence. '.repeat(5)}`)];
    const long = preparePiece(['Alpha', 'Beta', 'Gamma', 'Delta'].flatMap(section).join('\n\n'));
    expect(long.parts.length).toBeGreaterThan(1);
    expect(long.parts[0]!.first).toBe(1);
    for (let i = 1; i < long.parts.length; i++) expect(long.parts[i]!.first).toBe(long.parts[i - 1]!.last + 1);
    expect(long.parts.at(-1)!.last).toBe(120);
    const prompts = reverseEngineerPartPrompts('Long', long);
    expect(prompts).toHaveLength(long.parts.length);
    expect(prompts[1]).toContain(`part 2 of ${long.parts.length}`);
    expect(prompts[1]).toContain('at most one card per type');
    expect(prompts[1]).toMatch(/§ (Beta|Gamma|Delta)/);
  });
});

describe('reading nonfiction', () => {
  it('asks for the kind of piece and gives the nonfiction reading', () => {
    const system = reverseEngineerSystemPrompt();
    expect(system).toContain('First decide what kind of piece it is');
    expect(system).toContain('A Character can be a thinker');
    expect(system).toContain('do not stretch a dry passage');
  });
});

describe('merging parts', () => {
  it('keeps paragraphs in order and at most two cards of a type', () => {
    const part = (kind: ReverseEngineerResult['kind'], from: number): ReverseEngineerResult => ({
      kind,
      paragraphs: [{ index: from, question: `Q${from}` }],
      cards: [{ type: 'idea.thesis', quote: `q${from}`, why: 'w', paragraph: from }],
    });
    const merged = mergeReverseResults([part('argument', 3), part('argument', 1), part('personal essay', 2)]);
    expect(merged.kind).toBe('argument');
    expect(merged.paragraphs.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(merged.cards).toHaveLength(2);
  });
});

describe('placing a long piece', () => {
  it('stores the cleaned text and gives the timeline one stop per section', () => {
    const writer: Actor = { kind: 'agent', id: 'agent:reverse-engineer', name: 'Reverse Engineer' };
    let n = 0;
    const session = new BoardSession(createBoard({ starterCards: false }), { newId: () => `id-${++n}` });
    const text = ['Alpha', 'Beta', 'Gamma'].flatMap((t) => [t, ...Array.from({ length: 30 }, (_, i) => `${t} paragraph ${i + 1}[${i + 1}] holds its ground. ${'Evidence follows evidence here. '.repeat(20)}`)]).join('\n\n');
    const piece = preparePiece(text);
    expect(piece.parts.length).toBeGreaterThan(1);
    const result: ReverseEngineerResult = {
      kind: 'argument',
      paragraphs: piece.paragraphs.filter((p) => !p.heading).map((p) => ({ index: p.index, question: `Why ${p.index}?` })),
      cards: [{ type: 'form.structure', quote: 'Beta paragraph 1 holds its ground.', why: 'Opens the second section.', paragraph: 31 }],
    };
    const outcome = applyReverseEngineer(session, writer, { title: 'Long', text }, result, { x: 0, y: 900 }, piece);
    const board = session.execute<BoardView>(writer, 'board_read');
    expect(outcome).toMatchObject({ kind: 'argument', parts: piece.parts.length, markers: 90 });
    expect(board.sources[0]!.text).not.toMatch(/\[\d+\]/);
    expect(board.guides[0]!.stops.map((s) => s.label)).toEqual(['Alpha: Why 1?', 'Beta: Why 31?', 'Gamma: Why 61?']);
    expect(outcome.placed).toHaveLength(1);
  });
});

describe('pieces as people paste them', () => {
  it('joins hard-wrapped lines in prose', () => {
    const story = [
      'He took his eyes off the road to look at her and said that as far as he was concerned they could go home and see that',
      'lawyer you wanted to talk to, because none of this was working at all anymore.',
      'She faced forward again, her expression stonily set, and did not answer him for a long while.',
    ].join('\n');
    const read = preparePiece(story);
    expect(read.paragraphs).toHaveLength(2);
    expect(read.text).toContain('see that lawyer you wanted');
  });

  it('treats roman-numeral section marks as headings', () => {
    const essay = [
      'Francis Bacon dreamed of abolishing disease, natural disasters, and chance itself, and he hid a stranger dream as well.',
      'II.',
      'In 1953, Josef Pieper wrote that the name rings strangely on the modern ear, and by now it sounds antediluvian.',
    ].join('\n\n');
    const read = preparePiece(essay);
    expect(read.sections.map((s) => s.title)).toEqual(['II.']);
    expect(read.paragraphs.filter((p) => !p.heading)).toHaveLength(2);
  });
});

describe('titles, subtitles and captions', () => {
  it('keeps a title and its subtitle, and drops captions that end with a date', () => {
    const piece = preparePiece(
      [
        'The Future is for Everyone',
        'The Path to a Positive AI Future',
        'We are fortunate to live at an incredible moment in history, and the next few years will show how fortunate.',
        'The medieval encyclopedia Liber Floridus shows the Antichrist surfing waves atop the sea demon Leviathan.',
        'The Antichrist atop Leviathan, Liber Floridus (c. 1120)',
        'For Bacon, control of the oceans was too important to leave to God, and he wrote at the end of an age.',
      ].join('\n\n'),
    );
    expect(piece.sections.map((s) => s.title)).toEqual(['The Future is for Everyone', 'The Path to a Positive AI Future']);
    expect(piece.removed).toEqual(['The Antichrist atop Leviathan, Liber Floridus (c. 1120)']);
  });
});
