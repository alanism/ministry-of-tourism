import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMagazine, createTrip, TripSession } from '@writers-board/core';
import { MagazineReading } from './MagazineReading';
import { standaloneMagazineHtml } from './standalone-html';
const person={kind:'human' as const,id:'owner',name:'Owner'};
function issue(){
  const s=new TripSession(createTrip({title:'Inventory UI',city:'Aspen',timeZone:null}));
  s.execute(person,'trip_card_create',{kind:'note',title:'Saved note',body:'Complete text',scope:'stay'});
  s.execute(person,'trip_asset_register',{asset:{id:'photo',mime:'image/png',hash:'a'.repeat(64),role:'original',width:1000,height:1000}});
  for(const crop of [[0,0,1,1],[.1,.1,.8,.8]])s.execute(person,'trip_presentation_create',{assetId:'photo',scope:'stay',crop});
  return buildMagazine(s.doc,{assetUrls:new Map([['photo','data:image/png;base64,iVBORw0KGgo=']])});
}
it('shows inclusion rules and actionable unresolved placements before raw manifest details',()=>{
  const html=renderToStaticMarkup(createElement(MagazineReading,{issue:issue()}));
  expect(html).toContain('Open Composition');
  expect(html).toContain('Memory reactions do not change magazine selection');
  expect(html).toContain('selected cards with complete reading text');
});
it('refuses to report a successful portable HTML when a selected placement is not represented',async()=>{
  await expect(standaloneMagazineHtml(issue())).rejects.toThrow(/Composition.*unresolved|unresolved.*Composition/);
});
