import { z } from 'zod';
import { CommandError, OperationTracker, TRIP_SCHEMA_VERSION, type Asset, type DiagnosticReceipt, type OperationState, type Presentation, type TripCard, type TripSession } from '@writers-board/core';

const agent = {kind:'agent' as const,id:'agent:trip-page',name:'Trip page agent'};
const runSchema=z.object({boardId:z.string().min(1),revision:z.number().int().nonnegative(),ops:z.array(z.object({command:z.string().min(1),input:z.record(z.string(),z.unknown())}).strict()).max(100)}).strict();
export interface TripArtifact {filename:string;mime:string;byteCount:number;boardId:string;revision:number;url:string;id?:string;createdAt?:string;sha256?:string;kept?:boolean;scope?:'guide'|'stay'|'personal';urlExpiresAt?:string|null;}
export interface TripApiOptions {onChange?:()=>void;providers?:()=>{fcc:boolean;muse:boolean};whenSaved?:()=>Promise<void>;onDiagnostic?:(receipt:DiagnosticReceipt)=>void;exportState?:()=>OperationState|undefined;exportArtifact?:(format:'pdf'|'zip',signal?:AbortSignal)=>Promise<TripArtifact>;}

export function createTripApi(session:TripSession,options:TripApiOptions={}) {
  let tracker:OperationTracker|undefined;
  const probe=()=>({apiVersion:1,schemaVersion:TRIP_SCHEMA_VERSION,boardId:session.boardId,revision:session.boardRev,providers:options.providers?.()??{fcc:false,muse:false}});
  return {
    probe,
    capabilities:()=>({...probe(),commands:session.tools(),examples:[{boardId:session.boardId,revision:session.boardRev,ops:[{command:'trip_card_create',input:{kind:'note',title:'A trip note',stage:'plan'}}]}]}),
    read:()=>session.execute<{meta:Record<string,unknown>;cards:TripCard[];presentations:Presentation[];assets:Asset[]}>(agent,'trip_read'),
    call:(name:string,input:unknown={})=>{
      const tool=session.tools().find(tool=>tool.name===name);
      if(!tool)throw new CommandError('unknown_command',`No trip command named ${name}`);
      if(!tool.annotations.readOnlyHint)throw new CommandError('invalid_input','Use execute with the visible board ID and revision for changes.');
      return session.execute(agent,name,input);
    },
    execute:(raw:unknown)=>{
      const parsed=runSchema.safeParse(raw);
      if(!parsed.success)throw new CommandError('invalid_input','Invalid trip run. Nothing changed.');
      const run=parsed.data;
      if(run.boardId!==session.boardId)throw new CommandError('scope','This run targets another document.');
      if(run.revision!==session.boardRev)throw new CommandError('stale','The trip changed. Read its current revision and try again.');
      const results=session.executeAll(agent,run.ops);
      options.onChange?.();
      return {boardId:session.boardId,revision:session.boardRev,status:'applied' as const,results};
    },
    undo:()=>{const undone=session.undo(agent.id);options.onChange?.();return undone;},
    operation:()=>tracker?.state??options.exportState?.(),
    persist:async()=>{
      if(!options.whenSaved)throw new CommandError('unavailable','Durable storage is unavailable. Download a package to recover your work.');
      tracker=new OperationTracker({id:crypto.randomUUID(),boardId:session.boardId,revision:session.boardRev,appVersion:'mot-integration-v2',operation:'persist',onDiagnostic:options.onDiagnostic});
      await tracker.run('persisting','persisted',options.whenSaved);
      return tracker.state;
    },
    exportArtifact:(format:'pdf'|'zip',signal?:AbortSignal)=>{
      if(!options.exportArtifact)throw new CommandError('unavailable','Artifact export is unavailable until a trip is open.');
      return options.exportArtifact(format,signal);
    },
  };
}
export type TripApi=ReturnType<typeof createTripApi>;
declare global {interface Window {motTrip?:TripApi;}}

export function installTripApi(session:TripSession,options:TripApiOptions={}) {
  delete window.writersBoard;
  const api=createTripApi(session,options);
  window.motTrip=api;
  return ()=>{if(window.motTrip===api)delete window.motTrip;};
}
