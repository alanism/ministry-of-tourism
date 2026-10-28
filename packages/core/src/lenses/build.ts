// Turns the lens markdown into the coach data the app ships (content/lenses.json).
// Shared by scripts/build-lenses.ts and the up-to-date test.
//
// coaches.json maps each coach to its lens file and to the key the lens files use
// to refer to it (`sourceKey`). That key is build input only: the shipped data
// names coaches by role and carries no source names.
import { z } from 'zod';
import { RoleCardSchema, TutoringLoopSchema, parseRoleCard, parseTutoringLoop } from './parse.ts';

export const CoachConfigSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/),
  role: z.string().min(1),
  dimension: z.string().min(1),
  question: z.string().min(1),
  sourceKey: z.string().min(1),
  file: z.string().endsWith('.md'),
});

export const CoachesConfigSchema = z.object({ coaches: z.array(CoachConfigSchema).length(5) });

export const CoachSchema = CoachConfigSchema.omit({ sourceKey: true, file: true }).extend({
  roleCard: RoleCardSchema.omit({ name: true }).extend({
    defersTo: z.array(z.object({ coachId: z.string(), when: z.string() })),
  }),
});

export const LensBundleSchema = z.object({
  coaches: z.array(CoachSchema).length(5),
  tutoringLoop: TutoringLoopSchema.omit({ complaints: true }).extend({
    complaints: z.array(
      z.object({ complaint: z.string(), coachIds: z.array(z.string()).min(1), hint: z.string() }),
    ),
  }),
});

export type Coach = z.infer<typeof CoachSchema>;
export type LensBundle = z.infer<typeof LensBundleSchema>;

export function buildLensBundle(config: unknown, readLens: (file: string) => string): LensBundle {
  const { coaches } = CoachesConfigSchema.parse(config);
  const byKey = new Map(coaches.map((c) => [c.sourceKey, c]));

  // Replaces each coach's source key with its role name in shipped text.
  const toRoles = (text: string) =>
    coaches.reduce((out, c) => out.replace(new RegExp(`\\b${c.sourceKey}\\b`, 'g'), c.role), text);

  const built = coaches.map(({ file, sourceKey: _key, ...coach }) => {
    const { name: _name, defersTo, ...card } = parseRoleCard(readLens(file));
    return {
      ...coach,
      roleCard: {
        coreMetaphor: toRoles(card.coreMetaphor),
        mission: toRoles(card.mission),
        activatesWhen: toRoles(card.activatesWhen),
        owns: card.owns.map(toRoles),
        vetoes: card.vetoes.map(toRoles),
        samplePhrases: card.samplePhrases.map(toRoles),
        outputFormat: card.outputFormat.map((check) => ({ name: toRoles(check.name), question: toRoles(check.question) })),
        // Hand-offs to lenses outside the writing coaches are dropped.
        defersTo: defersTo.flatMap((d) => {
          const target = byKey.get(d.to);
          return target ? [{ coachId: target.id, when: toRoles(d.when) }] : [];
        }),
      },
    };
  });

  const loop = parseTutoringLoop(readLens('parent_tutoring_loop.md'));
  const complaints = loop.complaints.map(({ complaint, lenses, hint }) => ({
    complaint,
    hint: toRoles(hint),
    coachIds: lenses.map((key) => {
      const coach = byKey.get(key);
      if (!coach) throw new Error(`Tutoring loop names an unknown lens "${key}"`);
      return coach.id;
    }),
  }));

  return LensBundleSchema.parse({ coaches: built, tutoringLoop: { complaints, moves: loop.moves, phrasing: loop.phrasing.map((p) => ({ instead: toRoles(p.instead), say: toRoles(p.say) })) } });
}
