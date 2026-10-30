import {describe,expect,it} from 'vitest';
import * as Y from 'yjs';
import {createTrip,readAllCards} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'},png='data:image/png;base64,iVBORw0KGgo=';
const visible=(svg:string)=>[...svg.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map(match=>match[1]).join(' ');
function trip(){return new TripSession(createTrip({title:'A shared issue',city:'Kyoto',cityId:'kyoto',timeZone:null}),{newId:(()=>{let n=0;return()=>`card-${++n}`;})()});}

describe('WP4 shared reader layout',()=>{
 it('protects each route label with a full paper panel above the connectors and river',()=>{
  const session=trip();
  try{
   for(const title of ['Hotel de Londres y de Inglaterra','Akelarre Hotel','Keep the mornings light','The Ritz-Carlton, Kyoto','An afternoon with no bookings','HOSHINOYA Kyoto'])session.execute(owner,'trip_card_create',{kind:'place',title,scope:'stay'});
   const before=Y.encodeStateAsUpdate(session.doc),issue=buildMagazine(session.doc),svg=issue.pages.find(page=>page.section==='route'&&page.side==='left')!.svg;
   const nodes=[...svg.matchAll(/<g data-route-node="true"[\s\S]*?<\/g>/g)].map(match=>match[0]);expect(nodes).toHaveLength(6);
   for(const node of nodes){
    expect(node).toMatch(/<rect[^>]*data-route-label-knockout="true"[^>]*fill="#FAF7F2"/);
    expect(node.indexOf('data-route-label-knockout')).toBeLessThan(node.indexOf('data-route-label="true"'));
    const panel=node.match(/<rect[^>]*data-route-label-knockout="true"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/)!;
    expect(Number(panel[1])).toBeGreaterThan(350);expect(Number(panel[2])).toBeGreaterThan(29.6);
   }
   expect(svg.indexOf('data-route-line="true"')).toBeLessThan(svg.indexOf('data-route-label-knockout="true"'));
   const label=nodes[4]!.match(/<text[^>]*data-route-label="true"[^>]*>[\s\S]*?<\/text>/)![0];
   const lines=[...label.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match=>match[1]!);
   expect(lines.at(-1)!.length).toBeGreaterThan(5);expect(lines.join(' ')).toBe('An afternoon with no…');
   expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
  }finally{session.destroy();}
 });
 it('keeps cover and apparel credits on paper and aligned with their own text column',()=>{
  const session=trip();
  const source={sourceId:'cover',canonicalUrl:'https://foreignclubberscorespondence.web.app/art/cover.png'};
  const cover={assetId:'cover',role:'backdrop',kind:'original-art',label:'Kyoto',width:1600,height:2400,rightsStatus:'approved',credit:'Foreign Clubbers Correspondence',source};
  const tees=['apparel-brush','apparel-map-color'].map((role,i)=>({assetId:`tee-${i}`,category:'tee',kind:'apparel-mockup',role,originCityId:'kyoto',label:'Kyoto tee',thumbnailUrl:'https://foreignclubberscorespondence.web.app/tee.webp',renditionUrl:'https://foreignclubberscorespondence.web.app/tee.webp',width:1600,height:2400,mimeType:'image/webp',rightsStatus:'unknown',credit:'Foreign Clubbers Correspondence',hash:String(i+1).padStart(64,'0'),source:{provider:'fcc',sourceId:`tee-${i}`,canonicalUrl:'https://foreignclubberscorespondence.web.app/kyoto.html',cityId:'kyoto',kind:'artwork',retrievedAt:'2026-10-30',origin:'artwork'}}));
  try{
   const refs=[cover,...tees],issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(ref=>[ref.assetId,png]))});
   for(const page of issue.pages.filter(page=>['personal-cover','merch','tee-advert'].includes(page.pattern))){
    expect(page.svg.includes('data-credit-block="true"')).toBe(true);expect(page.svg.includes('data-credit-zone="true"')).toBe(true);
    const credit=page.svg.match(/<text[^>]*data-credits="true"[^>]*x="([\d.]+)"/)!;expect(credit).not.toBeNull();
    const expected=82.88+(page.pattern==='merch'?30:page.pattern==='tee-advert'?24:0);expect(Number(credit[1])).toBeCloseTo(expected);
    expect(page.svg.indexOf('data-credit-zone="true"')).toBeLessThan(page.svg.indexOf('data-credits="true"'));
   }
  }finally{session.destroy();}
 });
 it('recovers legacy FCC heading punctuation for every reader section without rewriting the saved cards',()=>{
  const session=trip(),title='A street is somebody\u00e2\u20ac\u2122s home';
  try{
   session.execute(owner,'trip_card_create',{kind:'note',title,body:Array.from({length:120},(_,i)=>`sourceword${i}`).join(' '),provenance:'fcc',source:{id:'article',provider:'fcc',kind:'article',retrievedAt:'2026-10-30'},scope:'stay'});
   const before=Y.encodeStateAsUpdate(session.doc),issue=buildMagazine(session.doc);
   for(const page of issue.pages)expect(visible(page.svg)).not.toContain('\u00e2\u20ac');
   expect(visible(issue.pages.find(page=>page.section==='feature'&&page.side==='right')!.svg)).toContain('A street is somebody’s home');
   expect(readAllCards(session.parts)[0]!.title).toBe(title);expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
  }finally{session.destroy();}
 });
});
