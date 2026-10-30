import {expect,it} from 'vitest';
import * as core from '../index.ts';
import {fact} from './planning-test-fixtures.ts';
const attention=()=>({option_id:'garden',activity_start:'2026-11-15T09:00:00+07:00',deadline:fact('2026-10-30T20:00:00+07:00'),cost:fact(null as number|null,'unknown'),importance:'important',optional_promotion:false});
it('keeps booking deadline separate from activity time, treats timezone offsets as instants and never changes ranking',()=>{
 const a=attention(),before=JSON.stringify(a),r=core.bookingAttention(a,'2026-10-30T12:00:00Z');expect(r.urgency).toBe('urgent');expect(r.important).toBe(true);expect(r.activity_start).toBe(a.activity_start);expect(r.deadline).toBe(a.deadline.value);expect(r.cost_confirmed).toBe(false);expect(JSON.stringify(a)).toBe(before);
 expect(core.bookingAttention({...a,deadline:fact('2026-11-14T20:00:00+07:00')},'2026-10-30T12:00:00Z')).toMatchObject({urgency:'later',important:true});
});
it('shows expiring optional promotions as urgent but optional, with no artificial scarcity or purchase authorization',()=>{
 const r=core.bookingAttention({...attention(),importance:'optional',optional_promotion:true},'2026-10-30T12:00:00Z');expect(r).toMatchObject({urgency:'urgent',important:false,authorization:'attention_only'});expect(r.reason).toMatch(/optional promotion/i);
 const stale={...attention(),deadline:{...attention().deadline,valid_until:'2026-10-01T00:00:00Z'}};expect(core.bookingAttention(stale,'2026-10-30T12:00:00Z').urgency).toBe('unknown');expect(core.bookingAttention({...attention(),deadline:fact(null,'unknown')},'2026-10-30T12:00:00Z').deadline).toBe(null);
 expect(core.bookingAttention(attention(),'2026-10-31T12:00:00Z').urgency).toBe('passed');
});
it('adds an undoable private attention task without scheduling it or changing source/ballot data',()=>{
 const session=new core.TripSession(core.createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'})),person={kind:'human' as const,id:'owner',name:'Owner'};
 const card=session.execute<core.TripCard>(person,'trip_card_create',{kind:'place',title:'Garden',day:'2026-11-15',time:'09:00',scope:'stay'});const original=core.readAllCards(session.parts),meta=core.readTripMeta(session.doc);
 session.execute(person,'trip_booking_attention_add',{attention:{...attention(),option_id:card.id},as_of:'2026-10-30T12:00:00Z'});const tasks=core.readAllCards(session.parts).filter(c=>c.kind==='task');expect(tasks).toHaveLength(1);expect(tasks[0]).toMatchObject({scope:'private',bookingAttention:{activity_start:attention().activity_start}});expect(tasks[0]?.day).toBeUndefined();expect(tasks[0]?.time).toBeUndefined();expect(core.readCard(session.parts,card.id)).toEqual(original[0]);expect(core.readTripMeta(session.doc)).toEqual(meta);session.undo(person.id);expect(core.readAllCards(session.parts)).toEqual(original);
});
it('rejects agents, malformed dates and unknown source options before writes',()=>{
 const session=new core.TripSession(core.createTrip({title:'Trip',city:'Bangkok',timeZone:null})),before=core.encodeTrip(session.doc);
 for(const actor of [{kind:'human' as const,id:'owner',name:'Owner'},{kind:'agent' as const,id:'agent',name:'Agent'}])expect(()=>session.execute(actor,'trip_booking_attention_add',{attention:attention(),as_of:'2026-10-30T12:00:00Z'})).toThrow();expect(core.encodeTrip(session.doc)).toEqual(before);
 expect(()=>core.bookingAttention({...attention(),deadline:fact('2026-02-30T10:00:00Z')},'2026-10-30T12:00:00Z')).toThrow();
});
it('W4-O1: the stored task body makes no time-dependent urgency claim that goes stale after creation',()=>{
 const session=new core.TripSession(core.createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'})),person={kind:'human' as const,id:'owner',name:'Owner'};
 const card=session.execute<core.TripCard>(person,'trip_card_create',{kind:'place',title:'Garden',scope:'stay'});
 session.execute(person,'trip_booking_attention_add',{attention:{...attention(),option_id:card.id},as_of:'2026-10-30T12:00:00Z'});
 const task=core.readAllCards(session.parts).find(c=>c.kind==='task')!;expect(core.bookingAttention(task.bookingAttention,'2026-10-30T12:00:00Z').urgency).toBe('urgent');
 expect(task.body).not.toMatch(/within 24 hours|has passed|is later|can wait/i);expect(task.body).toMatch(/does not book|never books/i);
 expect(core.bookingAttention(task.bookingAttention,'2026-11-02T12:00:00Z').urgency).toBe('passed');
});
