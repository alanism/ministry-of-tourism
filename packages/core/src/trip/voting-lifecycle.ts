import {z} from 'zod';
import type * as Y from 'yjs';
import type {Actor} from '../doc/model.ts';
import {CommandError} from '../commands/define.ts';
import {readTripMeta,tripParts,type TripParts} from './model.ts';
import type {TripSession} from './session.ts';
import {groupPreferencesSchema,validateGroupUpdate,type GroupPreferences} from './group-preferences.ts';
import {mergeResponseLedger,type ResponseLedger} from './response-ledger.ts';
import {preferenceRoundSchema,tallyGroupPreferences,type PreferenceTally} from './preference-tally.ts';
import {instantRunoffGroupPreferences} from './instant-runoff.ts';
import {DEFAULT_GROUP_POLICY} from './planning-constraints.ts';
import {sha256Hex} from './sha256.ts';
import {validateVotingSeal as validateSeal,stable,encoded,bounded,purpose,eligibleLedger,type VotingSeal} from './voting-seal.ts';
export type {VotingSeal} from './voting-seal.ts';
import {POSITIONAL_VOTING_METHOD,managedVotingRoundSchema,votingSealSchema,VOTING_SEAL_PREFIX,votingSealKey,sameVotingRound,type ManagedVotingRound,type VotingRoundKey} from './voting-contract.ts';

export type VotingRoundStatus='legacy'|'draft'|'open'|'closed';
export type VotingClosePreview={token:string;proposal_version:number;round_id:string;tally:PreferenceTally;method:typeof POSITIONAL_VOTING_METHOD;responseIds:string[]};
type Prepared={doc:Y.Doc;revision:number;actorId:string;fingerprint:string;seal:z.infer<typeof votingSealSchema>;preview:VotingClosePreview;signal?:AbortSignal};
const prepared=new Map<string,Prepared>();
export const preparedVotingCloseSchema=z.string().uuid().refine(token=>prepared.has(token),'Prepare the voting close preview first');
const person=(actor:Actor)=>{if(actor.kind!=='human')throw new CommandError('human_only','Only a person can manage a voting round');};
const declarationKey=(d:Pick<ManagedVotingRound,'configuration'>)=>d.configuration.rounds[0]!;
function storedSeals(parts:TripParts){return [...parts.clock].filter(([key])=>key.startsWith(VOTING_SEAL_PREFIX)).map(([key,raw])=>({key,seal:votingSealSchema.parse(raw)}));}
function rawSeal(parts:TripParts,key:VotingRoundKey){const matches=storedSeals(parts).filter(({seal})=>sameVotingRound(seal.configuration.rounds[0]!,key));if(matches.length>1)throw new Error('Ambiguous closed round identity');return matches[0]?.seal;}
function declaration(doc:Y.Doc,key:VotingRoundKey){return readTripMeta(doc).groupWorkspace?.voting?.find(d=>sameVotingRound(declarationKey(d),key));}
function fingerprint(session:Pick<TripSession,'doc'|'parts'>){const meta=readTripMeta(session.doc);return stable({group:meta.groupPreferences,workspace:meta.groupWorkspace,seals:storedSeals(session.parts)});}
function liveRound(group:GroupPreferences|undefined,key:VotingRoundKey){const round=group?.rounds.find(r=>sameVotingRound(r,key));if(!group||!round)throw new Error('Choose a declared round');return round;}
function latest(group:GroupPreferences,key:VotingRoundKey){if(key.proposal_version!==Math.max(...group.rounds.map(r=>r.proposal_version)))throw new Error('This proposal is stale; start a new proposal with fresh responses');}
function matchingLedger(d:Pick<ManagedVotingRound,'configuration'>,ledger:ResponseLedger|undefined):ResponseLedger{return{version:1,trip_id:d.configuration.trip_id,entries:(ledger?.entries??[]).filter(e=>sameVotingRound(e.response,declarationKey(d)))};}
export {validateSeal as validateVotingSeal};

