// Type for writing. The interface is always IBM Plex; these pairings set the
// faces a writer reads and writes in: the draft (notebook), the handwriting
// on cards, notes and guide labels, and the typewriter. A choice per person,
// kept in this browser.
export const PAIRING_IDS = ['uncommon', 'literary', 'newsroom', 'clear', 'handwritten'] as const;
export type PairingId = (typeof PAIRING_IDS)[number];

export interface Pairing {
  id: PairingId;
  label: string;
  description: string;
  /** CSS font families. */
  draft: string;
  hand: string;
  typewriter: string;
  /** Handwriting faces differ in size; this evens them out on cards. */
  handScale: number;
  draftSize: number;
}

export const PAIRINGS: Record<PairingId, Pairing> = {
  uncommon: {
    id: 'uncommon',
    label: 'UnCommon',
    description: 'IBM Plex Serif drafts, Kalam handwriting, Plex Mono typewriter.',
    draft: "'IBM Plex Serif', Georgia, serif",
    hand: "'Kalam', cursive",
    typewriter: "'IBM Plex Mono', monospace",
    handScale: 1,
    draftSize: 18,
  },
  literary: {
    id: 'literary',
    label: 'Literary',
    description: 'EB Garamond drafts, Caveat handwriting, Courier Prime typewriter.',
    draft: "'EB Garamond', Georgia, serif",
    hand: "'Caveat', cursive",
    typewriter: "'Courier Prime', 'Courier New', monospace",
    handScale: 1.18,
    draftSize: 20,
  },
  newsroom: {
    id: 'newsroom',
    label: 'Newsroom',
    description: 'Source Serif drafts, Patrick Hand handwriting, Plex Mono typewriter.',
    draft: "'Source Serif 4', Georgia, serif",
    hand: "'Patrick Hand', cursive",
    typewriter: "'IBM Plex Mono', monospace",
    handScale: 1.05,
    draftSize: 18,
  },
  clear: {
    id: 'clear',
    label: 'Clear',
    description: 'Atkinson Hyperlegible throughout: made for readers with low vision.',
    draft: "'Atkinson Hyperlegible', system-ui, sans-serif",
    hand: "'Atkinson Hyperlegible', system-ui, sans-serif",
    typewriter: "'Atkinson Hyperlegible Mono', monospace",
    handScale: 0.92,
    draftSize: 18,
  },
  handwritten: {
    id: 'handwritten',
    label: 'All handwritten',
    description: 'Kalam everywhere you write, with a Courier Prime typewriter.',
    draft: "'Kalam', cursive",
    hand: "'Kalam', cursive",
    typewriter: "'Courier Prime', 'Courier New', monospace",
    handScale: 1,
    draftSize: 19,
  },
};

export const DEFAULT_PAIRING: PairingId = 'uncommon';
