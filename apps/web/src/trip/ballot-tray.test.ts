import {expect,it} from 'vitest';
import {groupBallotSchema,type GroupBallot} from '@mot/core';
import {CONCERN_LABELS,addFavorite,favorites,moveFavorite,numberWord,orderAnnouncement,ordinal,rankPoints,removeFavorite,ruleSentence,setConcern,trayStatus} from './ballot-tray';
const base:GroupBallot={proposal_version:1,round_id:'venues',household_id:'household-a',rankings:[{option_id:'porto',rank:1},{option_id:'lisbon',rank:2}],stamps:[{option_id:'lisbon',value:'approved'},{option_id:'porto',value:'maybe'}],shared_note:'Keep this note'};
const empty:GroupBallot={proposal_version:1,round_id:'venues',household_id:'household-a',rankings:[],stamps:[],shared_note:'Untouched note'};
const full3:GroupBallot={...base,rankings:[{option_id:'porto',rank:1},{option_id:'lisbon',rank:2},{option_id:'seville',rank:3}]};
const full5:GroupBallot={...base,rankings:[{option_id:'porto',rank:1},{option_id:'lisbon',rank:2},{option_id:'seville',rank:3},{option_id:'madrid',rank:4},{option_id:'bilbao',rank:5}]};
const snapshot=(ballot:GroupBallot)=>JSON.parse(JSON.stringify(ballot)) as GroupBallot;
const valid=(ballot:GroupBallot)=>expect(groupBallotSchema.safeParse(ballot).success).toBe(true);
const contiguous=(ballot:GroupBallot)=>expect(ballot.rankings.map(r=>r.rank)).toEqual(ballot.rankings.map((_,i)=>i+1));
it('maps each concern to its exact plain label and stored stamp name',()=>{
 expect(CONCERN_LABELS).toEqual({approved:{plain:'Works for us',stamp:'Approved'},maybe:{plain:'Question or condition',stamp:'Maybe'},denied:{plain:"Doesn't work for us",stamp:'Denied'}});
});
it('provides ordinals, number words and positional points for both scales',()=>{
 expect([1,2,3,4,5].map(ordinal)).toEqual(['1st','2nd','3rd','4th','5th']);
 expect([0,1,2,3,4,5].map(numberWord)).toEqual(['zero','one','two','three','four','five']);
 expect(numberWord(6)).toBe('6');expect(numberWord(-1)).toBe('-1');
 expect([1,2,3].map(rank=>rankPoints(rank,3))).toEqual([3,2,1]);
 expect([1,2,3,4,5].map(rank=>rankPoints(rank,5))).toEqual([5,4,3,2,1]);
});
it('returns favorites in rank order even when stored rankings are not sorted',()=>{
 const shuffled:GroupBallot={...base,rankings:[{option_id:'seville',rank:3},{option_id:'porto',rank:1},{option_id:'lisbon',rank:2}]};
 expect(favorites(shuffled)).toEqual(['porto','lisbon','seville']);expect(favorites(empty)).toEqual([]);
});
it('adds a favorite at the next contiguous rank without mutating or changing stamps or the note',()=>{
 const before=snapshot(base),next=addFavorite(base,'seville',3);
 expect(next).not.toBe(base);expect(next.rankings).toEqual([{option_id:'porto',rank:1},{option_id:'lisbon',rank:2},{option_id:'seville',rank:3}]);
 expect(next.stamps).toEqual(base.stamps);expect(next.shared_note).toBe('Keep this note');expect(base).toEqual(before);valid(next);contiguous(next);
 expect(addFavorite(empty,'porto',5).rankings).toEqual([{option_id:'porto',rank:1}]);
});
it('rejects duplicate favorites and a full tray with the exact messages, never dropping a choice',()=>{
 expect(()=>addFavorite(base,'porto',3)).toThrow(new Error('Already one of your favorites'));
 expect(()=>addFavorite(full3,'madrid',3)).toThrow(new Error('Three favorites picked. Remove one to choose another.'));
 expect(()=>addFavorite(full5,'valencia',5)).toThrow(new Error('Five favorites picked. Remove one to choose another.'));
 expect(favorites(full3)).toEqual(['porto','lisbon','seville']);expect(favorites(full5)).toEqual(['porto','lisbon','seville','madrid','bilbao']);
});
it('moves a favorite by swapping with its neighbour and renumbering contiguously',()=>{
 const before=snapshot(base),later=moveFavorite(base,'porto','later'),earlier=moveFavorite(base,'lisbon','earlier');
 expect(later).not.toBe(base);expect(later.rankings).toEqual([{option_id:'lisbon',rank:1},{option_id:'porto',rank:2}]);
 expect(earlier.rankings).toEqual(later.rankings);expect(later.stamps).toEqual(base.stamps);expect(later.shared_note).toBe(base.shared_note);
 expect(base).toEqual(before);valid(later);contiguous(later);
 const middle=moveFavorite(full5,'seville','later');expect(favorites(middle)).toEqual(['porto','lisbon','madrid','seville','bilbao']);valid(middle);contiguous(middle);
});
it('returns the same object at move edges and throws for a non-favorite',()=>{
 expect(moveFavorite(base,'porto','earlier')).toBe(base);expect(moveFavorite(base,'lisbon','later')).toBe(base);
 expect(()=>moveFavorite(empty,'porto','later')).toThrow(new Error('Not one of your favorites'));
 expect(()=>moveFavorite(base,'seville','earlier')).toThrow(new Error('Not one of your favorites'));
});
it('removes a favorite, renumbers the rest and preserves stamps and the shared note',()=>{
 const before=snapshot(full3),next=removeFavorite(full3,'lisbon');
 expect(next).not.toBe(full3);expect(next.rankings).toEqual([{option_id:'porto',rank:1},{option_id:'seville',rank:2}]);
 expect(next.stamps).toEqual(full3.stamps);expect(next.shared_note).toBe(full3.shared_note);expect(full3).toEqual(before);valid(next);contiguous(next);
 expect(removeFavorite(empty,'porto').rankings).toEqual([]);
});
it('returns the same object when removing a non-favorite',()=>{
 expect(removeFavorite(base,'seville')).toBe(base);expect(removeFavorite(empty,'porto')).toBe(empty);
});
it('sets, replaces and clears concerns, returning stamps sorted by option_id',()=>{
 const start:GroupBallot={...full3,stamps:[{option_id:'seville',value:'approved'}]};const before=snapshot(start);
 const added=setConcern(start,'lisbon','denied');expect(added.stamps).toEqual([{option_id:'lisbon',value:'denied'},{option_id:'seville',value:'approved'}]);
 const replaced=setConcern(added,'lisbon','maybe');expect(replaced.stamps).toEqual([{option_id:'lisbon',value:'maybe'},{option_id:'seville',value:'approved'}]);
 const cleared=setConcern(replaced,'lisbon',null);expect(cleared.stamps).toEqual([{option_id:'seville',value:'approved'}]);
 expect(setConcern(cleared,'porto',null).stamps).toEqual(cleared.stamps);
 for(const ballot of [added,replaced,cleared]){expect(ballot.rankings).toEqual(start.rankings);expect(ballot.shared_note).toBe(start.shared_note);valid(ballot);}
 expect(start).toEqual(before);
});
it('sorts existing stamps when an unrelated concern is set and never mutates the input stamps',()=>{
 const start:GroupBallot={...base,stamps:[{option_id:'seville',value:'approved'},{option_id:'lisbon',value:'maybe'}]};const stampsBefore=snapshot(start).stamps;
 const next=setConcern(start,'porto','approved');
 expect(next.stamps).toEqual([{option_id:'lisbon',value:'maybe'},{option_id:'porto',value:'approved'},{option_id:'seville',value:'approved'}]);
 expect(next.stamps).not.toBe(start.stamps);expect(start.stamps).toEqual(stampsBefore);
});
it('describes every tray state with exact singular, plural and remaining wording for K=3',()=>{
 expect(trayStatus(empty,3)).toBe('No favorites yet. Pick up to three.');
 expect(trayStatus(addFavorite(empty,'porto',3),3)).toBe('One favorite picked. You can stop here or add up to two more.');
 expect(trayStatus(base,3)).toBe('Two favorites picked. You can stop here or add one more.');
 expect(trayStatus(full3,3)).toBe('Three favorites picked. Remove one to choose another.');
});
it('describes every tray state with numberWord wording for K=5',()=>{
 const one=addFavorite(empty,'porto',5),four:GroupBallot={...base,rankings:full5.rankings.slice(0,4)};
 expect(trayStatus(empty,5)).toBe('No favorites yet. Pick up to five.');
 expect(trayStatus(one,5)).toBe('One favorite picked. You can stop here or add up to four more.');
 expect(trayStatus(base,5)).toBe('Two favorites picked. You can stop here or add up to three more.');
 expect(trayStatus(four,5)).toBe('Four favorites picked. You can stop here or add one more.');
 expect(trayStatus(full5,5)).toBe('Five favorites picked. Remove one to choose another.');
});
it('announces the current order using titles in rank order',()=>{
 const titles=(id:string)=>({porto:'Porto',lisbon:'Lisbon',seville:'Seville'}[id]??id);
 expect(orderAnnouncement(full3,titles)).toBe('Porto is now 1st; Lisbon 2nd; Seville 3rd.');
 expect(orderAnnouncement(base,titles)).toBe('Porto is now 1st; Lisbon 2nd.');
 expect(orderAnnouncement(empty,titles)).toBe('No favorites picked.');
});
it('states the exact rule sentence for K=3 and K=5',()=>{
 expect(ruleSentence(3)).toBe('Pick up to three favorites: 1st gets 3 points, then 2 and 1. Your household has one reply.');
 expect(ruleSentence(5)).toBe('Pick up to five favorites: 1st gets 5 points, then 4, 3, 2 and 1. Your household has one reply.');
});
