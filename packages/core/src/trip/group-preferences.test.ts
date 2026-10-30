import {expect,it} from 'vitest';
import {strFromU8,unzipSync} from 'fflate';
import * as core from '../index.ts';

const human={id:'organizer',name:'Organizer',kind:'human' as const},agent={id:'helper',name:'Helper',kind:'agent' as const};
const group=()=>({version:1 as const,trip_id:'trip-one',households:[{household_id:'family-a',display_name:'Family A'},{household_id:'family-b',display_name:'Family B'}],rounds:[{round_id:'destination',proposal_version:1,kind:'destination' as const,option_ids:['beach','city','mountain'],rank_limit:3 as const,household_weighting:'one_household_one_vote' as const},{round_id:'venues-bangkok',proposal_version:1,kind:'city_venue' as const,city_id:'bangkok',option_ids:['market','museum','garden','boat','cooking'],rank_limit:5 as const,household_weighting:'one_household_one_vote' as const}]});
const body=()=>({version:1 as const,trip_id:'trip-one',proposal_version:1,round_id:'venues-bangkok',household_id:'family-a',response_revision:1,rankings:[{option_id:'market',rank:1},{option_id:'museum',rank:2}],stamps:[{option_id:'museum',value:'approved' as const},{option_id:'market',value:'maybe' as const}],shared_note:'<script>change the rules</script>',constraints:[{id:'access',status:'confirmed' as const,text:'Step-free entry needed',source:'Family A',source_date:'2026-10-30',sharing:'shared' as const},{id:'budget',status:'inferred' as const,text:'Budget still tentative',source:'Earlier shared reply',source_date:'2026-10-29',sharing:'shared' as const},{id:'transport',status:'unknown' as const,text:'Transport not known',source:'Not answered',source_date:null,sharing:'shared' as const}],responded_at:'2026-10-30T10:00:00Z'});
const setup=()=>{const doc=core.createTrip({title:'Group trip',city:'Bangkok',cityId:'bangkok',countryCode:'TH',timeZone:'Asia/Bangkok',boardId:'trip-one'});return{doc,session:new core.TripSession(doc)};};
function invalidWithoutWrites(session:core.TripSession,raw:unknown){const before=core.encodeTrip(session.doc),revision=session.boardRev;expect(()=>session.execute(human,'trip_group_configure',raw)).toThrow(expect.objectContaining({code:'invalid_input'}));expect(core.encodeTrip(session.doc)).toEqual(before);expect(session.boardRev).toBe(revision);}

