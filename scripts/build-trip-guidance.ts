// MOT-116: write the public agent guide from the one guidance source. `node scripts/build-trip-guidance.ts`
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guidanceMarkdown, GUIDE_PATH } from '../packages/core/src/trip/guidance.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', ...GUIDE_PATH.split('/').filter(Boolean));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, guidanceMarkdown());
console.log(`Wrote ${target}`);