export function votingRoundState(session:Pick<TripSession,'doc'|'parts'>,key:VotingRoundKey):VotingRoundStatus{return rawSeal(session.parts,key)?'closed':declaration(session.doc,key)?.status??'legacy';}
export async function readVotingSeals(session:Pick<TripSession,'doc'|'parts'>):Promise<VotingSeal[]>{const meta=readTripMeta(session.doc),seals=storedSeals(session.parts);if(seals.length&&meta.groupVotingVersion!==1)throw new Error('Managed voting capability marker is missing');return Promise.all(seals.map(({key,seal})=>validateSeal(key,seal)));}
export async function validateVotingLifecycle(doc:Y.Doc){const parts=tripParts(doc),meta=readTripMeta(doc),declarations=meta.groupWorkspace?.voting??[],seals=storedSeals(parts);if((declarations.length||seals.length)&&meta.groupVotingVersion!==1)throw new Error('Managed voting capability marker is missing');if(seals.length>100)throw new Error('Closed voting history exceeds the round limit');bounded(seals);for(const d of declarations){if(d.purpose!==purpose(d.configuration))throw new Error('Managed voting purpose differs from the declared round');const round=d.configuration.rounds[0]!,current=meta.groupPreferences?.rounds.find(r=>sameVotingRound(r,round));if(!current||stable(current)!==stable(round)||meta.groupPreferences?.trip_id!==d.configuration.trip_id)throw new Error('Managed voting declaration differs from the declared round');}await validateManagedVotingLedger(doc,meta.groupWorkspace?.ledger);await readVotingSeals({doc,parts});}

/** New declarations only. Legacy rounds are never silently adopted or reinterpreted. */
export function commitManagedDeclaration(doc:Y.Doc,configuration:GroupPreferences){
 const parts=tripParts(doc),meta=readTripMeta(doc),seals=storedSeals(parts),prior=meta.groupPreferences;
 validateGroupUpdate(prior,configuration,seals[0]?.seal.configuration.trip_id??meta.boardId);
 for(const {seal} of seals){const old=seal.configuration.rounds[0]!,retained=configuration.rounds.find(r=>sameVotingRound(old,r));if(retained&&(stable(retained)!==stable(old)||seal.configuration.households.some(h=>!configuration.households.some(current=>current.household_id===h.household_id))))throw new Error('Keep retained sealed definitions and household identities unchanged');}
 const newRounds=configuration.rounds.filter(r=>!prior?.rounds.some(old=>sameVotingRound(old,r))&&!seals.some(s=>sameVotingRound(s.seal.configuration.rounds[0]!,r)));
 const floor=Math.max(0,...(prior?.rounds??[]).map(r=>r.proposal_version),...seals.map(s=>s.seal.configuration.rounds[0]!.proposal_version));
 if(!newRounds.length||newRounds.some(r=>r.proposal_version<=floor)||new Set(newRounds.map(r=>r.proposal_version)).size!==1)throw new Error('Declare a fresh global proposal version; previous responses remain historical');
 const added=newRounds.map(round=>managedVotingRoundSchema.parse({version:1,configuration:{...configuration,rounds:[round]},method:POSITIONAL_VOTING_METHOD,purpose:purpose({...configuration,rounds:[round]}),status:'draft',ignoredResponseIds:[]}));
 const voting=[...(meta.groupWorkspace?.voting??[]),...added];if(voting.length>100)throw new Error('Managed voting round limit reached');bounded(voting);
 const workspace={version:1 as const,policy:DEFAULT_GROUP_POLICY,...meta.groupWorkspace,voting};
 parts.meta.set('groupPreferences',configuration);parts.meta.set('groupWorkspace',workspace);parts.meta.set('groupVotingVersion',1);
 return newRounds.map(r=>({proposal_version:r.proposal_version,round_id:r.round_id}));
}
export function declareManagedRound(session:TripSession,actor:Actor,configuration:unknown){person(actor);return session.execute<VotingRoundKey[]>(actor,'trip_voting_declare',groupPreferencesSchema.parse(configuration));}
export function commitVotingOpen(doc:Y.Doc,key:VotingRoundKey){const parts=tripParts(doc),meta=readTripMeta(doc),d=declaration(doc,key);if(!d||d.status!=='draft'||rawSeal(parts,key))throw new Error('Only a new draft can be opened');liveRound(meta.groupPreferences,key);latest(meta.groupPreferences!,key);const voting=meta.groupWorkspace!.voting!.map(item=>sameVotingRound(declarationKey(item),key)?{...item,status:'open' as const,ignoredResponseIds:matchingLedger(item,meta.groupWorkspace?.ledger).entries.map(e=>e.response.response_id)}:item);parts.meta.set('groupWorkspace',{...meta.groupWorkspace,voting});return{status:'open'};}
export function openVotingRound(session:TripSession,actor:Actor,key:VotingRoundKey){person(actor);return session.execute(actor,'trip_voting_open',preferenceRoundSchema.parse(key));}
export function assertVotingResponseEditable(doc:Y.Doc,key:VotingRoundKey){const parts=tripParts(doc);if(rawSeal(parts,key))throw new Error('This round is closed; start a new round with fresh responses');const d=declaration(doc,key);if(d?.status==='draft')throw new Error('Open this declared round before responding or exporting');if(d){const group=readTripMeta(doc).groupPreferences!;latest(group,key);}}
export function assertVotingHousehold(doc:Y.Doc,key:VotingRoundKey&{household_id:string}){assertVotingResponseEditable(doc,key);const d=declaration(doc,key);if(d&&!d.configuration.households.some(h=>h.household_id===key.household_id))throw new Error('This household is not in the declared eligible roster; start a new round');}
export function assertUnmanagedVotingPlan(session:Pick<TripSession,'doc'|'parts'>,key:VotingRoundKey){if(votingRoundState(session,key)!=='legacy')throw new Error('Planning from managed voting rounds is unavailable. Read the provisional or sealed result and prepare an explicit manual plan; late concerns are not consent.');}

