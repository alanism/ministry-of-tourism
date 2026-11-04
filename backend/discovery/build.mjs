import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({absWorkingDir:root,entryPoints:['src/index.ts'],outfile:'lib/index.js',bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',alias:{'@mot/core':fileURLToPath(new URL('src/core-shim.ts',import.meta.url))},sourcemap:false});
