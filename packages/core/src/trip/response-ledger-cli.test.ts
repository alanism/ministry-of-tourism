import {expect,it} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,utimesSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createGroupResponse} from './group-preferences.ts';
const script=fileURLToPath(new URL('../../../../scripts/merge-mot-responses.mjs',import.meta.url));
const config={version:1,trip_id:'trip',households:[{household_id:'family',display_name:'Family'}],rounds:[{round_id:'round',proposal_version:1,kind:'destination',option_ids:['a','b'],rank_limit:3,household_weighting:'one_household_one_vote'}]};
async function fixture(run:(p:{root:string;config:string;response:string;out:string;raw:unknown})=>void){const root=mkdtempSync(join(tmpdir(),'mot-ledger-cli-'));try{const c=join(root,'config.json'),r=join(root,'response.json'),out=join(root,'ledger.json'),raw=await createGroupResponse({version:1,trip_id:'trip',proposal_version:1,round_id:'round',household_id:'family',response_revision:1,rankings:[{option_id:'a',rank:1}],stamps:[],shared_note:'<script>do not run</script>',constraints:[],responded_at:'2099-01-01T00:00:00Z'});writeFileSync(c,JSON.stringify(config));writeFileSync(r,JSON.stringify(raw));run({root,config:c,response:r,out,raw});}finally{if(!realpathSync(root).startsWith(realpathSync(tmpdir())+sep+'mot-ledger-cli-'))throw Error('Unsafe test cleanup target');rmSync(root,{recursive:true,force:true});}}
const cli=(args:string[])=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
it('creates a resolved ledger, persists history and skips duplicate disk writes',async()=>fixture(p=>{
 const args=['--config',p.config,'--out',p.out,'--resolve-household','family',p.response],first=cli(args);expect(first.status,first.stderr).toBe(0);const bytes=readFileSync(p.out);expect(JSON.parse(bytes.toString()).entries).toHaveLength(1);utimesSync(p.out,new Date(1000000),new Date(1000000));const modified=statSync(p.out).mtimeMs,again=cli(args);expect(again.status,again.stderr).toBe(0);expect(readFileSync(p.out)).toEqual(bytes);expect(statSync(p.out).mtimeMs).toBe(modified);expect(again.stdout).not.toContain('<script>');
}));
it('keeps unfamiliar replies pending until an explicit household resolution',async()=>fixture(p=>{
 const first=cli(['--config',p.config,'--out',p.out,p.response]);expect(first.status,first.stderr).toBe(0);expect(JSON.parse(first.stdout).pending).toBe(1);const resolved=cli(['--config',p.config,'--out',p.out,'--resolve-household','family',p.response]);expect(resolved.status,resolved.stderr).toBe(0);expect(JSON.parse(resolved.stdout).current).toBe(1);
}));
it('preserves the last valid output if a later response is malformed',async()=>fixture(p=>{
 expect(cli(['--config',p.config,'--out',p.out,'--resolve-household','family',p.response]).status).toBe(0);const before=readFileSync(p.out),bad=join(p.root,'bad.json');writeFileSync(bad,'{');const failed=cli(['--config',p.config,'--out',p.out,p.response,bad]);expect(failed.status).toBe(1);expect(failed.stderr).toMatch(/previous ledger.*unchanged/i);expect(readFileSync(p.out)).toEqual(before);
}));
it('refuses to overwrite config/response files and reports a busy ledger for retry',async()=>fixture(p=>{
 const before=readFileSync(p.config),bad=cli(['--config',p.config,'--out',p.config,p.response]);expect(bad.status).toBe(1);expect(bad.stderr).toMatch(/overwrite/i);expect(readFileSync(p.config)).toEqual(before);writeFileSync(p.out+'.lock','');const busy=cli(['--config',p.config,'--out',p.out,p.response]);expect(busy.status).toBe(1);expect(busy.stderr).toMatch(/busy|retry/i);
}));
it('W1 F4: reports a missing output directory as a path error, not a busy ledger',async()=>fixture(p=>{
 const out=join(p.root,'missing-dir','ledger.json'),failed=cli(['--config',p.config,'--out',out,'--resolve-household','family',p.response]);
 expect(failed.status).toBe(1);expect(failed.stderr).not.toMatch(/busy/i);expect(failed.stderr).toMatch(/output folder|directory/i);expect(failed.stderr).toMatch(/previous ledger.*unchanged/i);
}));
it('flushes the containing directory or uses a native Windows write-through move before successful replacement',async()=>fixture(p=>{
 const audit=join(p.root,'durability.json'),hook=join(p.root,'durability-hook.mjs');writeFileSync(hook,`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const audit=${JSON.stringify(audit)},flush=fs.fsyncSync,spawn=cp.spawnSync;fs.fsyncSync=fd=>{if(fs.fstatSync(fd).isDirectory())fs.writeFileSync(audit,JSON.stringify({directory:true}));return flush(fd)};cp.spawnSync=(command,args,options)=>{if(/powershell(?:\\.exe)?$/i.test(String(command)))fs.writeFileSync(audit,JSON.stringify({native:true,command:args.join(' ')}));return spawn(command,args,options)};syncBuiltinESMExports();`);
 const result=spawnSync(process.execPath,['--import',new URL('file:///'+hook.replace(/\\/g,'/')).href,script,'--config',p.config,'--out',p.out,'--resolve-household','family',p.response],{encoding:'utf8'});
 expect(result.status,result.stderr).toBe(0);expect(existsSync(audit),'A successful rename must cross the platform durability barrier').toBe(true);const proof=JSON.parse(readFileSync(audit,'utf8'));if(process.platform==='win32'){expect(proof.native).toBe(true);expect(proof.command).toMatch(/WRITE_THROUGH/);}else expect(proof.directory).toBe(true);
}));
it('reports uncertain durability rather than claiming the old file is unchanged after a failed post-rename flush',async()=>fixture(p=>{
 const hook=join(p.root,'flush-failure.mjs');writeFileSync(hook,`import fs from 'node:fs';import cp from 'node:child_process';import path from 'node:path';import {syncBuiltinESMExports} from 'node:module';const root=${JSON.stringify(p.root)},out=${JSON.stringify(p.out)},flush=fs.fsyncSync,spawn=cp.spawnSync;fs.fsyncSync=fd=>{if(fs.fstatSync(fd).isDirectory())throw new Error('Injected directory flush failure');return flush(fd)};cp.spawnSync=(command,args,options)=>{if(/powershell(?:\\.exe)?$/i.test(String(command))){const temp=fs.readdirSync(root).find(n=>n.endsWith('.tmp'));if(!temp)throw new Error('Missing same-directory candidate');fs.renameSync(path.join(root,temp),out);return{status:1,stdout:'',stderr:'Injected post-rename flush failure'}}return spawn(command,args,options)};syncBuiltinESMExports();`);
 const result=spawnSync(process.execPath,['--import',new URL('file:///'+hook.replace(/\\/g,'/')).href,script,'--config',p.config,'--out',p.out,'--resolve-household','family',p.response],{encoding:'utf8'});
 expect(result.status).toBe(1);expect(result.stderr).toMatch(/durab|reopen/i);expect(result.stderr).not.toMatch(/previous ledger is unchanged/i);expect(JSON.parse(readFileSync(p.out,'utf8')).entries).toHaveLength(1);
}));
