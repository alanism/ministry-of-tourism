import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['src/index.ts'],outfile:'lib/index.js',bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',alias:{'@mot/core':fileURLToPath(new URL('../discovery/src/core-shim.ts',import.meta.url))},sourcemap:false});
