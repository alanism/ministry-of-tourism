import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {compileCatalogueResponseDefinitions} from '../packages/core/src/trip/public-catalogue-contract.ts';
const path=fileURLToPath(new URL('../docs/mcp-public-file.schema.json',import.meta.url));
const contract=JSON.parse(await readFile(path,'utf8')),definitions=compileCatalogueResponseDefinitions();
if(process.argv.includes('--check')){for(const[name,value]of Object.entries(definitions))if(JSON.stringify(contract.$defs[name])!==JSON.stringify(value))throw new Error('Generated response schema differs: '+name);}
else{Object.assign(contract.$defs,definitions);await writeFile(path,JSON.stringify(contract,null,2)+'\n');}
