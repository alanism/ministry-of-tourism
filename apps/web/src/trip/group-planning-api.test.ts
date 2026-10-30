import {expect,it} from 'vitest';
import {createTrip,TripSession,encodeTrip,DEFAULT_GROUP_POLICY} from '@writers-board/core';
import {problem} from '../../../../packages/core/src/trip/planning-test-fixtures.ts';
import {createTripApi} from './agentApi';
it('exposes real planning/feasibility/attention tools over supplied data without mutating or reading private context',async()=>{
 const session=new TripSession(createTrip({title:'PRIVATE CONTEXT',city:'Bangkok',timeZone:null})),api=createTripApi(session),planning=problem(),configuration={version:1,trip_id:'trip',households:planning.households.map(h=>({household_id:h.household_id,display_name:h.household_id})),rounds:[{proposal_version:1,round_id:'venues',kind:'city_venue',city_id:'bangkok',option_ids:planning.activities.map(a=>a.option_id),rank_limit:3,household_weighting:'one_household_one_vote'}]},before=encodeTrip(session.doc),input={configuration,planning,policy:DEFAULT_GROUP_POLICY};
 const proposal=await api.planGroup(input);expect(proposal.best?.feasibility.status).toBe('feasible');const feasibility=await api.checkGroupPlan({configuration,planning,assignments:proposal.best?.assignments??[]});expect(feasibility.status).toBe('feasible');expect(JSON.stringify(proposal)).not.toContain('PRIVATE CONTEXT');expect(encodeTrip(session.doc)).toEqual(before);
 expect(api.capabilities().commands.filter(c=>['trip_group_plan','trip_group_feasibility','trip_booking_attention'].includes(c.name)).every(c=>c.annotations.readOnlyHint)).toBe(true);
});
