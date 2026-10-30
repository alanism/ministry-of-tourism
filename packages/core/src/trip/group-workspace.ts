import {z} from 'zod';
import type {Actor} from '../doc/model.ts';
import {CommandError} from '../commands/define.ts';
import {readTripMeta,tripParts,type TripParts} from './model.ts';
import type {TripSession} from './session.ts';
import {boardRev} from './revisions.ts';
import {ballotKey,groupBallotKeySchema} from './group-ballot.ts';
import {createGroupResponse,validateGroupResponse,type GroupResponse,type GroupPreferences} from './group-preferences.ts';
import {DEFAULT_GROUP_POLICY,type PlanningProblem} from './planning-constraints.ts';
import {mergeResponseFiles,mergeResponseLedger,exportGroupResponsePackage,type ResponseLedger} from './response-ledger.ts';

type Change={kind:'ledger';ledger:ResponseLedger}|{kind:'export';response:GroupResponse;key:string;prior:string|undefined};
interface Prepared {doc:object;revision:number;configuration:string;change:Change;}
const prepared=new Map<string,Prepared>();
export const preparedGroupChangeSchema=z.string().uuid().refine(value=>prepared.has(value),'Prepare and validate this group update first');
function person(actor:Actor){if(actor.kind!=='human')throw new CommandError('human_only','Only a person can exchange household responses');}
function configuration(session:TripSession){const group=readTripMeta(session.doc).groupPreferences;if(!group)throw new Error('Declare the households and round first');return group;}
function finish(session:TripSession,actor:Actor,group:GroupPreferences,revision:number,change:Change){
 if(session.boardRev!==revision||JSON.stringify(configuration(session))!==JSON.stringify(group))throw new CommandError('stale','The trip changed during response validation. Nothing imported; try again.');
 const receipt=crypto.randomUUID();prepared.set(receipt,{doc:session.doc,revision,configuration:JSON.stringify(group),change});
 try{session.execute(actor,'trip_group_commit',{prepared:receipt});}finally{prepared.delete(receipt);}
}
/** Cryptographic/ZIP validation finishes before this synchronous command can write. Receipts are one-use, in-memory and document/revision-bound. */
export function commitPreparedGroupChange(doc:object,parts:TripParts,receipt:string){
 const p=prepared.get(receipt);if(!p||p.doc!==doc||p.revision!==boardRev(parts)||p.configuration!==JSON.stringify(readTripMeta(doc as TripSession['doc']).groupPreferences))throw new CommandError('stale','Invalid or stale group update; nothing changed');
 if(p.change.kind==='export'&&JSON.stringify(parts.clock.get(p.change.key))!==p.change.prior)throw new CommandError('stale','The response changed during export; retry to use its next revision');
 if(p.change.kind==='ledger'){const old=readTripMeta(doc as TripSession['doc']).groupWorkspace;if(JSON.stringify(old?.ledger)===JSON.stringify(p.change.ledger))return{status:'unchanged'};parts.meta.set('groupWorkspace',{version:1,policy:old?.policy??DEFAULT_GROUP_POLICY,...(old?.planning?{planning:old.planning}:{}),ledger:structuredClone(p.change.ledger)});}
 else if(JSON.stringify(parts.clock.get(p.change.key))!==JSON.stringify(p.change.response))parts.clock.set(p.change.key,structuredClone(p.change.response));
 return{status:'committed'};
}
export async function mergeGroupResponseFiles(session:TripSession,actor:Actor,files:readonly Uint8Array[],resolvedHouseholds:readonly string[]){
 person(actor);const group=configuration(session),revision=session.boardRev,old=readTripMeta(session.doc).groupWorkspace?.ledger,result=await mergeResponseFiles(group,old,files,{resolvedHouseholds});
 finish(session,actor,group,revision,{kind:'ledger',ledger:result.ledger});return result;
}
export async function exportLocalGroupResponse(session:TripSession,actor:Actor,rawKey:unknown,format:'json'|'zip'){
 person(actor);const key=groupBallotKeySchema.parse(rawKey),group=configuration(session),revision=session.boardRev,meta=readTripMeta(session.doc),ballot=meta.groupBallots?.find(b=>ballotKey(b)===ballotKey(key));if(!ballot)throw new Error('Save a household response before exporting');
 const cacheKey=`groupResponse:${ballotKey(key)}`,cached=session.parts.clock.get(cacheKey) as GroupResponse|undefined;
 const highest=Math.max(0,...(meta.groupWorkspace?.ledger?.entries??[]).filter(e=>ballotKey(e.response)===ballotKey(key)).map(e=>e.response.response_revision),cached?.response_revision??0);
 const body={version:1 as const,trip_id:group.trip_id,...ballot,response_revision:cached?.response_revision??1,constraints:[],responded_at:cached?.responded_at??new Date().toISOString()};
 let response=await createGroupResponse(body);
 if(!cached||response.response_id!==cached.response_id||cached.response_revision<highest){if(highest===Number.MAX_SAFE_INTEGER)throw new Error('Response revision limit reached; declare a new round');response=await createGroupResponse({...body,response_revision:highest+1,responded_at:new Date().toISOString()});}
 await validateGroupResponse(response,group,key.household_id);
 const bytes=format==='zip'?await exportGroupResponsePackage(response,group):new TextEncoder().encode(JSON.stringify(response,null,2));
 finish(session,actor,group,revision,{kind:'export',response,key:cacheKey,prior:JSON.stringify(cached)});return{response,bytes};
}
export function validatePlanningGroup(planning:PlanningProblem,group:GroupPreferences|undefined){
 const round=group?.rounds.find(r=>r.proposal_version===planning.proposal_version&&r.round_id===planning.round_id);
 if(!group||group.trip_id!==planning.trip_id||!round||planning.activities.some(a=>!round.option_ids.includes(a.option_id))||planning.households.some(h=>!group.households.some(g=>g.household_id===h.household_id)))throw new Error('Planning facts must match this declared trip, round, options and households');
}
export async function validateStoredGroupResponses(doc:TripSession['doc']){
 const meta=readTripMeta(doc),group=meta.groupPreferences;
 if(meta.groupWorkspace?.ledger){if(!group)throw new Error('Response ledger has no declared group');await mergeResponseLedger(group,meta.groupWorkspace.ledger,[]);}
 const clock=tripParts(doc).clock;
 for(const key of clock.keys())if(key.startsWith('groupResponse:')){if(!group)throw new Error('Outbound response has no declared group');const value=clock.get(key),checked=await validateGroupResponse(value,group);if(key!==`groupResponse:${ballotKey(checked.response)}`)throw new Error('Outbound response cache identity mismatch');}
}
