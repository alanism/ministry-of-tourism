// Rebuilds packages/core/content/lenses.json from the lens markdown.
//
//   node scripts/build-lenses.ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildLensBundle } from '../packages/core/src/lenses/build.ts';

const contentDir = path.join(import.meta.dirname, '..', 'packages', 'core', 'content');
const meta = JSON.parse(readFileSync(path.join(contentDir, 'coaches.json'), 'utf8'));
const bundle = buildLensBundle(meta, (file) => readFileSync(path.join(contentDir, 'lenses', file), 'utf8'));

writeFileSync(path.join(contentDir, 'lenses.json'), JSON.stringify(bundle, null, 2) + '\n');
console.log(`wrote ${bundle.coaches.length} coaches, ${bundle.tutoringLoop.complaints.length} complaints, ${bundle.tutoringLoop.moves.length} moves`);
