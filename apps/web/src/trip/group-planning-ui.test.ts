import {expect,it} from 'vitest';
import {applyProposal,bookingAttention,createTrip,readAllCards,readCard,TripSession,type TripCard} from '@writers-board/core';
import {addBookingAttention,bookingAttentionFromForm,formatTripInstant,optionStampCounts,roundConflicts,undoGroupPlan,type BookingAttentionDraft} from './group-planning-ui';

const person={kind:'human' as const,id:'owner',name:'Owner'};
const draft=(over:Partial<BookingAttentionDraft>={}):BookingAttentionDraft=>({option:'x',activity:'2026-11-15T09:00',deadline:'2026-10-31T20:00',source:'Garden booking page',date:'2026-10-30',status:'confirmed',costStatus:'unknown',importance:'important',promotion:false,cost:'1200',...over});
function trip(){const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}));const card=session.execute<TripCard>(person,'trip_card_create',{kind:'place',title:'Garden',day:'2026-11-15',time:'09:00',scope:'stay'});return{session,card};}

it('W4-F1: a confirmed deadline does not make a typed cost confirmed; cost certainty is its own choice',()=>{
 const unconfirmed=bookingAttentionFromForm(draft(),'Asia/Bangkok');
 expect(unconfirmed.deadline.status).toBe('confirmed');expect(unconfirmed.cost).toMatchObject({value:1200,status:'unknown'});
 expect(bookingAttention(unconfirmed,'2026-10-31T00:00:00Z').cost_confirmed).toBe(false);
 const confirmed=bookingAttentionFromForm(draft({status:'unknown',costStatus:'confirmed'}),'Asia/Bangkok');
 expect(confirmed.deadline.status).toBe('unknown');expect(confirmed.cost.status).toBe('confirmed');
 expect(bookingAttentionFromForm(draft({cost:'',costStatus:'confirmed'}),'Asia/Bangkok').cost).toMatchObject({value:null,status:'unknown'});
});

it('W4-F6: a failed durable save after adding a task says tab-only and does not invite a duplicate Add',async()=>{
 const{session,card}=trip(),result=await addBookingAttention(session,person,draft({option:card.id}),'Asia/Bangkok',async()=>{throw new Error('This browser could not save the latest change.');},'2026-10-31T00:00:00Z');
 expect(readAllCards(session.parts).filter(c=>c.kind==='task')).toHaveLength(1);
 expect(result).toMatchObject({added:true,saved:false});expect(result.message).toMatch(/this tab only/i);expect(result.message).not.toMatch(/retry/i);expect(result.message).not.toMatch(/saved\./i);
 const ok=await addBookingAttention(session,person,draft({option:card.id}),'Asia/Bangkok',async()=>{},'2026-10-31T00:00:00Z');expect(ok).toMatchObject({added:true,saved:true});
 const bad=await addBookingAttention(session,person,draft({option:'missing'}),'Asia/Bangkok',async()=>{},'2026-10-31T00:00:00Z');expect(bad.added).toBe(false);expect(readAllCards(session.parts).filter(c=>c.kind==='task')).toHaveLength(2);
});

it('W4-F3: Undo group plan reports nothing undone when the undo history has nothing for that proposal',()=>{
 const{session,card}=trip();
 const miss=undoGroupPlan(session,'never-applied');expect(miss.undone).toBe(false);expect(miss.message).not.toMatch(/undone and saved/i);
 applyProposal(session,person,{id:'p1',boardId:session.boardId,token:session.token([card.id]),ops:[{command:'trip_card_update',input:{id:card.id,day:'2026-11-16',time:'10:00'}}],sources:[],reason:'test',author:'test',status:'proposed'},[0]);
 expect(readCard(session.parts,card.id)?.day).toBe('2026-11-16');
 const hit=undoGroupPlan(session,'p1');expect(hit.undone).toBe(true);expect(readCard(session.parts,card.id)?.day).toBe('2026-11-15');
 expect(undoGroupPlan(session,'p1').undone).toBe(false);
});

it('W4-F4: a household with no current reply is not counted as a respondent who left an option unstamped',()=>{
 expect(optionStampCounts({approved:['a'],maybe:[],denied:[]},1,4)).toEqual({approved:1,maybe:0,denied:0,noStamp:0,noReply:3});
 expect(optionStampCounts({approved:[],maybe:['a'],denied:['b']},3,4)).toEqual({approved:0,maybe:1,denied:1,noStamp:1,noReply:1});
});

it('W4-F5: conflicts are scoped to the selected summary round and proposal',()=>{
 const conflicts=[{proposal_version:1,round_id:'venues',household_id:'a'},{proposal_version:1,round_id:'food',household_id:'b'},{proposal_version:2,round_id:'venues',household_id:'c'}];
 expect(roundConflicts(conflicts,{proposal_version:1,round_id:'venues'}).map(c=>c.household_id)).toEqual(['a']);
});

it('W4-O2: Today shows attention instants in the destination clock with its zone, never a bare UTC string',()=>{
 expect(formatTripInstant('2026-11-01T02:00:00.000Z','Asia/Bangkok')).toBe('2026-11-01 09:00 Asia/Bangkok');
 expect(formatTripInstant('2026-11-01T02:00:00.000Z',null)).toBe('2026-11-01T02:00:00.000Z');
 expect(formatTripInstant(null,'Asia/Bangkok')).toBe('unknown');
});
