// MOT-107: response files are data. This ledger never replaces a board or itinerary.
import {z} from 'zod';
import {unzipSync,zipSync} from 'fflate';
import {groupPreferencesSchema,responseLedgerSchema,validateGroupResponse,type GroupResponse} from './group-preferences.ts';
import {sha256Hex,TRIP_PACKAGE_LIMITS} from './package.ts';

const ledgerSchema=responseLedgerSchema,entrySchema=responseLedgerSchema.shape.entries.element;
export type ResponseLedger=z.infer<typeof ledgerSchema>;
export interface ResponseMergeOptions { /** Explicit organizer resolution of household labels; never authentication. */ resolvedHouseholds?:readonly string[]; }
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const decode=(bytes:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const key=(r:GroupResponse)=>JSON.stringify([r.proposal_version,r.round_id,r.household_id]);
function bounded(bytes:Uint8Array,max=TRIP_PACKAGE_LIMITS.fileBytes){if(bytes.length>max)throw new Error('Response file exceeds the portable size limit; keep the previous ledger and use a smaller file.');}

/** Immutable merge. Every response and all previous history validate before a candidate is returned. */
export async function mergeResponseLedger(configuration:unknown,previous:unknown,responses:readonly unknown[],options:ResponseMergeOptions={}){
 const group=groupPreferencesSchema.parse(configuration);
 if(!Array.isArray(responses)||responses.length>1000)throw new Error('Import at most 1000 responses at a time.');
 const old=previous===undefined?{version:1 as const,trip_id:group.trip_id,entries:[]}:ledgerSchema.parse(previous);
 bounded(encode(old));if(old.trip_id!==group.trip_id)throw new Error('Ledger belongs to another trip.');
 const resolved=new Set(options.resolvedHouseholds??[]);
 if([...resolved].some(id=>!group.households.some(h=>h.household_id===id)))throw new Error('Resolve only a declared household label.');
 const entries=new Map<string,z.infer<typeof entrySchema>>();
 for(const entry of old.entries){
  const {response}=await validateGroupResponse(entry.response,group);
  if(entries.has(response.response_id))throw new Error('Duplicate response identity in ledger history.');
  entries.set(response.response_id,{response,sender_resolved:entry.sender_resolved});
 }
 const before=new Map(entries),incoming=new Map<string,GroupResponse>();
 for(const raw of responses){bounded(encode(raw));const {response}=await validateGroupResponse(raw,group);incoming.set(response.response_id,response);}
 for(const response of incoming.values())entries.set(response.response_id,{response,sender_resolved:entries.get(response.response_id)?.sender_resolved===true||resolved.has(response.household_id)});
 if(entries.size>1000)throw new Error('Ledger history is full; keep the previous ledger and archive the round before importing more.');
 const ledger:ResponseLedger={version:1,trip_id:group.trip_id,entries:[...entries.values()].sort((a,b)=>compare(a.response.response_id,b.response.response_id))};bounded(encode(ledger));
 const activeProposal=Math.max(...group.rounds.map(r=>r.proposal_version)),buckets=new Map<string,GroupResponse[]>();
 for(const entry of ledger.entries){if(!entry.sender_resolved)continue;const k=key(entry.response),list=buckets.get(k)??[];list.push(entry.response);buckets.set(k,list);}
 const current:GroupResponse[]=[],conflicts:{proposal_version:number;round_id:string;household_id:string;response_revision:number;response_ids:string[]}[]=[];
 for(const list of buckets.values()){
  const highest=Math.max(...list.map(r=>r.response_revision)),latest=list.filter(r=>r.response_revision===highest);
  if(latest[0]!.proposal_version!==activeProposal)continue;
  if(latest.length===1)current.push(structuredClone(latest[0]!));
  else conflicts.push({proposal_version:activeProposal,round_id:latest[0]!.round_id,household_id:latest[0]!.household_id,response_revision:highest,response_ids:latest.map(r=>r.response_id).sort(compare)});
 }
 current.sort((a,b)=>compare(key(a),key(b)));conflicts.sort((a,b)=>compare(JSON.stringify([a.round_id,a.household_id]),JSON.stringify([b.round_id,b.household_id])));
 const receipts=[...incoming.values()].sort((a,b)=>compare(a.response_id,b.response_id)).map(response=>{
  const saved=entries.get(response.response_id)!,prior=before.get(response.response_id),list=buckets.get(key(response))??[],highest=Math.max(0,...list.map(r=>r.response_revision));
  const status=!saved.sender_resolved?'needs_resolution':prior?.sender_resolved?'duplicate':response.proposal_version!==activeProposal||response.response_revision<highest?'stale':list.filter(r=>r.response_revision===highest).length>1?'conflict':prior?'resolved':'accepted';
  return {response_id:response.response_id,status};
 });
 return {ledger,current,conflicts,pending:ledger.entries.filter(e=>!e.sender_resolved).map(e=>e.response.response_id),stale_proposals:[...new Set(ledger.entries.map(e=>e.response.proposal_version).filter(v=>v<activeProposal))].sort((a,b)=>a-b),receipts,identity:'household_labels_only' as const};
}

const responseManifest=z.object({format:z.literal('mot-household-response'),version:z.literal(1),file:z.literal('response.json'),size:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();

/** The response ZIP carries one explicitly shared envelope, never an organizer roster or board. */
export async function exportGroupResponsePackage(raw:unknown,configuration:unknown):Promise<Uint8Array>{
 const {response}=await validateGroupResponse(raw,configuration),bytes=encode(response);bounded(bytes);
 return zipSync({'response.json':bytes,'manifest.json':encode({format:'mot-household-response',version:1,file:'response.json',size:bytes.length,sha256:await sha256Hex(bytes)})},{level:6});
}

/** Reuse native package byte/expansion/path/checksum limits, before any response can be merged. */
export async function parseGroupResponseFile(bytes:Uint8Array,configuration:unknown):Promise<GroupResponse>{
 bounded(bytes);let raw:unknown;
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  let declared=0,refused='',total=0;const seen=new Set<string>();
  const files=unzipSync(bytes,{filter:file=>{
   declared+=file.originalSize;
   if(seen.has(file.name)||!['manifest.json','response.json'].includes(file.name)||file.originalSize>TRIP_PACKAGE_LIMITS.fileBytes||declared>TRIP_PACKAGE_LIMITS.totalBytes)refused='Unsafe, duplicate, active or oversized response ZIP member. Keep the previous ledger.';
   seen.add(file.name);return !refused;
  }});
  if(refused)throw new Error(refused);
  for(const data of Object.values(files)){bounded(data);total+=data.length;}
  if(total>TRIP_PACKAGE_LIMITS.totalBytes||!files['response.json']||!files['manifest.json'])throw new Error('Incomplete or oversized response ZIP.');
  const manifest=responseManifest.parse(decode(files['manifest.json']));
  if(files['response.json'].length!==manifest.size||await sha256Hex(files['response.json'])!==manifest.sha256)throw new Error('Response ZIP checksum mismatch; keep the previous ledger.');
  raw=decode(files['response.json']);
 }else raw=decode(bytes);
 return (await validateGroupResponse(raw,configuration)).response;
}

/** Shared by Node CLI and browser File/Blob consumers; no scripts, URLs or board imports run. */
export async function mergeResponseFiles(configuration:unknown,previous:unknown,files:readonly Uint8Array[],options:ResponseMergeOptions={}){
 if(files.reduce((sum,file)=>sum+file.length,0)>TRIP_PACKAGE_LIMITS.totalBytes)throw new Error('Response batch exceeds the portable size limit.');
 const responses=[];for(const file of files)responses.push(await parseGroupResponseFile(file,configuration));
 return mergeResponseLedger(configuration,previous,responses,options);
}
