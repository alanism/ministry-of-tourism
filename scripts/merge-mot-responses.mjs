// Local JSON/ZIP merge. No network, model calls, executable imports or canonical board writes.
import {readFileSync,writeFileSync,existsSync,lstatSync,statSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mergeResponseFiles} from '../packages/core/src/trip/response-ledger.ts';
import {TRIP_PACKAGE_LIMITS} from '../packages/core/src/trip/package.ts';

const usage='Usage: node scripts/merge-mot-responses.mjs --config group.json --out ledger.json [--ledger previous.json] [--resolve-household ID] response.json|response.zip ...';
let lockFd,lockPath,tempPath;
try{
 const args=process.argv.slice(2),files=[],resolvedHouseholds=[];let configPath,outPath,ledgerPath;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(['--config','--out','--ledger','--resolve-household'].includes(arg)){
   const value=args[++i];if(!value||value.startsWith('--'))throw new Error(usage);
   if(arg==='--resolve-household')resolvedHouseholds.push(value);
   else if(arg==='--config'){if(configPath)throw new Error(usage);configPath=resolve(value);}
   else if(arg==='--out'){if(outPath)throw new Error(usage);outPath=resolve(value);}
   else{if(ledgerPath)throw new Error(usage);ledgerPath=resolve(value);}
  }else{if(arg.startsWith('--'))throw new Error(usage);files.push(resolve(arg));}
 }
 if(!configPath||!outPath||!files.length)throw new Error(usage);
 const same=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase()||(existsSync(a)&&existsSync(b)&&realpathSync(a)===realpathSync(b));
 if([configPath,...files].some(file=>same(file,outPath)))throw new Error('Refusing to overwrite a configuration or response input. Choose a separate ledger output.');
 if(existsSync(outPath)&&(lstatSync(outPath).isSymbolicLink()||!statSync(outPath).isFile()))throw new Error('Output must be a regular ledger file.');
 if(ledgerPath&&existsSync(outPath)&&!same(ledgerPath,outPath))throw new Error('Existing output must be its own previous ledger; use a new output path for another ledger.');
 lockPath=outPath+'.lock';try{lockFd=openSync(lockPath,'wx',0o600);}catch(error){if(error?.code==='EEXIST')throw new Error('Ledger is busy. Retry after the other merge finishes.');throw new Error(`Cannot create the ledger lock (${error?.code??'unknown error'}). Check that the output folder exists and is writable, then retry.`);}
 let total=0;
 const read=(file,count=true)=>{if(statSync(file).size>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error('Input exceeds the portable file limit.');const bytes=readFileSync(file);if(count)total+=bytes.length;if(bytes.length>TRIP_PACKAGE_LIMITS.fileBytes||total>TRIP_PACKAGE_LIMITS.totalBytes)throw new Error('Input batch exceeds the portable size limit.');return bytes;};
 const config=JSON.parse(read(configPath).toString('utf8')),oldOutput=existsSync(outPath)?read(outPath):null;
 const previousPath=ledgerPath??(oldOutput?outPath:undefined),previous=previousPath?JSON.parse((oldOutput&&same(previousPath,outPath)?oldOutput:read(previousPath)).toString('utf8')):undefined;
 const result=await mergeResponseFiles(config,previous,files.map(read),{resolvedHouseholds});
 const bytes=Buffer.from(JSON.stringify(result.ledger,null,2)+'\n');
 if(bytes.length>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error('Formatted ledger exceeds the portable file limit.');
 if(!oldOutput||!oldOutput.equals(bytes)){
  if(oldOutput&&(!existsSync(outPath)||!read(outPath,false).equals(oldOutput)))throw new Error('Ledger changed during the merge. Retry from the latest copy.');
  tempPath=join(dirname(outPath),'.'+basename(outPath)+'.'+randomUUID()+'.tmp');
  const fd=openSync(tempPath,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  renameSync(tempPath,outPath);tempPath=undefined;
 }
 console.log(JSON.stringify({current:result.current.length,conflicts:result.conflicts.length,pending:result.pending.length,history:result.ledger.entries.length,stale_proposals:result.stale_proposals,identity:result.identity}));
}catch(error){console.error('Response merge failed; previous ledger is unchanged. '+(error instanceof Error?error.message:'Retry with a valid response file.'));process.exitCode=1;}
finally{if(tempPath)try{unlinkSync(tempPath);}catch{}if(lockFd!==undefined){closeSync(lockFd);try{unlinkSync(lockPath);}catch{}}}