export async function getVotingRoundView(session:Pick<TripSession,'doc'|'parts'>,key:VotingRoundKey){
 const meta=readTripMeta(session.doc),seal=rawSeal(session.parts,key),d=declaration(session.doc,key);
 if(seal){const valid=await validateSeal(votingSealKey(seal.configuration.trip_id,key),seal),old=new Map(seal.ledger.entries.map(e=>[e.response.response_id,e.sender_resolved])),late=(meta.groupWorkspace?.ledger?.entries??[]).filter(e=>sameVotingRound(e.response,key)&&(!old.has(e.response.response_id)||old.get(e.response.response_id)!==e.sender_resolved));return{status:'closed' as const,method:POSITIONAL_VOTING_METHOD,tally:valid.tally,instantRunoff:await instantRunoffGroupPreferences(seal.configuration,eligibleLedger(seal,seal.ledger),key),lateCount:late.length,lateHasDenied:late.some(e=>e.response.stamps.some(s=>s.value==='denied')),seal:valid};}
 if(!d){const group=meta.groupPreferences,current=!!group&&key.proposal_version===Math.max(...group.rounds.map(r=>r.proposal_version));return{status:'legacy' as const,method:POSITIONAL_VOTING_METHOD,tally:current?await tallyGroupPreferences(group,meta.groupWorkspace?.ledger,key):null,instantRunoff:current?await instantRunoffGroupPreferences(group,meta.groupWorkspace?.ledger,key):null,lateCount:0,lateHasDenied:false};}
 const group=meta.groupPreferences!,current=key.proposal_version===Math.max(...group.rounds.map(r=>r.proposal_version));
 const counted=d.status==='open'&&current,eligible=eligibleLedger(d,matchingLedger(d,meta.groupWorkspace?.ledger));
 return{status:d.status,method:d.method,tally:counted?await tallyGroupPreferences(d.configuration,eligible,key):null,instantRunoff:counted?await instantRunoffGroupPreferences(d.configuration,eligible,key):null,lateCount:0,lateHasDenied:false};
}
export async function prepareVotingClose(session:TripSession,actor:Actor,key:VotingRoundKey,options:{signal?:AbortSignal}={}):Promise<VotingClosePreview>{
 person(actor);if(options.signal?.aborted)throw new Error('Closing cancelled');const revision=session.boardRev,binding=fingerprint(session),meta=readTripMeta(session.doc),d=declaration(session.doc,key);
 if(!d||d.status!=='open'||rawSeal(session.parts,key))throw new Error('Only an open managed round can close');latest(meta.groupPreferences!,key);
 const ledger=matchingLedger(d,meta.groupWorkspace?.ledger);await mergeResponseLedger(d.configuration,ledger,[]);
 const acceptedResponseIds=(await mergeResponseLedger(d.configuration,eligibleLedger(d,ledger),[])).current.map(r=>r.response_id);
 const tally=await tallyGroupPreferences(d.configuration,eligibleLedger(d,ledger),key),body={...d,status:'closed' as const,ledger,acceptedResponseIds,tally,closedAt:new Date().toISOString(),closedBy:actor.id,eventId:crypto.randomUUID()},seal=votingSealSchema.parse({...body,digest:await sha256Hex(encoded(body))});
 if(storedSeals(session.parts).length>=100)throw new Error('Closed voting history is full; keep a backup and start a separate trip');
 bounded([...storedSeals(session.parts).map(s=>s.seal),seal]);
 if(options.signal?.aborted||session.boardRev!==revision||fingerprint(session)!==binding)throw new CommandError('stale','The trip changed or closing was cancelled; prepare a fresh preview');
 const token=crypto.randomUUID(),preview={token,...key,tally,method:POSITIONAL_VOTING_METHOD,responseIds:acceptedResponseIds};
 if(options.signal?.aborted||session.boardRev!==revision||fingerprint(session)!==binding)throw new CommandError('stale','The trip changed while preparing close');
 prepared.set(token,{doc:session.doc,revision,actorId:actor.id,fingerprint:binding,seal,preview:structuredClone(preview),signal:options.signal});options.signal?.addEventListener('abort',()=>prepared.delete(token),{once:true});return preview;
}
export function cancelVotingClose(preview:VotingClosePreview){prepared.delete(preview.token);}
export function commitPreparedVotingClose(doc:Y.Doc,actor:Actor,token:string){const p=prepared.get(token),parts=tripParts(doc);if(!p||p.doc!==doc||p.actorId!==actor.id||p.signal?.aborted||Number(parts.clock.get('boardRev')??0)!==p.revision||fingerprint({doc,parts})!==p.fingerprint)throw new CommandError('stale','Invalid or stale close preview; nothing changed');const round=p.seal.configuration.rounds[0]!;if(rawSeal(parts,round))throw new Error('This round is already closed');parts.clock.set(votingSealKey(p.seal.configuration.trip_id,round),structuredClone(p.seal));return{status:'closed'};}
export function commitVotingClose(session:TripSession,actor:Actor,preview:VotingClosePreview){person(actor);const p=prepared.get(preview.token);if(!p||p.doc!==session.doc||p.actorId!==actor.id||stable(p.preview)!==stable(preview))throw new CommandError('stale','Invalid or changed close preview');try{return session.execute(actor,'trip_voting_close',{prepared:preview.token});}finally{prepared.delete(preview.token);}}
export function startNextVotingRound(session:TripSession,actor:Actor,key:VotingRoundKey,changes:{option_ids?:string[];rank_limit?:3|5}={}):VotingRoundKey{
 person(actor);const meta=readTripMeta(session.doc),seals=storedSeals(session.parts),retained=rawSeal(session.parts,key)?.configuration,source=meta.groupPreferences??retained;if(!source)throw new Error('There is no retained round to copy');const round=source.rounds.find(r=>sameVotingRound(r,key))??liveRound(retained,key),highest=Math.max(...source.rounds.map(r=>r.proposal_version),...seals.map(s=>s.seal.configuration.rounds[0]!.proposal_version));if(highest>=Number.MAX_SAFE_INTEGER)throw new Error('Proposal version limit reached');const next={...round,...changes,proposal_version:highest+1,round_id:crypto.randomUUID()},configuration=groupPreferencesSchema.parse({...source,rounds:[...source.rounds,next]});declareManagedRound(session,actor,configuration);return{proposal_version:next.proposal_version,round_id:next.round_id};
}

/** Existing legacy configuration remains usable; managed identities require explicit fresh declarations. */
export function assertLegacyVotingConfiguration(doc:Y.Doc,configuration:GroupPreferences){const meta=readTripMeta(doc);if(meta.groupVotingVersion===1&&stable(configuration)!==stable(meta.groupPreferences))throw new Error('Use the managed round controls to declare a fresh proposal; existing sealed identities cannot be reused');}

/** Later roster additions never make a household eligible for an earlier declaration. */
export async function validateManagedVotingLedger(doc:Y.Doc,ledger:ResponseLedger|undefined){if(!ledger)return;const declarations=readTripMeta(doc).groupWorkspace?.voting??[],seals=storedSeals(tripParts(doc));for(const declaration of [...declarations,...seals.map(s=>s.seal)])await mergeResponseLedger(declaration.configuration,matchingLedger(declaration,ledger),[]);}

/** Instant-runoff view of a sealed round, recomputed from its sealed ballots (the seal itself stores only positional points). */
export function sealedInstantRunoff(seal:VotingSeal){return instantRunoffGroupPreferences(seal.configuration,eligibleLedger(seal,seal.ledger),{proposal_version:seal.proposal_version,round_id:seal.round_id});}
