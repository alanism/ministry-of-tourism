import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCustomConnector} from '../packages/mot-server/src/custom-connector.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const publicRoot=join(root,'apps/web/public');
const manifest=JSON.parse(readFileSync(join(publicRoot,'fcc-catalogue/manifest.json'),'utf8'));
const bytes=readFileSync(join(publicRoot,'fcc-catalogue/index.json'));
if(bytes.length!==manifest.index.bytes||createHash('sha256').update(bytes).digest('hex')!==manifest.index.sha256)throw new Error('Source catalogue does not match its published manifest');
const index:unknown=JSON.parse(bytes.toString('utf8'));
const files=buildCustomConnector(index);
for(const [path,text] of files){
 const target=resolve(publicRoot,'.'+path);
 if(!target.startsWith(resolve(publicRoot,'connectors/muse')+'/')&&!target.startsWith(resolve(publicRoot,'connectors/muse')+'\\'))throw new Error('Output must stay inside the connector directory');
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);
}
console.log(JSON.stringify({files:files.size,bytes:[...files.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0),snapshot:manifest.snapshotId}));
