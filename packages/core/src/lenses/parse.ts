// Parses the Role Card at the end of each lens file, and the routing table and
// moves in parent_tutoring_loop.md. Pure functions: no file access, so the
// build script and the tests share them.
import { z } from 'zod';

export const OutputCheckSchema = z.object({
  name: z.string().min(1),
  question: z.string().min(1),
});

export const DeferralSchema = z.object({
  to: z.string().min(1),
  when: z.string().min(1),
});

export const RoleCardSchema = z.object({
  name: z.string().min(1),
  coreMetaphor: z.string().min(1),
  mission: z.string().min(1),
  activatesWhen: z.string().min(1),
  owns: z.array(z.string().min(1)).min(3),
  defersTo: z.array(DeferralSchema).min(1),
  vetoes: z.array(z.string().min(1)).min(3),
  samplePhrases: z.array(z.string().min(1)).min(3),
  outputFormat: z.array(OutputCheckSchema).length(5),
});

export type RoleCard = z.infer<typeof RoleCardSchema>;

export const TutoringLoopSchema = z.object({
  complaints: z
    .array(
      z.object({
        complaint: z.string().min(1),
        lenses: z.array(z.string().min(1)).min(1),
        hint: z.string().min(1),
      }),
    )
    .min(1),
  moves: z.array(z.string().min(1)).min(1),
  /** Vague feedback a tutor tends to give, and the precise version to say instead. */
  phrasing: z.array(z.object({ instead: z.string().min(1), say: z.string().min(1) })).min(1),
});

export type TutoringLoop = z.infer<typeof TutoringLoopSchema>;

const FIELD = /^\*\*(.+?):\*\*\s*(.*)$/;
const LIST_ITEM = /^(?:-|\d+\.)\s+(.*)$/;

function roleCardSection(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+\d+\.\s+Role Card\s*$/.test(line));
  if (start === -1) throw new Error('No "Role Card" section found');
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    section.push(line);
  }
  return section;
}

function collectFields(lines: string[]): Map<string, { inline: string; items: string[] }> {
  const fields = new Map<string, { inline: string; items: string[] }>();
  let current: { inline: string; items: string[] } | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    const field = FIELD.exec(line);
    if (field) {
      current = { inline: field[2]!.trim(), items: [] };
      fields.set(normalizeKey(field[1]!), current);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item && current) current.items.push(item[1]!.trim());
  }
  return fields;
}

function normalizeKey(label: string): string {
  // "Output format when used as a critique lens" -> "output format"
  const key = label.toLowerCase().trim();
  return key.startsWith('output format') ? 'output format' : key;
}

function stripQuotes(text: string): string {
  return text.replace(/^["“]/, '').replace(/["”]$/, '').trim();
}

function required(fields: Map<string, { inline: string; items: string[] }>, key: string) {
  const field = fields.get(key);
  if (!field) throw new Error(`Role Card is missing "${key}"`);
  return field;
}

export function parseRoleCard(markdown: string): RoleCard {
  const fields = collectFields(roleCardSection(markdown));
  const outputFormat = required(fields, 'output format').items.map((item) => {
    const [name, ...rest] = item.split(' — ');
    return { name: name!.trim(), question: rest.join(' — ').trim() };
  });
  const defersTo = required(fields, 'defers to').items.map((item) => {
    const match = /^(\S+)\s+when\s+(.*)$/.exec(item);
    if (!match) throw new Error(`Cannot read deferral "${item}"`);
    return { to: match[1]!, when: match[2]! };
  });
  return RoleCardSchema.parse({
    name: required(fields, 'name').inline,
    coreMetaphor: required(fields, 'core metaphor').inline,
    mission: required(fields, 'mission').inline,
    activatesWhen: required(fields, 'activates when').inline,
    owns: required(fields, 'owns').items,
    defersTo,
    vetoes: required(fields, 'vetoes').items,
    samplePhrases: required(fields, 'sample phrases').items.map(stripQuotes),
    outputFormat,
  });
}

function sectionLines(markdown: string, heading: RegExp): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) throw new Error(`Section ${heading} not found`);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out;
}

export function parseTutoringLoop(markdown: string): TutoringLoop {
  const complaints = sectionLines(markdown, /^##\s+Step 1\b/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line) && !/When the child says/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
      const [complaint = '', lensCell = ''] = cells;
      const lenses = [...lensCell.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]!);
      return {
        complaint: stripQuotes(complaint),
        lenses,
        hint: lensCell.replace(/\*\*/g, '').trim(),
      };
    });
  const moves = sectionLines(markdown, /^##\s+Step 2\b/)
    .map((line) => /^-\s+(Today we .*)$/.exec(line.trim())?.[1])
    .filter((move): move is string => Boolean(move))
    .map((move) => move.replace(/\*\*/g, '').replace(/\.$/, ''));
  const phrasing = sectionLines(markdown, /^##\s+What Changes for the Parent/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line) && !/Before the bundle/.test(line))
    .map((line) => {
      const [instead = '', say = ''] = line.split('|').map((cell) => stripQuotes(cell.trim())).filter(Boolean);
      return { instead, say };
    });
  return TutoringLoopSchema.parse({ complaints, moves, phrasing });
}
