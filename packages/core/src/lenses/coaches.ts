// Coach data built from the lens files (see scripts/build-lenses.ts).
// Coaches are named by role only.
import bundle from '../../content/lenses.json' with { type: 'json' };
import { LensBundleSchema, type Coach } from './build.ts';

const parsed = LensBundleSchema.parse(bundle);

export const COACHES: readonly Coach[] = Object.freeze(parsed.coaches);
export const TUTORING_LOOP = Object.freeze(parsed.tutoringLoop);

export function getCoach(id: string): Coach | undefined {
  return COACHES.find((coach) => coach.id === id);
}
