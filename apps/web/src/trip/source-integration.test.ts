import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,readAllCards,TripSession} from '@writers-board/core';
import {CardContent} from './SourceContent';
it('source-card rendering preserves honest Test adapter authorship from the current Muse runtime',()=>{
 const session=new TripSession(createTrip({title:'Attribution QA',city:'San Sebastián',countryCode:'ES',timeZone:null}));
 session.execute({kind:'agent',id:'test-adapter:receipt',name:'Test adapter'},'trip_card_create',{kind:'note',title:'Transport fixture',body:'A labelled test result',stage:'explore',provenance:'agent'});
 const markup=renderToStaticMarkup(createElement(CardContent,{card:readAllCards(session.parts)[0]!}));expect(markup).toContain('Test adapter suggestion');expect(markup).not.toContain('Muse suggestion');session.destroy();
});
it('live Muse cards keep their existing suggestion label exactly once',()=>{
 const session=new TripSession(createTrip({title:'Attribution QA',city:'San Sebastián',countryCode:'ES',timeZone:null}));
 session.execute({kind:'agent',id:'muse:receipt',name:'Muse'},'trip_card_create',{kind:'note',title:'Live-shaped card',body:'A source rendering fixture',stage:'explore',provenance:'agent'});
 const markup=renderToStaticMarkup(createElement(CardContent,{card:readAllCards(session.parts)[0]!}));expect(markup).toContain('Muse suggestion · Not checked');expect(markup).not.toContain('suggestion suggestion');session.destroy();
});
