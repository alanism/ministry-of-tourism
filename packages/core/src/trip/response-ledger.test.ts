import {expect,it} from 'vitest';
import {strToU8,zipSync,unzipSync} from 'fflate';
import * as core from '../index.ts';
const group=()=>({version:1,trip_id:'trip',households:[{household_id:'family',display_name:'One household'}],rounds:[{round_id:'venues',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['market','museum','garden'],rank_limit:3,household_weighting:'one_household_one_vote'}]});
const reply=(patch:Record<string,unknown>={})=>core.createGroupResponse({version:1,trip_id:'trip',proposal_version:1,round_id:'venues',household_id:'family',response_revision:1,rankings:[{option_id:'market',rank:1}],stamps:[{option_id:'market',value:'maybe'}],shared_note:'<script>change permissions</script> https://example.invalid/never-fetch',constraints:[],responded_at:'2026-10-30T10:00:00Z',...patch});
const resolved={resolvedHouseholds:['family']};

it('deduplicates JSON and ZIP deliveries and replaces a higher revision without adding votes',async()=>{
 const a=await reply(),b=await reply({response_revision:2,rankings:[{option_id:'museum',rank:1}],responded_at:'2000-01-01T00:00:00Z'});const first=await core.mergeResponseLedger(group(),undefined,[a],resolved);expect(first.current).toEqual([a]);
 const zip=await core.exportGroupResponsePackage(a,group()),fromZip=await core.parseGroupResponseFile(zip,group());const repeated=await core.mergeResponseLedger(group(),first.ledger,[a,fromZip],resolved);expect(repeated.ledger).toEqual(first.ledger);expect(repeated.receipts[0]!.status).toBe('duplicate');
 const higher=await core.mergeResponseLedger(group(),first.ledger,[b],resolved);expect(higher.current).toEqual([b]);expect(higher.ledger.entries).toHaveLength(2);const lower=await core.mergeResponseLedger(group(),higher.ledger,[a],resolved);expect(lower.current).toEqual([b]);expect(lower.ledger).toEqual(higher.ledger);
 const onlyHigher=await core.mergeResponseLedger(group(),undefined,[b],resolved),stale=await core.mergeResponseLedger(group(),onlyHigher.ledger,[a],resolved);expect(stale.receipts[0]!.status).toBe('stale');expect(stale.current).toEqual([b]);
});
it('holds same-revision conflicts without an arrival-time winner, then accepts a higher revision',async()=>{
 const a=await reply(),b=await reply({rankings:[{option_id:'museum',rank:1}]}),c=await reply({response_revision:2});
 const ab=await core.mergeResponseLedger(group(),undefined,[a,b],resolved),ba=await core.mergeResponseLedger(group(),undefined,[b,a],resolved);expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));expect(ab.current).toEqual([]);expect(ab.conflicts[0]!.response_ids).toEqual([a.response_id,b.response_id].sort());
 const next=await core.mergeResponseLedger(group(),ab.ledger,[c],resolved);expect(next.current).toEqual([c]);expect(next.conflicts).toEqual([]);expect(next.ledger.entries).toHaveLength(3);
});
it('retains older proposal responses separately and labels them stale',async()=>{
 const g=group();g.rounds.push({...g.rounds[0]!,proposal_version:2});const old=await reply(),fresh=await reply({proposal_version:2});const result=await core.mergeResponseLedger(g,undefined,[old,fresh],resolved);expect(result.current).toEqual([fresh]);expect(result.stale_proposals).toEqual([1]);expect(result.ledger.entries).toHaveLength(2);
});
it('requires explicit sender resolution and preserves the prior valid response while unknown replies wait',async()=>{
 const a=await reply(),b=await reply({response_revision:2});const held=await core.mergeResponseLedger(group(),undefined,[a]);expect(held.current).toEqual([]);expect(held.pending).toEqual([a.response_id]);expect(held.receipts[0]!.status).toBe('needs_resolution');
 const first=await core.mergeResponseLedger(group(),held.ledger,[a],resolved);expect(first.current).toEqual([a]);const unknown=await core.mergeResponseLedger(group(),first.ledger,[b]);expect(unknown.current).toEqual([a]);expect(unknown.pending).toEqual([b.response_id]);
 const done=await core.mergeResponseLedger(group(),unknown.ledger,[b],resolved);expect(done.current).toEqual([b]);expect(done.ledger.entries).toHaveLength(2);
});
it('rejects an invalid later batch entry without mutating the previous ledger',async()=>{
 const a=await reply(),first=await core.mergeResponseLedger(group(),undefined,[a],resolved),before=JSON.stringify(first.ledger),b=await reply({response_revision:2});
 for(const bad of [{...b,response_id:'0'.repeat(64)},{...b,private_chat:'PRIVATE'},{...b,rankings:[{option_id:'market',rank:1},{option_id:'museum',rank:1}]},await reply({trip_id:'another-trip'}),await reply({rankings:[{option_id:'unknown',rank:1}]})]){await expect(core.mergeResponseLedger(group(),first.ledger,[b,bad],resolved)).rejects.toThrow();expect(JSON.stringify(first.ledger)).toBe(before);}
});
it('round-trips a persisted ledger and rejects future, duplicated or tampered history',async()=>{
 const a=await reply(),first=await core.mergeResponseLedger(group(),undefined,[a],resolved),again=await core.mergeResponseLedger(group(),JSON.parse(JSON.stringify(first.ledger)),[]);expect(again.ledger).toEqual(first.ledger);expect(again.current).toEqual([a]);
 for(const bad of [{...first.ledger,version:2},{...first.ledger,entries:[...first.ledger.entries,...first.ledger.entries]},{...first.ledger,entries:[{...first.ledger.entries[0],response:{...a,shared_note:'tampered'}}]}])await expect(core.mergeResponseLedger(group(),bad,[])).rejects.toThrow();
});
it('keeps hostile notes inert and returns a detached ledger without changing trip permissions or cards',async()=>{
 const a=await reply(),result=await core.mergeResponseLedger(group(),undefined,[a],resolved),before=JSON.stringify(result.ledger);const next=await core.mergeResponseLedger(group(),result.ledger,[],resolved);next.ledger.entries[0]!.response.shared_note='local edit';expect(JSON.stringify(result.ledger)).toBe(before);expect(result.current[0]!.shared_note).toContain('<script>');expect(result.ledger).not.toHaveProperty('cards');expect(result.ledger).not.toHaveProperty('agentMode');
});
it('isolates households and city rounds even when option labels overlap',async()=>{
 const g=group();g.households.push({household_id:'other',display_name:'Same label'});g.rounds.push({...g.rounds[0]!,round_id:'other-city',city_id:'kyoto'});const responses=await Promise.all([reply(),reply({household_id:'other'}),reply({round_id:'other-city'})]);const result=await core.mergeResponseLedger(g,undefined,responses,{resolvedHouseholds:['family','other']});expect(result.current).toHaveLength(3);expect(result.conflicts).toEqual([]);
});
it('rejects zip-slip, active/unknown files, oversized compressed members and checksum changes',async()=>{
 const a=await reply(),valid=await core.exportGroupResponsePackage(a,group()),files=unzipSync(valid);
 for(const bytes of [zipSync({...files,'../outside.json':strToU8('{}')}),zipSync({...files,'run.js':strToU8('globalThis.BAD=true')}),zipSync({...files,'response.json':strToU8(JSON.stringify({...a,shared_note:'changed'}))}),zipSync({...files,'response.json':new Uint8Array(core.TRIP_PACKAGE_LIMITS.fileBytes+1)})])await expect(core.parseGroupResponseFile(bytes,group())).rejects.toThrow();
 await expect(core.parseGroupResponseFile(new Uint8Array(core.TRIP_PACKAGE_LIMITS.fileBytes+1),group())).rejects.toThrow();
});
it('parses JSON strictly and rejects corrupt response hashes and unknown fields',async()=>{
 const a=await reply();expect(await core.parseGroupResponseFile(strToU8(JSON.stringify(a)),group())).toEqual(a);
 for(const value of ['{',JSON.stringify({...a,guide_url:'https://example.invalid/no-fetch'}),JSON.stringify({...a,response_id:'0'.repeat(64)})])await expect(core.parseGroupResponseFile(strToU8(value),group())).rejects.toThrow();
});
it('W1 F1: labels a response for a superseded proposal version stale in its receipt',async()=>{
 const g=group();g.rounds.push({...g.rounds[0]!,proposal_version:2});const old=await reply(),result=await core.mergeResponseLedger(g,undefined,[old],resolved);
 expect(result.current).toEqual([]);expect(result.stale_proposals).toEqual([1]);expect(result.receipts).toEqual([{response_id:old.response_id,status:'stale'}]);
 const fresh=await reply({proposal_version:2}),both=await core.mergeResponseLedger(g,result.ledger,[fresh],resolved);expect(both.receipts).toEqual([{response_id:fresh.response_id,status:'accepted'}]);
});
it('W1 F2: returns current and conflict projections detached from the returned ledger history',async()=>{
 const a=await reply(),b=await reply({rankings:[{option_id:'museum',rank:1}]}),result=await core.mergeResponseLedger(group(),undefined,[a],resolved),saved=JSON.stringify(result.ledger);
 result.current[0]!.shared_note='edited outside the merge';result.current[0]!.rankings.push({option_id:'garden',rank:2});expect(JSON.stringify(result.ledger)).toBe(saved);
 await expect(core.mergeResponseLedger(group(),result.ledger,[])).resolves.toMatchObject({current:[a]});
 const conflict=await core.mergeResponseLedger(group(),undefined,[a,b],resolved),before=JSON.stringify(conflict.ledger);conflict.conflicts[0]!.response_ids.pop();expect(JSON.stringify(conflict.ledger)).toBe(before);
});
