import {createTrip} from './model.ts';
import {TripSession} from './session.ts';
import {DEFAULT_GROUP_POLICY,type PlanningProblem} from './planning-constraints.ts';
export const wp9Person={kind:'human' as const,id:'owner',name:'Owner'};
export function wp9Trip(){
 const session=new TripSession(createTrip({title:'During trip',city:'Bangkok',cityId:'bangkok',countryCode:'TH',timeZone:'Asia/Bangkok',boardId:'trip',dates:{start:'2026-11-01',end:'2026-11-02'},party:'family'})),ids:Record<string,string>={};
 for(const [title,day,time] of [['Museum','2026-11-01','09:00'],['Lunch','2026-11-01','10:30'],['Dinner','2026-11-01','18:00'],['Boat','',''],['Garden','',''],['Other day','2026-11-02','09:00'],['PRIVATE note','2026-11-01','11:00']])ids[title!]=session.execute<{id:string}>(wp9Person,'trip_card_create',{kind:'place',title,body:title?.startsWith('PRIVATE')?'PRIVATE source':'Original source',scope:title?.startsWith('PRIVATE')?'private':'stay',...(day?{day,time}:{})}).id;
 session.execute(wp9Person,'trip_card_update',{id:ids.Dinner,booking:{status:'held'}});
 session.execute(wp9Person,'trip_card_create',{kind:'task',title:'Pack preparation',day:'2026-11-01',time:'08:00'});
 const f=<T,>(value:T)=>({value,status:'confirmed' as const,source:'Explicit fixture source',source_date:'2026-10-30',valid_until:null}),H=['a','b'];
 const configuration={version:1,trip_id:'trip',households:H.map(household_id=>({household_id,display_name:'PRIVATE '+household_id})),rounds:[{proposal_version:1,round_id:'venues',kind:'city_venue',city_id:'bangkok',option_ids:['Museum','Lunch','Dinner','Boat','Garden'].map(n=>ids[n]!),rank_limit:3,household_weighting:'one_household_one_vote'}]};
 session.execute(wp9Person,'trip_group_configure',configuration);
 const planning:PlanningProblem={version:1,trip_id:'trip',proposal_version:1,round_id:'venues',as_of:'2026-10-31T00:00:00Z',currency:'THB',budget:f(1000),travel_minutes:f(15),households:H.map(household_id=>({household_id,attendance:f(true),availability:f([{start:'2026-11-01T00:00:00+07:00',end:'2026-11-02T23:59:00+07:00'}]),rest_minutes:f(15)})),activities:['Museum','Lunch','Dinner','Boat','Garden'].map((n,i)=>({option_id:ids[n]!,duration_minutes:f(i===0?45:i===1?75:60),cost:f(10),opening:f([{start:'2026-11-01T08:00:00+07:00',end:'2026-11-01T22:00:00+07:00'}]),reservation:f('not_required' as const),access:H.map(household_id=>({household_id,allowed:f(n==='Boat'&&household_id==='b'?false:true)}))})),slots:[['Museum','09:00','09:45'],['Lunch','10:30','11:45'],['Dinner','18:00','19:00']].map(([n,start,end])=>({slot_id:n!,start:`2026-11-01T${start}:00+07:00`,end:`2026-11-01T${end}:00+07:00`,household_ids:H})),commitments:[{id:ids.Dinner!,kind:'fixed_booking',option_id:ids.Dinner,start:'2026-11-01T18:00:00+07:00',end:'2026-11-01T19:00:00+07:00',household_ids:H}],rules:[],split_groups:[]};
 session.execute(wp9Person,'trip_group_planning_set',{planning,policy:DEFAULT_GROUP_POLICY});return{session,ids,planning,configuration};
}
