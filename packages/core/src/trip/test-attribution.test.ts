import {expect,it} from 'vitest';
import {createTrip,readAllCards,tripParts} from './model.ts';
import {encodeTrip,loadTrip} from './persist.ts';
import {TripSession} from './session.ts';
import {fakeProposal} from './agent-fake.ts';
import {applyProposal,undoProposal} from './proposals.ts';
it('retains the test-adapter creation context after save/reopen and keeps human approval/Undo',()=>{
 const session=new TripSession(createTrip({title:'Attribution fixture',city:'Bilbao',timeZone:null})),human={kind:'human' as const,id:'owner',name:'Owner'},proposal=fakeProposal(session);
 applyProposal(session,human,proposal);const card=readAllCards(session.parts)[0]!;
 expect(card.createdBy).toBe('test-adapter:owner');expect(card.provenance).toBe('agent');
 const reopened=loadTrip(encodeTrip(session.doc));expect(readAllCards(tripParts(reopened))[0]!.createdBy).toBe(card.createdBy);
 expect(undoProposal(session,proposal.id)).toBe(true);expect(readAllCards(session.parts)).toEqual([]);
});
