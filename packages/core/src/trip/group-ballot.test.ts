import {expect,it} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import * as core from '../index.ts';

const person={kind:'human' as const,id:'traveler',name:'Traveler'},agent={kind:'agent' as const,id:'helper',name:'Helper'};
const configuration={version:1,trip_id:'trip-ballot',households:[{household_id:'a',display_name:'Family A'},{household_id:'b',display_name:'Family B'}],rounds:[{round_id:'city',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['beach','boat','garden','museum','market','cooking'],rank_limit:5,household_weighting:'one_household_one_vote'},{round_id:'destination',proposal_version:1,kind:'destination',option_ids:['bangkok','lisbon','porto','rome'],rank_limit:3,household_weighting:'one_household_one_vote'}]};
const ballot=()=>({proposal_version:1,round_id:'city',household_id:'a',rankings:[{option_id:'beach',rank:1},{option_id:'boat',rank:2},{option_id:'garden',rank:3}],stamps:[{option_id:'beach',value:'maybe'},{option_id:'garden',value:'approved'},{option_id:'museum',value:'denied'}],shared_note:'Explicit shared note <script>never run</script>'});
function setup(){const doc=core.createTrip({title:'Ballot trip',city:'Bangkok',timeZone:null,boardId:'trip-ballot'}),session=new core.TripSession(doc);session.execute(person,'trip_group_configure',configuration);return{doc,session};}
const read=(session:core.TripSession)=>session.execute<any[]>(person,'trip_ballot_read',{});
function rejected(session:core.TripSession,raw:unknown,actor:core.Actor=person){const bytes=core.encodeTrip(session.doc),rev=session.boardRev;expect(()=>session.execute(actor,'trip_ballot_update',raw)).toThrow();expect(core.encodeTrip(session.doc)).toEqual(bytes);expect(session.boardRev).toBe(rev);}

