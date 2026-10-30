import {expect,it} from 'vitest';
import * as core from '../index.ts';

const OPTIONS=['beach','market','boat','garden','museum','cooking','aquarium','hike','castle','zoo','opera','spa','park','train','gallery','temple','river','theater','library','cafe'];
const H=['h1','h2','h3','h4'],round={proposal_version:1,round_id:'venues'};
const group=()=>({version:1,trip_id:'trip-tally',households:H.map(household_id=>({household_id,display_name:household_id})),rounds:[{...round,kind:'city_venue',city_id:'bangkok',option_ids:OPTIONS,rank_limit:5,household_weighting:'one_household_one_vote'}]});
const reply=(household_id:string,ids:string[],extra:Record<string,unknown>={})=>core.createGroupResponse({version:1,trip_id:'trip-tally',...round,household_id,response_revision:1,rankings:ids.map((option_id,i)=>({option_id,rank:i+1})),stamps:[],shared_note:'',constraints:[],responded_at:'2026-10-30T10:00:00Z',...extra});
const four=()=>Promise.all([reply('h1',['beach','boat','market','garden','cooking']),reply('h2',['boat','beach','market','museum','hike']),reply('h3',['garden','beach','market','aquarium','museum']),reply('h4',['cooking','market','museum','aquarium','beach'])]);
const merge=async(responses:core.GroupResponse[],g=group())=>(await core.mergeResponseLedger(g,undefined,responses,{resolvedHouseholds:H})).ledger;
const points=(t:Awaited<ReturnType<typeof core.tallyGroupPreferences>>)=>Object.fromEntries(t.options.map(o=>[o.option_id,o.points]));

