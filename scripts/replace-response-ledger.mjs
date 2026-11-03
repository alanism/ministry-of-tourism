import {openSync,closeSync,fsyncSync,renameSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Paths arrive as JSON on stdin; no filename is interpolated into PowerShell source.
const WINDOWS_REPLACE=String.raw`
$ErrorActionPreference='Stop'
$paths=[Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class MoTLedgerMove {
 public const int REPLACE_EXISTING=1, WRITE_THROUGH=8;
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 [return: MarshalAs(UnmanagedType.Bool)]
 public static extern bool MoveFileExW(string source,string target,int flags);
}
'@
if (-not [MoTLedgerMove]::MoveFileExW($paths.source,$paths.target,([MoTLedgerMove]::REPLACE_EXISTING -bor [MoTLedgerMove]::WRITE_THROUGH))) { throw 'Write-through ledger replacement failed' }
`;

/** The caller has already fsynced the candidate. Never fall back to an unflushed rename. */
export function replaceResponseLedger(source,target){
 source=resolve(source);target=resolve(target);
 if(realpathSync(dirname(source))!==realpathSync(dirname(target)))throw new Error('Ledger replacement must stay in the output directory');
 if(process.platform==='win32'){
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',WINDOWS_REPLACE],{input:JSON.stringify({source,target}),encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw new Error('Windows write-through ledger replacement could not be confirmed');
 }else{
  const directory=openSync(dirname(target),'r');
  try{renameSync(source,target);fsyncSync(directory);}finally{closeSync(directory);}
 }
}
