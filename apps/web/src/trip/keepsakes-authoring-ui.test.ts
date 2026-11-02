import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import {Keepsakes} from './Keepsakes';
import {MemoryChoice,MemoryPackageReceipt} from './MemoryChoice';
import type {ExportArtifact} from './artifacts';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(){
 const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}),{newId:(()=>{const ids=['one','two'];return()=>ids.shift()!;})()});
 for(const id of ['one','two']){
  session.execute(actor,'trip_card_create',{kind:'photo',title:id,body:'',stage:'plan',scope:'stay',provenance:'traveler'});
  session.execute(actor,'trip_asset_attach',{cardId:id,asset:{id:'shared',hash:'a'.repeat(64),mime:'image/png',role:'original'}});
 }
 return session;
}
function render(session:TripSession,saved:'saved'|'error'='saved'){return renderToStaticMarkup(createElement(Keepsakes,{session,actor,tick:session.boardRev,saved,notify:()=>{},refresh:()=>{},whenSaved:async()=>{},onExport:()=>{},onBack:()=>{}}));}
it('restores the chosen card and output draft instead of a sample caption',()=>{
 const session=fixture();session.execute(actor,'trip_keepsake_caption',{cardId:'two',format:'memory',caption:'สอง 🛶\nOur own words'});session.execute(actor,'trip_keepsake_select',{cardId:'two',format:'memory'});
 const html=render(session);expect(html).toContain('สอง 🛶\nOur own words');expect(html).toMatch(/checked=""[^>]*\/?>.*Memory page/s);expect(html).not.toContain('Our first evening on the river.');expect(html).toContain('Use one');expect(html).toContain('Use two');session.destroy();
});
it('keeps authored empty distinct from untouched, with an optional suggestion only for untouched',()=>{
 const session=fixture();let html=render(session);expect(html).toContain('Optional suggestion');expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
 session.execute(actor,'trip_keepsake_caption',{cardId:'one',format:'postcard',caption:''});session.execute(actor,'trip_keepsake_select',{cardId:'one',format:'postcard'});html=render(session);expect(html).not.toContain('Optional suggestion');expect(html).toMatch(/<textarea[^>]*><\/textarea>/);session.destroy();
});
it('shows durable photo review and usable recovery for board storage failure without leaking private drafts',()=>{
 const session=fixture();session.execute(actor,'trip_keepsake_caption',{cardId:'one',format:'postcard',caption:'PRIVATE_CANARY'});session.execute(actor,'trip_keepsake_select',{cardId:'one',format:'postcard'});session.execute(actor,'trip_card_update',{id:'one',scope:'private'});
 session.execute(actor,'trip_keepsake_caption',{cardId:'two',format:'postcard',caption:'Public caption'});session.execute(actor,'trip_asset_replace',{cardId:'two',expectedAssetId:'shared',asset:{id:'new',hash:'b'.repeat(64),mime:'image/png',role:'original'}});
 const html=render(session,'error');expect(html).not.toContain('PRIVATE_CANARY');expect(html).not.toContain('Use one');expect(html).toContain('Photo changed; review this caption');expect(html).toContain('Retry saving');expect(html).toContain('personal ZIP backup');session.destroy();
});
it('labels tentative and unreviewed memories and bounds page selection to the displayed shortlist',()=>{
 const session=fixture();session.execute(actor,'trip_memory_react',{cardId:'two',reaction:'maybe'});
 const html=renderToStaticMarkup(createElement(MemoryChoice,{session,actor,tick:session.boardRev,saved:'saved',notify:()=>{},refresh:()=>{},whenSaved:async()=>{}}));
 expect(html).toContain('Tentative');expect(html).toContain('Not reviewed');expect(html).toContain('currently shown');session.destroy();
});
it('keeps downloadable package recovery separate from failed browser retention',()=>{
 const artifact={filename:'Trip.mot.zip',byteCount:42,sha256:'a'.repeat(64),kept:false} as ExportArtifact;
 const html=renderToStaticMarkup(createElement(MemoryPackageReceipt,{artifact}));expect(html).toContain('Download started');expect(html).toContain('Not kept in this browser');expect(html).toContain('Download this package again');expect(html).not.toContain('Downloaded');
});
