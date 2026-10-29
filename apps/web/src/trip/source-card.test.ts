import {describe,expect,it} from 'vitest';
import {cardEditInput,editedSourceCopy,sourceHref,sourceTextFor} from './source-card';
import {createTrip,readAllCards,TripSession,type TripCard} from '@writers-board/core';
const card={id:'card',title:'Source',provenance:'fcc',body:'Saved excerpt',sourceText:'The original published text.',source:{id:'fcc:city:11',retrievedAt:'2026-10-28'}} as TripCard;
const draft={title:'Source',body:'Do not overwrite the excerpt',travelerNote:'My own words',day:'',time:'',scope:'stay' as const};
describe('source-card editing boundary',()=>{
  it('uses the original snapshot even when a legacy excerpt was edited',()=>{
    expect(sourceTextFor(card)).toBe(card.sourceText);
    expect(sourceTextFor({...card,sourceText:undefined})).toBe(card.body);
    expect(editedSourceCopy(card)).toBe(card.body);expect(editedSourceCopy({...card,body:'The original'})).toBeUndefined();
  });
  it('updates only the traveler note and ordinary card controls for a source card',()=>{
    expect(cardEditInput(card,draft)).toEqual({id:'card',title:'Source',travelerNote:'My own words',day:null,time:null,scope:'stay'});
  });
  it('retains ordinary and Muse body editing without writing source evidence',()=>{
    for(const value of [{...card,source:undefined},{...card,provenance:'agent' as const}]){
      const input=cardEditInput(value,draft);
      expect(input).toHaveProperty('body',draft.body);expect(input).not.toHaveProperty('source');expect(input).not.toHaveProperty('sourceText');
    }
  });
  it('keeps note Undo/Redo independent from the original source and facts',()=>{
    const session=new TripSession(createTrip({title:'Note history',city:'Test',timeZone:null})),actor={kind:'human' as const,id:'owner',name:'Owner'};
    const {id}=session.execute(actor,'trip_card_create',{kind:'note',title:card.title,body:card.body,source:card.source,sourceText:card.sourceText,travelerNote:'Before',provenance:'fcc'}) as {id:string};
    const original=readAllCards(session.parts)[0]!;session.execute(actor,'trip_card_update',cardEditInput(original,draft));
    expect(readAllCards(session.parts)[0]!.travelerNote).toBe(draft.travelerNote);session.undo(actor.id);
    expect(readAllCards(session.parts)[0]!.travelerNote).toBe('Before');session.redo(actor.id);
    const after=readAllCards(session.parts)[0]!;expect(after.id).toBe(id);expect(after.travelerNote).toBe(draft.travelerNote);expect(after.source).toEqual(original.source);expect(after.sourceText).toBe(original.sourceText);expect(after.body).toBe(original.body);
  });
  it('keeps script and credential-bearing source URLs inert',()=>{
    expect(sourceHref('javascript:alert(1)')).toBeUndefined();expect(sourceHref('https://secret@example.org/')).toBeUndefined();expect(sourceHref('https://example.org/story')).toBe('https://example.org/story');
  });
});
