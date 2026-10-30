import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession,type GroupBallot} from '@writers-board/core';
import {RankBallot,changeRank} from './RankBallot';

const actor={kind:'human' as const,id:'person',name:'Person'};
const ballot:GroupBallot={proposal_version:1,round_id:'venues',household_id:'a',rankings:[{option_id:'beach',rank:1},{option_id:'garden',rank:2}],stamps:[{option_id:'beach',value:'maybe'}],shared_note:'Keep my shared note'};
it('moves and clears numbered ranks without changing stamps or notes; full shortlist never silently drops an option',()=>{
 const moved=changeRank(ballot,'garden',1,3);expect(moved.rankings).toEqual([{option_id:'garden',rank:1},{option_id:'beach',rank:2}]);expect(moved.stamps).toEqual(ballot.stamps);expect(moved.shared_note).toBe(ballot.shared_note);
 expect(changeRank(moved,'garden',0,3).rankings).toEqual([{option_id:'beach',rank:1}]);
 const full=changeRank(ballot,'boat',3,3);expect(()=>changeRank(full,'museum',1,3)).toThrow(/clear/i);expect(ballot.rankings).toHaveLength(2);
});
it.each([3,5] as const)('renders declared K%s scale, household identity and independent stamps before a response',K=>{
 const session=new TripSession(createTrip({title:'City trip',city:'Bangkok',timeZone:null,boardId:'ballot-trip'}));session.execute(actor,'trip_group_configure',{version:1,trip_id:'ballot-trip',households:[{household_id:'a',display_name:'Family A'}],rounds:[{round_id:'venues',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['beach','garden','boat'],rank_limit:K,household_weighting:'one_household_one_vote'}]});
 const html=renderToStaticMarkup(createElement(RankBallot,{session,actor,refresh:()=>{},notify:()=>{},onClose:()=>{}}));
 expect(html).toContain(`Rank points: ${K===3?'3, 2, 1':'5, 4, 3, 2, 1'}`);expect(html).toContain('Family A');expect(html).toContain('No response');expect(html).toContain('Approved');expect(html).toContain('Maybe');expect(html).toContain('Denied');expect(html).toContain('No stamp');expect(html).toContain('Shared note');
});
it('keeps households with the same display name distinguishable in the responding-household selector (Wonder W2 F2)',()=>{
 const session=new TripSession(createTrip({title:'City trip',city:'Bangkok',timeZone:null,boardId:'ballot-trip'}));session.execute(actor,'trip_group_configure',{version:1,trip_id:'ballot-trip',households:[{household_id:'smith-1',display_name:'Smith'},{household_id:'smith-2',display_name:'Smith'},{household_id:'lee',display_name:'Lee'}],rounds:[{round_id:'venues',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['beach'],rank_limit:3,household_weighting:'one_household_one_vote'}]});
 const html=renderToStaticMarkup(createElement(RankBallot,{session,actor,refresh:()=>{},notify:()=>{},onClose:()=>{}}));
 const select=html.match(/<select[^>]*aria-label="Responding household"[^>]*>(.*?)<\/select>/)![1]!,labels=[...select.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map(m=>m[1]);
 expect(labels).toHaveLength(3);expect(new Set(labels).size).toBe(3);expect(labels).toContain('Lee');expect(labels.filter(l=>l!.startsWith('Smith'))).toHaveLength(2);
});
