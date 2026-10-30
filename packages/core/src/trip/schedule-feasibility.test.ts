import {expect,it} from 'vitest';
import * as core from '../index.ts';

import {fact,problem} from './planning-test-fixtures.ts';
const assignment=(option_id='beach',slot_id='one',household_ids=['a','b'])=>({option_id,slot_id,household_ids});

it('accepts an explicitly known feasible slot without writing or inventing facts',()=>{const p=problem(),before=JSON.stringify(p),r=core.checkScheduleFeasibility(p,[assignment()]);expect(r.status).toBe('feasible');expect(r.errors).toEqual([]);expect(r.tentative).toEqual([]);expect(JSON.stringify(p)).toBe(before);});
it('rejects participant overlap, closed windows, inaccessible boats, durations and confirmed budget breaches',()=>{
 for(const mutate of [(p:any)=>p.slots[1]={...p.slots[1],start:'2026-11-01T09:30:00Z',end:'2026-11-01T10:30:00Z'},(p:any)=>p.activities[0].opening=fact([{start:'2026-11-01T12:00:00Z',end:'2026-11-01T14:00:00Z'}]),(p:any)=>p.activities[1].access[1].allowed=fact(false),(p:any)=>p.activities[0].duration_minutes=fact(90),(p:any)=>p.budget=fact(5)]){const p=problem();mutate(p);expect(core.checkScheduleFeasibility(p,[assignment(),assignment('boat','two')]).status).toBe('infeasible');}
});
it('honors rest, travel, availability and immutable fixed bookings',()=>{
 const p=problem();p.travel_minutes=fact(40);p.households[0]!.rest_minutes=fact(30);expect(core.checkScheduleFeasibility(p,[assignment(),assignment('boat','two')]).errors.join(' ')).toMatch(/travel|rest/i);
 const fixed=problem();fixed.commitments=[{id:'booking',kind:'fixed_booking',option_id:'garden',start:'2026-11-01T09:00:00Z',end:'2026-11-01T10:00:00Z',household_ids:['a','b']}];expect(core.checkScheduleFeasibility(fixed,[assignment()]).status).toBe('infeasible');expect(core.checkScheduleFeasibility(fixed,[]).fixed).toEqual(fixed.commitments);
 const unavailable=problem();unavailable.households[0]!.availability=fact([]);expect(core.checkScheduleFeasibility(unavailable,[assignment()]).status).toBe('infeasible');
});
it('keeps unknown, inferred, stale facts and reservation uncertainty tentative with their source',()=>{
 const p=problem();p.activities[0]!.cost=fact(null as any,'unknown');p.activities[0]!.duration_minutes=fact(60,'inferred');p.activities[0]!.opening={...fact(p.activities[0]!.opening.value),valid_until:'2026-10-01T00:00:00Z'} as any;p.activities[0]!.reservation=fact('unknown');
 const r=core.checkScheduleFeasibility(p,[assignment()]);expect(r.status).toBe('tentative');expect(r.tentative.join(' ')).toMatch(/cost.*source|cost.*Explicit/i);expect(r.tentative.join(' ')).toMatch(/reservation/i);expect(r.errors).toEqual([]);
});
it('enforces AND, at-most-one OR, required exactly-one, before and only-if without pruning future dependencies',()=>{
 const p=problem();p.rules=[{kind:'and',option_ids:['beach','boat']}];expect(core.checkScheduleFeasibility(p,[assignment()]).status).toBe('infeasible');expect(core.checkScheduleFeasibility(p,[assignment()],[],true).status).toBe('feasible');
 p.rules=[{kind:'at_most_one',option_ids:['beach','boat']}];expect(core.checkScheduleFeasibility(p,[assignment(),assignment('boat','two')]).status).toBe('infeasible');
 p.rules=[{kind:'exactly_one',option_ids:['beach','boat']}];expect(core.checkScheduleFeasibility(p,[]).status).toBe('infeasible');
 p.rules=[{kind:'before',first:'boat',then:'beach'}];expect(core.checkScheduleFeasibility(p,[assignment(),assignment('boat','two')]).status).toBe('infeasible');
 p.rules=[{kind:'only_if',option_id:'beach',requires:'boat'}];expect(core.checkScheduleFeasibility(p,[assignment()]).status).toBe('infeasible');
});
it('never assumes a denied household attends; split groups need explicit permission, supervision and transport',()=>{
 const p=problem(),denied=[{household_id:'b',option_id:'boat'}];expect(core.checkScheduleFeasibility(p,[assignment('boat')],denied).status).toBe('infeasible');
 expect(core.checkScheduleFeasibility(p,[assignment('boat','one',['a'])],denied).status).toBe('infeasible');p.split_groups=[{option_id:'boat',household_ids:['a'],permission:fact(true),supervision:fact(true),transport:fact(true)}];expect(core.checkScheduleFeasibility(p,[assignment('boat','one',['a'])],denied).status).toBe('feasible');p.split_groups[0].transport=fact(null,'unknown');expect(core.checkScheduleFeasibility(p,[assignment('boat','one',['a'])],denied).status).toBe('infeasible');
});
it('validates dates/IDs, future versions, contradictory commitments and foreign participants',()=>{
 for(const patch of [{version:2},{slots:[{...problem().slots[0],end:'2026-11-01T08:00:00Z'}]},{households:[problem().households[0],problem().households[0]]}])expect(()=>core.checkScheduleFeasibility({...problem(),...patch},[])).toThrow();
 expect(()=>core.checkScheduleFeasibility(problem(),[assignment('unknown')])).toThrow();expect(()=>core.checkScheduleFeasibility(problem(),[assignment('beach','one',['foreign'])])).toThrow();
 const p=problem();p.commitments=['one','two'].map(id=>({id,kind:'meal',start:'2026-11-01T12:00:00Z',end:'2026-11-01T13:00:00Z',household_ids:['a']}));expect(core.checkScheduleFeasibility(p,[]).status).toBe('infeasible');
});
it('adds monetary minor units exactly, joins adjacent opening windows and checks expiry at the activity date',()=>{
 const p=problem();p.activities[0]!.cost=fact(.1);p.activities[1]!.cost=fact(.2);p.budget=fact(.3);expect(core.checkScheduleFeasibility(p,[assignment(),assignment('boat','two')]).status).toBe('feasible');
 p.budget=fact(500);p.activities[0]!.opening=fact([{start:'2026-11-01T08:00:00Z',end:'2026-11-01T09:30:00Z'},{start:'2026-11-01T09:30:00Z',end:'2026-11-01T10:00:00Z'}]);expect(core.checkScheduleFeasibility(p,[assignment()]).status).toBe('feasible');
 p.activities[0]!.opening={...p.activities[0]!.opening,valid_until:'2026-10-31T12:00:00Z'} as any;expect(core.checkScheduleFeasibility(p,[assignment()]).status).toBe('tentative');
});
it('does not approve denied or inaccessible participation just because an activity was already booked',()=>{
 const p=problem();p.commitments=[{id:'booked-boat',kind:'fixed_booking',option_id:'boat',start:p.slots[0]!.start,end:p.slots[0]!.end,household_ids:['a','b']}];expect(core.checkScheduleFeasibility(p,[],[{household_id:'b',option_id:'boat'}]).status).toBe('infeasible');p.activities[1]!.access[1]!.allowed=fact(false);expect(core.checkScheduleFeasibility(p,[]).status).toBe('infeasible');
});
