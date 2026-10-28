// Applies the approved description rewrite to the framework content.
// Only the question, lesson and coach tips change; the lock test guards the rest.
//
//   node scripts/apply-rewrite.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const contentDir = path.join(import.meta.dirname, '..', 'packages', 'core', 'content');
const frameworkPath = path.join(contentDir, 'framework.json');
const rewritePath = path.join(contentDir, 'framework-rewrite.json');

const framework = JSON.parse(readFileSync(frameworkPath, 'utf8'));
const rewrite = JSON.parse(readFileSync(rewritePath, 'utf8'));

if (rewrite.status !== 'approved') {
  console.error(`framework-rewrite.json is "${rewrite.status}"; set "status": "approved" after review.`);
  process.exit(1);
}

const byId = new Map(rewrite.cards.map((c: { id: string }) => [c.id, c]));
for (const card of framework.cards) {
  const next = byId.get(card.id) as { question: string; lesson: string; tips: unknown[] } | undefined;
  if (!next) throw new Error(`Rewrite is missing ${card.id}`);
  card.question = next.question;
  card.lesson = next.lesson;
  card.tips = next.tips;
}

writeFileSync(frameworkPath, JSON.stringify(framework, null, 2) + '\n');
console.log(`Applied wording to ${framework.cards.length} cards. Run npm test.`);
