import {appendFileSync,chmodSync,existsSync,lstatSync,mkdirSync,readdirSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {z} from 'zod';
import {MUSE_MODELS,type MuseLog} from './index.ts';

export const DIAGNOSTIC_RETENTION_MS=24*60*60*1000;
const logSchema=z.object({requestId:z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/),modelId:z.enum(MUSE_MODELS),date:z.iso.datetime(),errorClass:z.enum(['none','invalid_request','invalid_response','rate_limited','authentication_failed','provider_unavailable','timeout','cancelled','busy']),latencyMs:z.number().finite().nonnegative(),costUnits:z.number().int().min(0).max(1),usage:z.object({inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),totalTokens:z.number().int().nonnegative()}).optional()});
const WINDOWS_PRIVATE_DIRECTORY=String.raw`
$ErrorActionPreference='Stop'
$path=[Console]::In.ReadToEnd() | ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true,$false)
$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
$directory=[IO.Directory]::CreateDirectory($path,$acl)
$directory.SetAccessControl($acl)
$actual=$directory.GetAccessControl()
$rules=@($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
if (-not $actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value) { throw 'Owner-only diagnostics access was not established' }
`;

export function defaultDiagnosticsDirectory(){return join(process.platform==='win32'?(process.env.LOCALAPPDATA??join(homedir(),'AppData','Local')):(process.env.XDG_STATE_HOME??join(homedir(),'.local','state')),'MinistryOfTourism','muse-diagnostics');}

/** Session-only files, protected by the OS account, with a 24-hour ceiling while running. */
export function createPrivateDiagnostics(directory:string){
 directory=resolve(directory);
 if(existsSync(directory)&&(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink()))throw new Error('Muse diagnostics require a real private directory');
 if(process.platform==='win32'){
  const secured=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',WINDOWS_PRIVATE_DIRECTORY],{input:JSON.stringify(directory),encoding:'utf8',windowsHide:true});
  if(secured.error||secured.status!==0)throw new Error('Owner-only Muse diagnostics could not be secured');
 }else{
  mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
  if(statSync(directory).uid!==process.getuid?.()||(statSync(directory).mode&0o777)!==0o700)throw new Error('Owner-only Muse diagnostics could not be secured');
 }
 // A crashed session cannot run a timer; remove its remnants on the next owner start.
 for(const name of readdirSync(directory)){
  const match=/^muse-(\d+)-[0-9a-f-]{36}\.jsonl$/.exec(name);if(!match)continue;
  let alive=true;try{process.kill(Number(match[1]),0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
  const old=join(directory,name);if(!alive||statSync(old).mtimeMs<=Date.now()-DIAGNOSTIC_RETENTION_MS)unlinkSync(old);
 }
 const path=join(directory,`muse-${process.pid}-${randomUUID()}.jsonl`);writeFileSync(path,'',{flag:'wx',mode:0o600});
 let records:{entry:MuseLog;expires:number}[]=[],timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const schedule=()=>{
  clearTimeout(timer);if(closed||!records.length)return;
  timer=setTimeout(()=>{records=records.filter(r=>r.expires>Date.now());writeFileSync(path,records.map(r=>JSON.stringify(r.entry)+'\n').join(''));schedule();},Math.max(1,records[0]!.expires-Date.now()));timer.unref?.();
 };
 return{path,log(entry:MuseLog){
  if(closed)throw new Error('Muse diagnostics session is closed');
  const safe=logSchema.parse(entry);appendFileSync(path,JSON.stringify(safe)+'\n');records.push({entry:safe,expires:Date.now()+DIAGNOSTIC_RETENTION_MS});schedule();
 },close(){if(closed)return;closed=true;clearTimeout(timer);if(existsSync(path))unlinkSync(path);}};
}
