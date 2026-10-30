import {afterEach,expect,it,vi} from 'vitest';
import {existsSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPrivateDiagnostics,DIAGNOSTIC_RETENTION_MS} from './private-diagnostics.ts';
import {createMuseHttpServer} from './server.ts';
import type {MuseLog} from './index.ts';
const roots:string[]=[],sinks:ReturnType<typeof createPrivateDiagnostics>[]=[];
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'mot-private-log-'));roots.push(root);return join(root,'diagnostics');};
const entry=():MuseLog=>({requestId:'fixture-request',modelId:'muse-spark-1.3',date:new Date().toISOString(),errorClass:'authentication_failed',latencyMs:20,costUnits:1});
afterEach(()=>{for(const sink of sinks.splice(0))sink.close();vi.useRealTimers();for(const root of roots.splice(0)){if(!realpathSync(root).startsWith(realpathSync(tmpdir())+sep+'mot-private-log-'))throw Error('Unsafe diagnostics cleanup');rmSync(root,{recursive:true,force:true});}});
it('creates owner-only diagnostics and persists only the safe structured fields',()=>{
 const directory=fixture(),sink=createPrivateDiagnostics(directory);sinks.push(sink);const safe=entry();sink.log({...safe,prompt:'PRIVATE_PROMPT',cards:['PRIVATE_CARD'],providerBody:'PRIVATE_PROVIDER',key:'PRIVATE_KEY'} as MuseLog);
 expect(JSON.parse(readFileSync(sink.path,'utf8'))).toEqual(safe);expect(readFileSync(sink.path,'utf8')).not.toContain('PRIVATE');
 if(process.platform==='win32'){
  const probe=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$p=[Console]::In.ReadToEnd()|ConvertFrom-Json;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$ok=$true;foreach($item in @($p.directory,$p.file)){$acl=Get-Acl -LiteralPath $item;$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value){$ok=$false}};if($ok){'owner-only'}else{exit 1}"],{input:JSON.stringify({directory,file:sink.path}),encoding:'utf8',windowsHide:true});
  expect(probe.status,probe.stderr).toBe(0);expect(probe.stdout.trim()).toBe('owner-only');
 }else{expect(statSync(directory).mode&0o777).toBe(0o700);expect(statSync(sink.path).mode&0o777).toBe(0o600);}
});
it('expires idle diagnostics within 24 hours and deletes this session log on close',async()=>{
 vi.useFakeTimers();const sink=createPrivateDiagnostics(fixture());sinks.push(sink);sink.log(entry());expect(readFileSync(sink.path,'utf8')).toContain('fixture-request');
 await vi.advanceTimersByTimeAsync(DIAGNOSTIC_RETENTION_MS+1);expect(readFileSync(sink.path,'utf8')).toBe('');sink.close();expect(existsSync(sink.path)).toBe(false);
});
it('refuses to start the server if a private diagnostics sink cannot be secured',()=>{
 const directory=fixture();writeFileSync(directory,'Blocked by a file');const fetcher=vi.fn();expect(()=>createMuseHttpServer({MOT_LOG_DIR:directory},{fetcher})).toThrow(/diagnostic|directory/i);expect(fetcher).not.toHaveBeenCalled();
});
