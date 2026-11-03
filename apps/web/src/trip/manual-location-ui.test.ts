import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {boardProjection,createTrip,TripSession} from '@mot/core';
import {MapView,TripCardView} from './BoardView';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(){const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}));for(const [title,scope,location] of [['Needs pin','stay',undefined],['PRIVATE_PIN_CANARY','private',{lat:4,lng:5,source:'traveler'}],['Known pin','stay',{lat:1,lng:2,source:'traveler'}]] as const)session.execute(actor,'trip_card_create',{kind:'task',title,scope,location});return session;}
it('makes missing coordinates actionable and excludes private pins and missing titles',()=>{
 const session=fixture();session.execute(actor,'trip_card_create',{kind:'place',title:'PRIVATE_MISSING_CANARY',scope:'private'});
 const html=renderToStaticMarkup(createElement(MapView,{session,actor,tick:session.boardRev,refresh:()=>{},notify:()=>{},whenSaved:async()=>{},onBack:()=>{}}));
 expect(html).toContain('Needs a location');expect(html).toContain('Needs pin');expect(html).toContain('Edit location for Needs pin');expect(html).toContain('Known pin');expect(html).not.toContain('PRIVATE_PIN_CANARY');expect(html).not.toContain('PRIVATE_MISSING_CANARY');session.destroy();
});
it('exposes address, map link and manual coordinate pair in the existing expanded editor',()=>{
 const session=fixture(),card=Object.values(boardProjection(session.doc)).flat().find(card=>card.title==='Needs pin')!;
 const html=renderToStaticMarkup(createElement(TripCardView,{session,actor,card,kind:'traveler',refresh:()=>{},notify:()=>{},autoEdit:true,whenSaved:async()=>{}}));
 for(const label of ['Address','Map link','Latitude','Longitude','No lookup'])expect(html).toContain(label);session.destroy();
});