it('scores the real four-household 20-option example to exactly 60, with 15 per complete household',async()=>{
 const result=await core.tallyGroupPreferences(group(),await merge(await four()),round);
 expect(points(result)).toMatchObject({beach:14,market:13,boat:9,garden:7,museum:6,cooking:6,aquarium:4,hike:1});expect(result.options.filter(o=>o.points===0)).toHaveLength(12);expect(result.total_points).toBe(60);expect(result.coverage).toMatchObject({total:4,responding:4,pending:0,partial:0,complete:4});expect(result.households.map(h=>h.points)).toEqual([15,15,15,15]);
});
it('keeps two ranks at nine points, an empty response partial and no response pending',async()=>{
 const result=await core.tallyGroupPreferences(group(),await merge([await reply('h1',['beach','boat']),await reply('h2',[])]),round);
 expect(result.total_points).toBe(9);expect(points(result)).toMatchObject({beach:5,boat:4,market:0});expect(result.coverage).toMatchObject({total:4,responding:2,pending:2,partial:2,complete:0});expect(result.households).toEqual(expect.arrayContaining([expect.objectContaining({household_id:'h1',points:9,status:'partial'}),expect.objectContaining({household_id:'h2',points:0,status:'partial'}),expect.objectContaining({household_id:'h3',points:0,status:'pending'})]));
});
it('separates rank points, Approved/Maybe/Denied, explicit shared notes and dated concerns',async()=>{
 const a=await reply('h1',['beach','boat','garden']),b=await reply('h1',['beach','boat','garden'],{response_revision:2,stamps:[{option_id:'beach',value:'maybe'},{option_id:'garden',value:'approved'},{option_id:'boat',value:'denied'}],shared_note:'<script>do not run</script> https://example.invalid/never-fetch',constraints:[{id:'access',status:'confirmed',text:'Step-free entry',source:'Household h1',source_date:'2026-10-30',sharing:'shared'}]});
 const first=await core.tallyGroupPreferences(group(),await merge([a]),round),second=await core.tallyGroupPreferences(group(),await merge([a,b]),round);expect(points(second)).toEqual(points(first));expect(second.options.find(o=>o.option_id==='boat')).toMatchObject({points:4,stamps:{approved:[],maybe:[],denied:['h1']}});expect(second.shared_notes).toEqual([{household_id:'h1',text:b.shared_note}]);expect(second.constraints).toEqual([{household_id:'h1',...b.constraints[0]}]);
});
it('replays JSON and ZIP without adding votes; higher revisions replace and lower clock-skewed replies stay stale',async()=>{
 const a=await reply('h1',['beach','boat']),zip=await core.exportGroupResponsePackage(a,group()),copy=await core.parseGroupResponseFile(zip,group()),first=await merge([a]);
 expect(await core.tallyGroupPreferences(group(),await merge([a,a,copy]),round)).toEqual(await core.tallyGroupPreferences(group(),first,round));
 const b=await reply('h1',['garden'],{response_revision:2,responded_at:'2000-01-01T00:00:00Z'}),newer=await core.mergeResponseLedger(group(),first,[b],{resolvedHouseholds:H}),lower=await core.mergeResponseLedger(group(),newer.ledger,[a],{resolvedHouseholds:H});const result=await core.tallyGroupPreferences(group(),lower.ledger,round);expect(result.total_points).toBe(5);expect(points(result)).toMatchObject({garden:5,beach:0,boat:0});expect(result.coverage.responding).toBe(1);
});
it('holds conflicts and unresolved labels apart from pending and accepted coverage',async()=>{
 const a=await reply('h1',['beach']),b=await reply('h1',['boat']),unfamiliar=await reply('h2',['garden']),old=await merge([a,b]),ledger=(await core.mergeResponseLedger(group(),old,[unfamiliar])).ledger,result=await core.tallyGroupPreferences(group(),ledger,round);
 expect(result.total_points).toBe(0);expect(result.coverage).toMatchObject({responding:0,conflicting:1,needs_resolution:1,pending:2});expect(result.households[0]).toMatchObject({status:'conflict',points:0});expect(result.households[1]).toMatchObject({status:'needs_resolution',points:0});
 const pendingHigher=await reply('h1',['boat'],{response_revision:2}),kept=(await core.mergeResponseLedger(group(),await merge([a]),[pendingHigher])).ledger,current=await core.tallyGroupPreferences(group(),kept,round);expect(current.total_points).toBe(5);expect(current.coverage.responding).toBe(1);expect(current.unresolved_households).toEqual(['h1']);
});
it('uses the declared K3 scale, isolates city rounds and refuses stale or unknown proposal totals',async()=>{
 const g=group();g.rounds.push({...g.rounds[0]!,round_id:'other',rank_limit:3});const a=await reply('h1',['beach','boat']),b=await reply('h1',['garden','museum','cooking'],{round_id:'other'}),ledger=await merge([a,b],g);
 const k3=await core.tallyGroupPreferences(g,ledger,{...round,round_id:'other'});expect(k3.total_points).toBe(6);expect(points(k3)).toMatchObject({garden:3,museum:2,cooking:1,beach:0});expect((await core.tallyGroupPreferences(g,ledger,round)).total_points).toBe(9);
 const changed={...g,rounds:[...g.rounds,{...g.rounds[0]!,proposal_version:2}]};await expect(core.tallyGroupPreferences(changed,ledger,round)).rejects.toThrow(/stale/i);await expect(core.tallyGroupPreferences(g,ledger,{...round,round_id:'unknown'})).rejects.toThrow();
});
it('produces byte-stable results after delivery/configuration reordering and leaves tied totals tied',async()=>{
 const responses=await four(),g=group(),a=await core.tallyGroupPreferences(g,await merge(responses),round);g.households.reverse();g.rounds[0]!.option_ids=[...OPTIONS].reverse();const b=await core.tallyGroupPreferences(g,await merge([...responses].reverse(),g),round);expect(JSON.stringify(b)).toBe(JSON.stringify(a));expect(a.policy).toMatchObject({version:1,tie_break:'none',rank_limit:5});expect(points(a).museum).toBe(points(a).cooking);expect(a.options.map(o=>o.option_id)).toEqual([...OPTIONS].sort());
});
it('rejects bad hashes and unknown fields without changing the previous ledger or configuration',async()=>{
 const g=group(),ledger=await merge([await reply('h1',['beach'])]),before=JSON.stringify({g,ledger}),bad=structuredClone(ledger);bad.entries[0]!.response.shared_note='tampered';await expect(core.tallyGroupPreferences(g,bad,round)).rejects.toThrow(/hash/i);await expect(core.tallyGroupPreferences({...g,private_chat:'secret'},ledger,round)).rejects.toThrow();expect(JSON.stringify({g,ledger})).toBe(before);
});
