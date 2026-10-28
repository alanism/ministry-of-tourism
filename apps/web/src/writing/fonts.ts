// Loads the writing faces (bundled; nothing is fetched from a font service)
// and applies the chosen pairing: CSS roles for the page, and the handwriting
// file for text drawn on the 3D board.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/caveat/400.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/atkinson-hyperlegible-mono'; // index.css is the 400 weight
import '@fontsource/courier-prime/400.css';
import kalam from '@fontsource/kalam/files/kalam-latin-400-normal.woff?url';
import caveat from '@fontsource/caveat/files/caveat-latin-400-normal.woff?url';
import patrickHand from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff?url';
import atkinson from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff?url';
import { create } from 'zustand';
import { DEFAULT_PAIRING, PAIRINGS, PAIRING_IDS, type Pairing, type PairingId } from './pairings';

const KEY = 'writers-board:fonts';

/** The handwriting file for each pairing, for text drawn on the board. */
const HAND_FILES: Record<PairingId, string> = {
  uncommon: kalam,
  literary: caveat,
  newsroom: patrickHand,
  clear: atkinson,
  handwritten: kalam,
};

function saved(): PairingId {
  try {
    const value = localStorage.getItem(KEY);
    return (PAIRING_IDS as readonly string[]).includes(value ?? '') ? (value as PairingId) : DEFAULT_PAIRING;
  } catch {
    return DEFAULT_PAIRING;
  }
}

function apply(pairing: Pairing) {
  const root = document.documentElement.style;
  root.setProperty('--draft', pairing.draft);
  root.setProperty('--draft-size', `${pairing.draftSize}px`);
  root.setProperty('--hand', pairing.hand);
  root.setProperty('--hand-scale', String(pairing.handScale));
  root.setProperty('--typewriter', pairing.typewriter);
}

export const useFonts = create<{ pairing: PairingId; setPairing: (id: PairingId) => void }>((set) => ({
  pairing: saved(),
  setPairing: (pairing) => {
    try {
      localStorage.setItem(KEY, pairing);
    } catch {
      // Remembered only when storage is available.
    }
    apply(PAIRINGS[pairing]);
    set({ pairing });
  },
}));

apply(PAIRINGS[useFonts.getState().pairing]);

/** The current pairing, and its handwriting file for the board. */
export function useWritingType(): Pairing & { handFile: string } {
  const id = useFonts((s) => s.pairing);
  return { ...PAIRINGS[id], handFile: HAND_FILES[id] };
}