it('keeps independent ranks, stamps, household and round attribution through edits',()=>{
 const {session}=setup();session.execute(person,'trip_ballot_update',ballot());session.execute(person,'trip_ballot_update',{...ballot(),household_id:'b',rankings:[],stamps:[]});
 const before=read(session)[0];expect(before).toEqual(ballot());
 session.execute(person,'trip_ballot_update',{...ballot(),rankings:[{option_id:'garden',rank:1},{option_id:'beach',rank:2}]});
 expect(read(session)[0].stamps).toEqual(ballot().stamps);expect(read(session)[0].shared_note).toBe(ballot().shared_note);expect(read(session)[1].household_id).toBe('b');
 session.execute(person,'trip_ballot_update',{...ballot(),round_id:'destination',rankings:[{option_id:'porto',rank:1}],stamps:[]});expect(read(session)).toHaveLength(3);
});
it('distinguishes no response, an empty response and a partial shortlist; supports clear, Undo and Redo',()=>{
 const {session}=setup();expect(read(session)).toEqual([]);session.execute(person,'trip_ballot_update',{...ballot(),rankings:[]});expect(read(session)).toHaveLength(1);
 session.execute(person,'trip_ballot_clear',{proposal_version:1,round_id:'city',household_id:'a'});expect(read(session)).toEqual([]);
 expect(session.undo(person.id)).toBe(true);expect(read(session)[0].rankings).toEqual([]);expect(session.redo(person.id)).toBe(true);expect(read(session)).toEqual([]);
 session.execute(person,'trip_ballot_update',{...ballot(),rankings:[{option_id:'beach',rank:1},{option_id:'garden',rank:2}]});expect(read(session)[0].rankings).toHaveLength(2);
});
it('rejects duplicate or skipped ranks, excessive K3, foreign options/rounds/households and private fields atomically',()=>{
 const {session}=setup();session.execute(person,'trip_ballot_update',ballot());
 for(const patch of [{rankings:[{option_id:'beach',rank:1},{option_id:'boat',rank:1}]},{rankings:[{option_id:'beach',rank:2}]},{rankings:[{option_id:'beach',rank:1},{option_id:'beach',rank:2}]},{rankings:[{option_id:'unknown',rank:1}]},{household_id:'other'},{round_id:'other'},{proposal_version:2},{stamps:[{option_id:'outside',value:'denied'}]},{stamps:[{option_id:'beach',value:'approved'},{option_id:'beach',value:'denied'}]},{private_chat:'SECRET'},{shared_note:'x'.repeat(4001)}])rejected(session,{...ballot(),...patch});
 rejected(session,{...ballot(),round_id:'destination',rankings:['bangkok','lisbon','porto','rome'].map((option_id,i)=>({option_id,rank:i+1})),stamps:[]});
});
it('prevents agents from changing or reading local household responses; detaches returned values',()=>{
 const {session}=setup();session.execute(person,'trip_ballot_update',ballot());const response=read(session);response[0].shared_note='mutated';expect(read(session)[0].shared_note).toBe(ballot().shared_note);
 rejected(session,ballot(),agent);expect(()=>session.execute(agent,'trip_ballot_read',{})).toThrow();expect(()=>session.execute(agent,'trip_ballot_clear',{proposal_version:1,round_id:'city',household_id:'a'})).toThrow();
 expect(JSON.stringify(session.execute(agent,'trip_read',{}))).not.toContain('Explicit shared note');
});
it('preserves source cards and metadata through failed batches and response Undo',()=>{
 const {session}=setup();session.execute(person,'trip_card_create',{kind:'place',title:'Original source',body:'Keep this snapshot',stage:'plan',scope:'private'});const cards=core.readAllCards(session.parts);
 const before=core.encodeTrip(session.doc);expect(()=>session.executeAll(person,[{command:'trip_ballot_update',input:ballot()},{command:'trip_ballot_update',input:{...ballot(),household_id:'unknown'}}])).toThrow();expect(core.encodeTrip(session.doc)).toEqual(before);
 session.execute(person,'trip_ballot_update',ballot());session.undo(person.id);expect(core.readAllCards(session.parts)).toEqual(cards);expect(read(session)).toEqual([]);
});
it('persists valid local responses and rejects malformed persisted round references before opening',()=>{
 const {doc,session}=setup();session.execute(person,'trip_ballot_update',ballot());const reopened=core.loadTrip(core.encodeTrip(doc));expect(core.readTripMeta(reopened).groupBallots).toEqual([ballot()]);
 core.tripParts(doc).meta.set('groupBallots',[{...ballot(),round_id:'foreign'}]);const invalid=core.encodeTrip(doc),kept=invalid.slice();expect(()=>core.loadTrip(invalid)).toThrow();expect(invalid).toEqual(kept);
});
it('refuses clearing undeclared responses without a metadata or revision write',()=>{
 const {doc,session}=setup();const before=core.encodeTrip(doc),rev=session.boardRev;
 expect(()=>session.execute(person,'trip_ballot_clear',{proposal_version:1,round_id:'other',household_id:'a'})).toThrow();expect(core.encodeTrip(doc)).toEqual(before);expect(session.boardRev).toBe(rev);
});
it('keeps responses in personal ZIPs only, including the encoded document; guest copies omit them',async()=>{
 const {doc,session}=setup();session.execute(person,'trip_ballot_update',ballot());
 for(const variant of ['private','stay','guide'] as const){const bytes=await core.exportTripPackage(doc,new Map(),{variant}),files=unzipSync(bytes),json=JSON.parse(strFromU8(files['trip.json']!)),imported=await core.importTripPackage(bytes);expect(json.meta.groupBallots).toEqual(variant==='private'?[ballot()]:undefined);expect(core.readTripMeta(imported.doc).groupBallots).toEqual(variant==='private'?[ballot()]:undefined);}
 expect(core.readTripMeta(core.createGuestCopy(doc,{title:'Guest',cardIds:new Set()})).groupBallots).toBeUndefined();
});
