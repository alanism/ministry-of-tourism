import {expect,it} from 'vitest';
import {createTrip,TripSession,encodeTrip,createGroupResponse,mergeResponseLedger} from '@writers-board/core';
import {createTripApi} from './agentApi';

it('exposes the same read-only tally as a board tool over supplied response data without reading private local ballots',async()=>{
 const session=new TripSession(createTrip({title:'Canonical trip',city:'Bangkok',timeZone:null,boardId:'canonical'})),person={kind:'human' as const,id:'person',name:'Person'};
 session.execute(person,'trip_card_create',{kind:'note',title:'PRIVATE CANARY',body:'Secret source',scope:'private'});
 session.execute(person,'trip_group_configure',{version:1,trip_id:'canonical',households:[{household_id:'private',display_name:'Private household'}],rounds:[{proposal_version:1,round_id:'private-round',kind:'destination',option_ids:['private-option'],rank_limit:3,household_weighting:'one_household_one_vote'}]});
 session.execute(person,'trip_ballot_update',{proposal_version:1,round_id:'private-round',household_id:'private',rankings:[{option_id:'private-option',rank:1}],stamps:[],shared_note:'Private local response canary'});
 const configuration={version:1,trip_id:'supplied-group',households:[{household_id:'h1',display_name:'One household'}],rounds:[{proposal_version:1,round_id:'venue',kind:'destination',option_ids:['beach','boat','garden'],rank_limit:3,household_weighting:'one_household_one_vote'}]},round={proposal_version:1,round_id:'venue'};
 const response=await createGroupResponse({version:1,trip_id:'supplied-group',...round,household_id:'h1',response_revision:1,rankings:[{option_id:'beach',rank:1}],stamps:[{option_id:'beach',value:'maybe'}],shared_note:'Shared only',constraints:[],responded_at:'2026-10-30T10:00:00Z'}),ledger=(await mergeResponseLedger(configuration,undefined,[response],{resolvedHouseholds:['h1']})).ledger;
 const before=encodeTrip(session.doc),revision=session.boardRev,api=createTripApi(session),input={configuration,ledger,round};
 const a=await api.tallyPreferences(input),b=await api.call('trip_preference_tally',input);expect(a).toEqual(b);expect(a.total_points).toBe(3);expect(a.trip_id).toBe('supplied-group');expect(JSON.stringify(a)).not.toMatch(/PRIVATE CANARY|Secret source|canonical|Private local response|private-option|Private household/);expect(api.capabilities().commands.find(c=>c.name==='trip_preference_tally')?.annotations.readOnlyHint).toBe(true);expect(encodeTrip(session.doc)).toEqual(before);expect(session.boardRev).toBe(revision);
 await expect(api.tallyPreferences({...input,ledger:{...ledger,version:2}})).rejects.toThrow();expect(encodeTrip(session.doc)).toEqual(before);
});
