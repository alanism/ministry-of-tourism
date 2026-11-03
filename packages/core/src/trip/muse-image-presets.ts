// Versioned prompt presets for in-app Muse Image generation (MOT-151).
// Each adapts read-only FCC prompt sources into a text-only request: Meta's images
// endpoint always returns an opaque background, so nothing here asks for transparency,
// and no preset refers to an attached reference image.

export const MUSE_IMAGE_MODEL = 'muse-image-1.0';
export const MUSE_IMAGE_ASPECTS = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' } as const;
export type MuseImageAspect = keyof typeof MUSE_IMAGE_ASPECTS;
export type MuseImageMode = 'city' | 'venue';

export interface MuseImagePreset {
  id: string;
  version: number;
  mode: MuseImageMode;
  label: string;
  description: string;
  /** Read-only FCC source this adapts; revision is the commit inspected on 3 Nov 2026. */
  source: { path: string; revision: string; note: string };
  /** Variables the composed prompt needs; `subject` is always free text from the person. */
  variables: readonly ('city' | 'subject' | 'view')[];
  views?: readonly string[];
  defaultAspect: MuseImageAspect;
  background: 'opaque-paper';
  template: string;
}

const FCC_REVISION = 'The-Aria-Bangkok@611ad54';

// Adapted from MASTER_STYLE_PROMPT and AVOID_PROMPT in services/sketchPrompt.mjs, without the named-artist reference.
const STYLE = 'Moleskine travel sketchbook editorial illustration, urban sketching: confident clean black fine-liner ink lines with natural human imperfection, subtle visible graphite pencil texture for grounding, deliberate flat restrained watercolor washes, balanced asymmetry, ample negative space, 20-30% of the warm cream sketchbook paper left visible, analog warmth, spontaneous yet designed.';
const AVOID = 'No photorealism, CGI, 3D render, messy sketch, painterly smudging, airbrush, smooth gradients, perfect symmetry, generic cartoon, anime or chibi.';
const FRAME = 'Full standalone artwork on warm opaque cream paper: keep the whole subject inside the frame with generous margins on all sides. No text, lettering, signage words, logos, watermark, border, caption or magazine mockup.';

export const MUSE_IMAGE_PRESETS: readonly MuseImagePreset[] = [
  {
    id: 'fcc-city-landmark', version: 1, mode: 'city', label: 'City landmark or object',
    description: 'One complete landmark, food or everyday object of the city, centred with clear margins.',
    source: { path: 'scripts/city_object_illustrations.py', revision: FCC_REVISION, note: 'Object prompts ask for transparent square PNG cutouts; adapted to a framed illustration on opaque paper.' },
    variables: ['city', 'subject'], defaultAspect: 'square', background: 'opaque-paper',
    template: `${STYLE}\nSubject: ONE complete {subject} from {city}, gently angled three-quarter view, recognizable silhouette, natural material colours with a few restrained city accent colours. Simplify fine detail for editorial scale while preserving the structure. No people, crowds, hands or surrounding skyline.\n${FRAME}\n${AVOID}`,
  },
  {
    id: 'fcc-city-street', version: 1, mode: 'city', label: 'City street scene',
    description: 'A wide architectural street or square in the city, for a backdrop or opener.',
    source: { path: 'output/illustrations/city-backdrops-v1 (milan-piazza-v1.json pattern) and owner FCC Bangkok prompts of 3 Nov 2026', revision: FCC_REVISION, note: 'Backdrop pattern: architecture, one translucent colour band, mostly unfilled ink; text-only.' },
    variables: ['city', 'subject'], defaultAspect: 'landscape', background: 'opaque-paper',
    template: `${STYLE}\nSubject: a characteristic street scene in {city}: {subject}. Precise expressive architectural pen-line drawing, largely unfilled surfaces, fine crosshatching, one broad translucent muted colour band crossing the composition with ink lines readable through it. Only a few small distant figures at most, none prominent.\n${FRAME}\n${AVOID}`,
  },
  {
    id: 'mot-venue-sketch', version: 1, mode: 'venue', label: 'Venue sketch',
    description: 'A hotel, restaurant, café, shop or park the trip visits, as an editorial sketch.',
    source: { path: 'services/sketchPrompt.mjs (style) + MoT text-only venue adaptation', revision: FCC_REVISION, note: 'No canonical FCC venue facade/interior template was found; this is a new MoT adaptation of the FCC style block.' },
    variables: ['city', 'subject', 'view'], views: ['exterior facade', 'interior', 'garden or courtyard'], defaultAspect: 'landscape', background: 'opaque-paper',
    template: `${STYLE}\nSubject: an editorial travel-journal sketch of {subject} in {city}, {view}, as an artist imagines it: architectural pen-line drawing, slightly off-centre perspective, restrained watercolour accents. An illustration, not a record of the venue's actual appearance. No readable signs or brand marks, no prominent people.\n${FRAME}\n${AVOID}`,
  },
];

export interface MusePromptInput { city: string; subject: string; view?: string }

/** Venue and subject text is data: newlines and braces are flattened so it cannot add instructions or variables. */
const clean = (value: string, max: number) => value.replace(/[\r\n\t{}]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function museImagePreset(id: string): MuseImagePreset | undefined { return MUSE_IMAGE_PRESETS.find(preset => preset.id === id); }

export function composeMusePrompt(preset: MuseImagePreset, input: MusePromptInput): string {
  const city = clean(input.city, 80), subject = clean(input.subject, 200);
  if (!city) throw new Error('Choose a destination city first.');
  if (!subject) throw new Error('Describe the subject to draw.');
  const view = clean(input.view ?? preset.views?.[0] ?? '', 60);
  return preset.template.replaceAll('{city}', city).replaceAll('{subject}', subject).replaceAll('{view}', view);
}
