// Copies the writing lens files into the repo. The files in Aria-EdTech stay
// the source of truth; run this after editing them, then `npm run lenses:build`.
//
//   node scripts/sync-lenses.ts [sourceDir]
//
// sourceDir defaults to $LENS_SOURCE_DIR.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const FILES = [
  'Michael_Dean_essay_architecture_lens.md',
  'Derek_Thompson_journalism_lens.md',
  'Mark_Forsyth_rhetoric_lens.md',
  'Robert_Greene_historical_narratives_lens.md',
  'Tish_Rabe_childrens_books_lens.md',
  'parent_tutoring_loop.md',
];

const sourceDir = process.argv[2] ?? process.env.LENS_SOURCE_DIR;
if (!sourceDir) {
  console.error('Pass the Writing_Liberal_Arts folder as an argument or set LENS_SOURCE_DIR.');
  process.exit(1);
}

const targetDir = path.join(import.meta.dirname, '..', 'packages', 'core', 'content', 'lenses');
mkdirSync(targetDir, { recursive: true });

for (const file of FILES) {
  const from = path.join(sourceDir, file);
  if (!existsSync(from)) {
    console.error(`Missing ${from}`);
    process.exit(1);
  }
  copyFileSync(from, path.join(targetDir, file));
  console.log(`copied ${file}`);
}
