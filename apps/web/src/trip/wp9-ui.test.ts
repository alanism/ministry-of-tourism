import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import {MemoryChoice} from './Keepsakes';
import {TripGuidance} from './TripGuidance';
it('renders all guidance phases in initial native disclosures with a permanent AI guide link',()=>{const html=renderToStaticMarkup(createElement(TripGuidance,{phase:'during'}));expect(html.match(/<details/g)).toHaveLength(3);for(const text of ['Planning','During trip','Post trip','Guide for your AI'])expect(html).toContain(text);expect(html).toContain('/guides/trip-best-practices.md');});
it('renders memory reactions without planning questions and exposes truthful native backup/check controls',()=>{const session=new TripSession(createTrip({title:'Memories',city:'Bangkok',timeZone:null})),actor={kind:'human' as const,id:'owner',name:'Owner'};session.execute(actor,'trip_card_create',{kind:'note',title:'A meaningful note',body:'Imperfect is fine',scope:'stay'});const html=renderToStaticMarkup(createElement(MemoryChoice,{session,actor,tick:0,saved:'saved',notify:()=>{},refresh:()=>{},whenSaved:async()=>{}}));for(const text of ['A meaningful note','Keep','Maybe','Skip','Download ZIP package','Open memory page'])expect(html).toContain(text);expect(html).not.toContain('itinerary questionnaire');});
