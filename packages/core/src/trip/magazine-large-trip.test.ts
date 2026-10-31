import {expect,it} from 'vitest';
import {buildMagazine} from './magazine.ts';
import {createTrip,readAllCards} from './model.ts';
import {TripSession} from './session.ts';
import {encodeTrip} from './persist.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'};
const visible=(svg:string)=>svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function dense(){
  let id=0;const s=new TripSession(createTrip({title:'Our four days in London',city:'London',cityId:'london',timeZone:'Europe/London',dates:{start:'2026-11-05',end:'2026-11-08'}}),{newId:()=>`saved-${++id}`});
  const add=(input:Record<string,unknown>)=>s.execute<{id:string}>(owner,'trip_card_create',{scope:'stay',...input});
  add({kind:'note',title:'Source issue',body:'A published three-day itinerary.',source:{id:'fcc-source',kind:'article',provider:'fcc',retrievedAt:'2026-10-31'},provenance:'fcc'});
  add({kind:'brief',title:'Our four-day brief',body:'Time for our family, museums and quiet walks. BRIEF-END.'});
  const stops=Array.from({length:12},(_,i)=>{const title=`Stop ${i+1}: ${'The complete riverside collection and architectural reading room '.repeat(3)}NAME-END-${i}`;return {id:add({kind:'place',title,day:`2026-11-0${5+Math.floor(i/3)}`,body:`A complete note for this visit. VISIT-END-${i}`}).id,title};});
  for(let i=0;i<7;i++)add({kind:'note',title:`Personal section ${i+1}`,body:`## Memory ${i+1}\n\n**Keep these words** and *this detail*.\n\n- A quiet morning\n- A late lunch\n\n${'A complete personal paragraph. '.repeat(25)}SECTION-END-${i}`});
  add({kind:'note',title:'PRIVATE-LARGE-TRIP',body:'PRIVATE-CANARY-2391',scope:'private'});
  return {s,stops};
}
it('paginates every saved route candidate and retains complete long timetable names',()=>{
  const {s,stops}=dense(),before=encodeTrip(s.doc),issue=buildMagazine(s.doc);
  const routes=issue.pages.filter(page=>page.section==='route'),ids=new Set(routes.flatMap(page=>page.sourceCardIds??[]));
  expect([...ids].sort()).toEqual(stops.map(stop=>stop.id).sort());
  const names=routes.filter(page=>page.side!=='left').map(page=>visible(page.svg)).join(' ');
  for(const stop of stops)expect(names).toContain(stop.title);
  expect(encodeTrip(s.doc)).toEqual(before);
});
it('puts the actual brief first, formats reading text and accounts for all selected cards',()=>{
  const {s}=dense(),before=readAllCards(s.parts),issue=buildMagazine(s.doc),text=issue.pages.map(page=>visible(page.svg)).join(' ');
  expect(visible(issue.pages.find(page=>page.section==='feature'&&page.side==='left')!.svg)).toContain('Our four-day brief');
  for(let i=0;i<7;i++)expect(text).toContain(`SECTION-END-${i}`);
  expect(text).not.toContain('**Keep these words**');expect(text).not.toContain('## Memory');
  expect(issue).toHaveProperty('selection.version',1);expect(issue).toHaveProperty('navigation');
  expect(JSON.stringify(issue)).not.toContain('PRIVATE-CANARY');expect(JSON.stringify(issue)).not.toContain('PRIVATE-LARGE-TRIP');
  expect(readAllCards(s.parts)).toEqual(before);
});
it('renders every distinct selected picture without silently dropping excess unclassified images',()=>{
  const {s}=dense(),urls=new Map<string,string>();
  for(let i=0;i<6;i++){const assetId=`photo-${i}`;s.execute(owner,'trip_asset_register',{asset:{id:assetId,hash:String(i+1).repeat(64),mime:'image/png',role:'original',caption:`Photo ${i+1}`,width:1200,height:800,credit:'Test author'}});s.execute(owner,'trip_presentation_create',{assetId,scope:'stay'});urls.set(assetId,'data:image/png;base64,iVBORw0KGgo=');}
  const issue=buildMagazine(s.doc,{assetUrls:urls}),shown=new Set(issue.pages.flatMap(page=>page.assetIds));
  expect([...shown].sort()).toEqual([...urls.keys()].sort());expect(issue.unusedAssetIds).toEqual([]);
});
it('retains two deliberately saved versions of one source when their bytes differ',()=>{
  const {s}=dense(),urls=new Map<string,string>();
  for(let i=0;i<2;i++){const assetId=`version-${i}`;s.execute(owner,'trip_asset_register',{asset:{id:assetId,hash:String(i+1).repeat(64),mime:'image/png',role:'original',width:1200,height:800,caption:`Saved version ${i}`,credit:'Test author',source:{id:'same-drawing',version:`v${i}`,retrievedAt:'2026-11-01'}}});s.execute(owner,'trip_presentation_create',{assetId,scope:'stay'});urls.set(assetId,'data:image/png;base64,iVBORw0KGgo=');}
  expect(new Set(buildMagazine(s.doc,{assetUrls:urls}).pages.flatMap(page=>page.assetIds)).size).toBe(2);
});
it('refuses an oversized reading during pagination, before constructing the whole book',()=>{
  const s=new TripSession(createTrip({title:'Large text',city:'London',timeZone:null}));
  for(let i=0;i<20;i++)s.execute(owner,'trip_card_create',{kind:'note',title:`Note ${i}`,body:'Complete long prose. '.repeat(300),scope:'stay'});
  expect(()=>buildMagazine(s.doc,{limits:{pages:4,svgBytes:4*1024*1024}})).toThrow(/page limit/i);
});
