// Read-only FCC source -> same-origin MoT registry and explicit reconciliation.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildDestinationIndex} from '../packages/core/src/trip/destination-index.ts';

const source=process.argv[2];if(!source)throw Error('Pass the local FCC The-Aria-Bangkok source directory.');
const output=process.argv[3]??fileURLToPath(new URL('../apps/web/public/fcc/',import.meta.url));
const registryPath='data/city-asset-master.json',artPath='output/prototypes/city-pages/journal/city-art.json';
const bundledPath=fileURLToPath(new URL('../apps/web/public/artwork/fcc/manifest.json',import.meta.url));
const [registryBytes,artBytes,bundledBytes]=await Promise.all([readFile(path.join(source,registryPath)),readFile(path.join(source,artPath)),readFile(bundledPath)]);
const master=JSON.parse(registryBytes.toString('utf8')),art=JSON.parse(artBytes.toString('utf8'));
if(!art||Array.isArray(art)||typeof art!=='object')throw Error('FCC artwork city index must be an object keyed by city identifier.');
const bundled=JSON.parse(bundledBytes.toString('utf8'));
if(!Array.isArray(bundled.cities))throw Error('The bundled artwork manifest needs explicit city identifiers.');
const {publication,report}=buildDestinationIndex(master.cities,bundled.cities.map(city=>city.id));
if(publication.cities.length!==200)throw Error('FCC canonical registry must contain all 200 registered cities.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const registered=new Set(publication.cities.map(city=>city.id)),bundledIds=new Set(bundled.cities.map(city=>city.id));
const files=[['destinations.json',publication],['destinations-reconciliation.json',{...report,sourceArtCityCount:Object.keys(art).length,unmatchedSourceArtCityIds:Object.keys(art).filter(id=>!registered.has(id)).sort(),sourceArtIdsWithoutBundledCatalogs:Object.keys(art).filter(id=>!bundledIds.has(id)).sort(),sources:{registry:{path:registryPath,sha256:sha(registryBytes)},art:{path:artPath,sha256:sha(artBytes)},bundled:{path:'apps/web/public/artwork/fcc/manifest.json',sha256:sha(bundledBytes)}}}]].map(([name,value])=>({name,bytes:JSON.stringify(value,null,2)+'\n'}));
await mkdir(output,{recursive:true});
for(const file of files)await writeFile(path.join(output,file.name),file.bytes);
for(const file of files)if(await readFile(path.join(output,file.name),'utf8')!==file.bytes)throw Error('Destination build read-back failed.');
console.log(JSON.stringify({...report,files:files.map(file=>({name:file.name,sha256:sha(file.bytes)}))}));
