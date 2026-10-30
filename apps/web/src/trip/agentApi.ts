import { z } from 'zod';
import { agentContext,agentGuidance,GUIDE_VERSION,guideMetadata,memoryShortlist,nextStep,planTripAdaptation,reusableArt,readTripMeta,routeTripRequest,routeGroupRequest,tripPhase,WORKFLOW_SUMMARY,WORKFLOWS,tripChangeSchema,adaptationContextSchema,CommandError, OperationTracker, TRIP_SCHEMA_VERSION, type GroupPlanningResult, type ScheduleFeasibilityResult, type PreferenceTally, type Asset, type DiagnosticReceipt, type OperationState, type Presentation, type TripCard, type TripSession } from '@writers-board/core';

const agent = {kind:'agent' as const,id:'agent:trip-page',name:'Trip page agent'};
const runSchema=z.object({boardId:z.string().min(1),revision:z.number().int().nonnegative(),ops:z.array(z.object({command:z.string().min(1),input:z.record(z.string(),z.unknown())}).strict()).max(100)}).strict();
const routeSchema=z.object({text:z.string().max(4000).optional(),ops:z.array(z.object({command:z.string().min(1),input:z.record(z.string(),z.unknown()).optional()}).strict()).max(100).optional(),workflow:z.enum(WORKFLOWS).optional()}).strict();
const routeExtraSchema=z.object({answers:z.record(z.string().max(60),z.object({status:z.enum(['answered','partial','not_sure','skipped']),value:z.string().max(2000).optional()}).strict()).optional(),inferred:z.array(z.object({field:z.string().min(1).max(200),value:z.string().max(2000),source:z.string().min(1).max(300)}).strict()).max(50).optional()}).strict();
const groupRouteExtraSchema=routeExtraSchema.extend({ledger:z.unknown().optional()}).strict();
const reactionsSchema=z.record(z.string().min(1).max(200),z.enum(['keep','maybe','skip']));
const parse=<T,>(schema:z.ZodType<T>,raw:unknown,what:string):T=>{const parsed=schema.safeParse(raw);if(!parsed.success)throw new CommandError('invalid_input',`Invalid ${what}. Nothing changed.`);return parsed.data;};
export interface TripArtifact {filename:string;mime:string;byteCount:number;boardId:string;revision:number;url:string;id?:string;createdAt?:string;sha256?:string;kept?:boolean;scope?:'guide'|'stay'|'personal';urlExpiresAt?:string|null;}
export interface TripApiOptions {onChange?:()=>void;providers?:()=>{fcc:boolean;muse:boolean};whenSaved?:()=>Promise<void>;onDiagnostic?:(receipt:DiagnosticReceipt)=>void;exportState?:()=>OperationState|undefined;exportArtifact?:(format:'pdf'|'zip',signal?:AbortSignal)=>Promise<TripArtifact>;}

export function createTripApi(session:TripSession,options:TripApiOptions={}) {
  let tracker:OperationTracker|undefined;
  const probe=()=>({apiVersion:1,schemaVersion:TRIP_SCHEMA_VERSION,boardId:session.boardId,revision:session.boardRev,providers:options.providers?.()??{fcc:false,muse:false}});
  const agentContextReactions=()=>readTripMeta(session.doc).memoryWorkflow?.reactions??{};
  const tools=()=>({muse:options.providers?.().muse??false,planner:true,persistence:!!options.whenSaved});
  return {
    probe,
    capabilities:()=>({...probe(),guidance:{...guideMetadata(),current_phase:tripPhase(agentContext(session).meta),workflows:WORKFLOW_SUMMARY,read:'routeGroup(request, {ledger}) reads explicitly shared group readiness; guidance(versionSeen) returns changed essentials.'},commands:session.tools(),examples:[{boardId:session.boardId,revision:session.boardRev,ops:[{command:'trip_card_create',input:{kind:'note',title:'A trip note',stage:'plan'}}]}]}),
    read:()=>session.execute<{meta:Record<string,unknown>;cards:TripCard[];presentations:Presentation[];assets:Asset[]}>(agent,'trip_read'),
    planGroup:(input:unknown)=>session.execute<Promise<GroupPlanningResult>>(agent,'trip_group_plan',input),
    checkGroupPlan:(input:unknown)=>session.execute<Promise<ScheduleFeasibilityResult>>(agent,'trip_group_feasibility',input),
    tallyPreferences:(input:unknown)=>session.execute<Promise<PreferenceTally>>(agent,'trip_preference_tally',input),
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
      return {boardId:session.boardId,revision:session.boardRev,status:'applied' as const,results,guide:{guide_id:guideMetadata().guide_id,version:GUIDE_VERSION}};
    },
    /** MOT-109: what an agent may know before choosing a workflow. Never private cards. */
    context:()=>agentContext(session),
    /** MOT-109: the smallest workflow for a request. Answers and inferences come from the caller; nothing is stored or changed. */
    route:(request:unknown,extra:unknown={})=>{const parsed=parse(routeExtraSchema,extra,'route extras');return routeTripRequest(session,parse(routeSchema,request,'route request'),{answers:parsed.answers,inferred:parsed.inferred?.map(fact=>({...fact,status:'inferred' as const})),tools:tools()});},
    routeGroup:async(request:unknown,extra:unknown={})=>{const e=parse(groupRouteExtraSchema,extra,'group route extras');return routeGroupRequest(session,parse(routeSchema,request,'route request'),{...e,inferred:e.inferred?.map(f=>({...f,status:'inferred' as const})),tools:tools()});},
    /** MOT-116: the full essentials only when the agent has not seen this version. */
    guidance:(versionSeen?:string)=>versionSeen===GUIDE_VERSION?{...guideMetadata(),unchanged:true as const}:agentGuidance(),
    /** MOT-114: the next activity from board state, with source and time confidence. */
    nextStep:()=>nextStep(session),
    /** MOT-114: a local adjustment as a proposal for the person to apply. Agents never apply it. */
    proposeAdaptation:async(change:unknown,context?:unknown)=>planTripAdaptation(session,parse(tripChangeSchema,change,'trip change'),context===undefined?{}:{context:parse(adaptationContextSchema,context,'shared planning context')}),
    /** MOT-115: a first memory shortlist and the art already on the trip. No voting or planning. */
    memories:(reactions:unknown={})=>({route:routeTripRequest(session,{workflow:'keepsake'},{tools:tools()}),shortlist:memoryShortlist(session,{reactions:{...agentContextReactions(),...parse(reactionsSchema,reactions,'reactions')}}),art:reusableArt(session)}),
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
