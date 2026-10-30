import {expect,it} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,utimesSync,realpathSync} from 'node:fs';
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
