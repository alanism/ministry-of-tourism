import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession,declareManagedRound,openVotingRound} from '@writers-board/core';
import {ManagedManualPlan} from './ManagedManualPlan';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(open=true){const session=new TripSession(createTrip({boardId:'trip',title:'Holiday',city:'Bangkok',timeZone:'Asia/Bangkok'})),key={round_id:'activities',proposal_version:1};declareManagedRound(session,actor,{version:1,trip_id:'trip',households:[{household_id:'a',display_name:'Family'}],rounds:[{...key,kind:'city_venue',city_id:'bangkok',option_ids:['A'],rank_limit:3,household_weighting:'one_household_one_vote'}]});if(open)openVotingRound(session,actor,key);return{session,actor,round:key,tick:0,refresh:()=>{},whenSaved:async()=>{},notify:()=>{}};}
it('offers explicit manual choices from a provisional result without claiming an automatic winner',()=>{const html=renderToStaticMarkup(createElement(ManagedManualPlan,fixture()));expect(html).toContain('Manual plan');expect(html).toContain('provisional');expect(html).toContain('Save planning facts');expect(html).not.toContain('automatic winner');});
it('makes draft planning unavailable rather than falling through to the legacy planner',()=>{const html=renderToStaticMarkup(createElement(ManagedManualPlan,fixture(false)));expect(html).toContain('latest open activity round');expect(html).not.toContain('Review manual choices');});