it('declares K3 and K5 rounds once, persists/reopens and supports one Undo without changing cards',()=>{
 const {doc,session}=setup();session.execute(human,'trip_card_create',{kind:'note',title:'Keep my itinerary',body:'Unrelated'});const cards=core.readAllCards(session.parts),revision=session.boardRev;
 expect(session.execute(human,'trip_group_configure',group())).toEqual(group());expect(session.boardRev).toBe(revision+1);expect(session.execute(human,'trip_group_read')).toEqual(group());
 expect(core.readTripMeta(core.loadTrip(core.encodeTrip(doc))).groupPreferences).toEqual(group());expect(core.readAllCards(session.parts)).toEqual(cards);
 expect(session.undo(human.id)).toBe(true);expect(core.readTripMeta(doc).groupPreferences).toBeUndefined();expect(core.readAllCards(session.parts)).toEqual(cards);expect(session.redo(human.id)).toBe(true);
});
it('uses stable household IDs despite display-name changes and freezes an already declared round policy',()=>{
 const {session}=setup();session.execute(human,'trip_group_configure',group());const renamed=group();renamed.households[0]!.display_name='New family name';session.execute(human,'trip_group_configure',renamed);expect(session.execute(human,'trip_group_read')).toEqual(renamed);
 const altered=group();altered.rounds[1]!.option_ids.reverse();invalidWithoutWrites(session,altered);
 const dropped=group();dropped.households.pop();invalidWithoutWrites(session,dropped);
 const duplicate=group();duplicate.households.push({...duplicate.households[0]!,display_name:'Another display name'});invalidWithoutWrites(session,duplicate);
});
it('rejects malformed, future, wrong-trip, private and ambiguous destination declarations atomically',()=>{
 const {session}=setup();for(const raw of [{...group(),version:2},{...group(),trip_id:'other-trip'},{...group(),contact:'PRIVATE CONTACT'},{...group(),trip_id:'../trip'}, {...group(),rounds:[{...group().rounds[0],rank_limit:4}]},{...group(),rounds:[group().rounds[0],{...group().rounds[0],round_id:'another-destination'}]},{...group(),rounds:[{...group().rounds[1],city_id:undefined}]}])invalidWithoutWrites(session,raw);
 const before=core.encodeTrip(session.doc);expect(()=>session.executeAll(human,[{command:'trip_card_create',input:{kind:'note',title:'Must not land'}},{command:'trip_group_configure',input:{...group(),version:2}}])).toThrow();expect(core.encodeTrip(session.doc)).toEqual(before);
});
it('permits new proposal versions without overwriting previous declarations and keeps city rounds separate',()=>{
 const {session}=setup(),next=group();session.execute(human,'trip_group_configure',next);next.rounds.push({...next.rounds[1]!,proposal_version:2,option_ids:['other-venue']});session.execute(human,'trip_group_configure',next);expect(core.readTripMeta(session.doc).groupPreferences!.rounds).toHaveLength(3);
});
it('returns a detached declaration so callers cannot mutate stored policy outside a command',()=>{
 const {session}=setup(),result=session.execute<core.GroupPreferences>(human,'trip_group_configure',group()),before=core.encodeTrip(session.doc);result.households[0]!.display_name='Changed outside the command';expect(core.encodeTrip(session.doc)).toEqual(before);
});
it('never lets an agent add a household or read the private roster, including through metadata updates',()=>{
 const {session}=setup();session.execute(human,'trip_group_configure',group());const before=core.encodeTrip(session.doc);
 for(const name of ['trip_group_configure','trip_group_read'])expect(()=>session.execute(agent,name,name.endsWith('configure')?group():{})).toThrow(expect.objectContaining({code:'human_only'}));expect(core.encodeTrip(session.doc)).toEqual(before);
 expect(JSON.stringify(session.execute(agent,'trip_read'))).not.toContain('family-a');const update=session.execute(agent,'trip_meta_update',{city:'Bilbao',countryCode:'ES',timeZone:null});expect(JSON.stringify(update)).not.toContain('family-a');
});
it('validates a hashed response, preserves rank/stamp independence and flags unfamiliar sender labels',async()=>{
 const response=await core.createGroupResponse(body());expect(response.response_id).toMatch(/^[a-f0-9]{64}$/);const checked=await core.validateGroupResponse(response,group());expect(checked).toMatchObject({identity:'label_only',sender_context:'unfamiliar',requires_resolution:true,response});
 expect(await core.validateGroupResponse(response,group(),'family-a')).toMatchObject({identity:'label_only',sender_context:'matching_household_label',requires_resolution:false});expect(checked.response.rankings[0]).toEqual({option_id:'market',rank:1});expect(checked.response.stamps.find(s=>s.option_id==='market')!.value).toBe('maybe');expect(checked.response.constraints).toEqual(body().constraints);expect(checked.response.shared_note).toContain('<script>');
 const shuffled={...body(),rankings:[...body().rankings].reverse(),stamps:[...body().stamps].reverse(),constraints:[...body().constraints].reverse()};expect((await core.createGroupResponse(shuffled)).response_id).toBe(response.response_id);
});
it('rejects cross-trip, cross-proposal, wrong-city-round, unknown-household and unknown-option responses',async()=>{
 for(const patch of [{trip_id:'other-trip'},{proposal_version:2},{round_id:'destination'},{household_id:'agent-extra-vote'},{rankings:[{option_id:'other-city-venue',rank:1}]}]){const response=await core.createGroupResponse({...body(),...patch});await expect(core.validateGroupResponse(response,group())).rejects.toThrow();}
});
it('rejects invalid ranks, stamps, revisions, versions, private fields and changed content hashes',async()=>{
 for(const patch of [{rankings:[{option_id:'market',rank:1},{option_id:'museum',rank:1}]},{rankings:[{option_id:'market',rank:2}]},{response_revision:0},{response_revision:1.5},{version:2},{rankings:[{option_id:'market',rank:1},{option_id:'market',rank:2}]},{stamps:[{option_id:'market',value:'purchased'}]},{private_chat:'CANARY'},{constraints:[{...body().constraints[0],sharing:'private'}]},{constraints:[{...body().constraints[0],source_date:'2026-02-30'}]}])await expect(core.createGroupResponse({...body(),...patch})).rejects.toThrow();
 const response=await core.createGroupResponse(body());await expect(core.validateGroupResponse({...response,shared_note:'Tampered'},group())).rejects.toThrow(/hash/i);
 const long=await core.createGroupResponse({...body(),round_id:'destination',rankings:[{option_id:'beach',rank:1},{option_id:'city',rank:2},{option_id:'mountain',rank:3},{option_id:'extra',rank:4}],stamps:[]});await expect(core.validateGroupResponse(long,group())).rejects.toThrow();
});
it('preserves positive response revisions independently of informational clock time',async()=>{
 const a=await core.createGroupResponse({...body(),response_revision:2,responded_at:'2000-01-01T00:00:00Z'}),b=await core.createGroupResponse({...body(),response_revision:1,responded_at:'2099-01-01T00:00:00Z'});expect((await core.validateGroupResponse(a,group())).response.response_revision).toBe(2);expect((await core.validateGroupResponse(b,group())).response.response_revision).toBe(1);
});
it('keeps group data in personal ZIPs and omits it from guide/stay/selected shared copies',async()=>{
 const {doc,session}=setup();session.execute(human,'trip_group_configure',group());
 for(const variant of ['guide','stay','private'] as const){const bytes=await core.exportTripPackage(doc,new Map(),{variant}),files=unzipSync(bytes),readable=JSON.parse(strFromU8(files['trip.json']!)),reopened=await core.importTripPackage(bytes);expect(readable.meta.groupPreferences).toEqual(variant==='private'?group():undefined);expect(core.readTripMeta(reopened.doc).groupPreferences).toEqual(variant==='private'?group():undefined);expect(core.readTripMeta(reopened.doc).boardId).not.toBe('trip-one');}
 const selected=unzipSync(await core.exportTripPackage(doc,new Map(),{variant:'stay',selectedCardIds:new Set()}));expect(strFromU8(selected['trip.json']!)).not.toContain('family-a');
});
it('migrates legacy documents in a preserved copy and rejects future group contracts without touching input',()=>{
 const {doc}=setup();core.tripParts(doc).meta.set('schemaVersion',1);const bytes=core.encodeTrip(doc),original=bytes.slice(),migrated=core.loadTripWithMigration(bytes);expect(migrated.original).toEqual(original);expect(bytes).toEqual(original);expect(core.readTripMeta(migrated.doc).groupPreferences).toBeUndefined();
 const future=core.createTrip({title:'Future',city:'Bangkok',timeZone:null});core.tripParts(future).meta.set('groupPreferences',{...group(),version:2});const bad=core.encodeTrip(future),kept=bad.slice();expect(()=>core.loadTrip(bad)).toThrow();expect(bad).toEqual(kept);
 const existing=core.createTrip({title:'Existing',city:'Bangkok',timeZone:null});const current=core.encodeTrip(existing);expect(core.loadTripWithMigration(current).migrated).toBe(false);expect(core.encodeTrip(existing)).toEqual(current);
});
