// Guide presets. A guide is a suggestion drawn on the board: a path (timeline,
// journey, arc) with labeled stops, or a 2x2 grid. Every guide can be hidden,
// stretched, bent and relabeled; cards never have to follow one.

export type Point = [number, number];

export interface GuideStop {
  id: string;
  /** Position along the path, 0 (start) to 1 (end). */
  t: number;
  label: string;
}

export type GuideKind = 'path' | 'quadrant';

export interface GuidePreset {
  id: string;
  title: string;
  kind: GuideKind;
  /** Which coach the preset comes from, by role (if any). */
  coachId?: string;
  /** Control points relative to where the guide is placed. A path passes through them. */
  points: Point[];
  stops: { t: number; label: string }[];
  /** Quadrant guides: axis names (x, then y) and quadrant names (top-left, top-right, bottom-left, bottom-right). */
  axes?: [string, string];
  quadrants?: [string, string, string, string];
}

const evenly = (labels: string[]) => labels.map((label, i) => ({ t: labels.length === 1 ? 0 : i / (labels.length - 1), label }));

export const GUIDE_PRESETS: readonly GuidePreset[] = [
  {
    id: 'timeline',
    title: 'Timeline',
    kind: 'path',
    points: [
      [0, 0],
      [960, 0],
    ],
    stops: evenly(['Beginning', '', 'Middle', '', 'End']),
  },
  {
    id: 'journey',
    title: 'Journey map',
    kind: 'path',
    points: [
      [0, 0],
      [260, -110],
      [520, 40],
      [780, -90],
      [1040, 0],
    ],
    stops: evenly(['', '', '', '', '']),
  },
  {
    id: 'heros-journey',
    title: "Hero's Journey",
    kind: 'path',
    points: [
      [0, 0],
      [300, 140],
      [600, 280],
      [900, 140],
      [1200, 0],
    ],
    stops: evenly([
      'Ordinary world',
      'Call to adventure',
      'Refusal',
      'Meeting the mentor',
      'Crossing the threshold',
      'Tests and allies',
      'Approach',
      'Ordeal',
      'Reward',
      'The road back',
      'Return changed',
      'Back home',
    ]),
  },
  {
    id: 'story-arc',
    title: 'Story arc',
    kind: 'path',
    coachId: 'storyteller',
    points: [
      [0, 0],
      [320, -90],
      [640, -230],
      [820, -280],
      [1000, -60],
      [1100, 0],
    ],
    stops: [
      { t: 0, label: 'Open with story' },
      { t: 0.2, label: 'Hide the destination' },
      { t: 0.42, label: 'Show through action' },
      { t: 0.6, label: 'Sensory detail' },
      { t: 0.74, label: 'Theme' },
      { t: 1, label: 'Twist' },
    ],
  },
  {
    id: 'picture-book',
    title: 'Picture book',
    kind: 'path',
    coachId: 'read-aloud-coach',
    points: [
      [0, 0],
      [1080, 0],
    ],
    stops: [
      { t: 0, label: 'Peaceful start' },
      { t: 0.45, label: 'Conflict arrives' },
      { t: 0.8, label: 'Happy resolution' },
      { t: 1, label: 'Last page (write it first)' },
    ],
  },
  {
    id: 'idea-pipeline',
    title: 'Idea pipeline',
    kind: 'path',
    coachId: 'explainer',
    points: [
      [0, 0],
      [1080, 0],
    ],
    stops: evenly(['Notice', 'Sit with it', 'Braid', 'Silent question', 'Draft fast', 'Read aloud', 'Wise criticism']),
  },
  {
    id: 'revision-loop',
    title: 'Revision loop',
    kind: 'path',
    coachId: 'essay-architect',
    points: [
      [0, 0],
      [720, 0],
    ],
    stops: evenly(['Draft freely', 'One-pattern passes', 'Reverse outline', 'Flash feedback']),
  },
  {
    id: 'novelty-importance',
    title: 'Novelty × importance',
    kind: 'quadrant',
    coachId: 'explainer',
    points: [
      [0, 0],
      [640, 640],
    ],
    stops: [],
    axes: ['Novelty', 'Importance'],
    quadrants: ['Important, familiar', 'Write this', 'Skip', 'Novel, minor'],
  },
];

export function getGuidePreset(id: string): GuidePreset | undefined {
  return GUIDE_PRESETS.find((preset) => preset.id === id);
}
