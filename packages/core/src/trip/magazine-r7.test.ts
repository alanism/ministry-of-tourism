import {describe,expect,it} from 'vitest';
import {createTrip,readAllCards} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'},png='data:image/png;base64,iVBORw0KGgo=';
function trip(){let n=0;return new TripSession(createTrip({title:'San Sebastián, our way',city:'San Sebastián',cityId:'san-sebastian',timeZone:null}),{newId:()=>`card-${++n}`});}
function art(assetId:string,role:string,label:string){return {assetId,role,label,kind:'original-art',category:'explicit',originCityId:'san-sebastian',width:1600,height:1200,credit:'FCC',rightsStatus:'approved',source:{sourceId:assetId,canonicalUrl:`https://foreignclubberscorespondence.web.app/art/${assetId}.png`}};}
const visible=(svg:string)=>svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const render=(s:TripSession,refs:ReturnType<typeof art>[]=[])=>(buildMagazine(s.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))}));

describe('MOT-89 R7 route, plate and cover',()=>{
 it('shortens diagram labels at a comma or y, gives them paper protection, and retains full timetable names',()=>{
  const s=trip();for(const title of ['Hotel de Londres y de Inglaterra','The Ritz-Carlton, Kyoto','A very long but genuine riverside activity name for the final stop'])s.execute(owner,'trip_card_create',{kind:'place',title,scope:'stay'});
  const issue=render(s),diagram=issue.pages.find(p=>p.section==='route'&&p.side==='left')!.svg,timetable=issue.pages.find(p=>p.section==='route'&&p.side==='right')!.svg;
  const labels=[...diagram.matchAll(/<text[^>]*data-route-label="true"[^>]*>[\s\S]*?<\/text>/g)].map(m=>visible(m[0]));
  expect(labels.slice(0,2)).toEqual(['Hotel de Londres','The Ritz-Carlton']);
  expect(diagram.match(/<text[^>]*data-route-label="true"[^>]*>/g)!.every(tag=>tag.includes('font-size="29.6"'))).toBe(true);
  expect(labels[2]).toMatch(/…$/);
  expect(diagram).toContain('data-route-label-paper="true"');expect(diagram).toContain('paint-order="stroke"');expect(diagram).toContain('stroke="#FAF7F2"');
  expect(visible(timetable)).toContain('Hotel de Londres y de Inglaterra');expect(visible(timetable)).toContain('The Ritz-Carlton, Kyoto');
  expect(readAllCards(s.parts)[0]!.title).toBe('Hotel de Londres y de Inglaterra');
 });
 it('uses the selected restaurant drawing in the sparse plate instead of unrelated trip hotels',()=>{
  const s=trip();for(const title of ['Hotel Maria Cristina','Hotel de Londres y de Inglaterra','Lasala Plaza Hotel','Akelarre Hotel'])s.execute(owner,'trip_card_create',{kind:'place',title,scope:'stay'});
  const issue=render(s,[art('restaurant','facade','La Cuchara De San Telmo')]),plate=issue.pages.find(p=>p.section==='plate'&&p.side==='right')!;
  expect(visible(plate.svg)).toContain('La Cuchara de San Telmo');expect(visible(plate.svg)).toContain('Nº 1');
  expect(visible(plate.svg)).not.toMatch(/Hotel|Lasala|Akelarre|Places in the notebook/);expect(plate.sourceCardIds).toEqual([]);
 });
 it('recomposes a restaurant interior into the upper right tile when the facade leads, with sequential numbers',()=>{
  const issue=render(trip(),[art('restaurant','facade','La Cuchara de San Telmo'),art('inside','interior','Inside La Cuchara')]),right=issue.pages.find(p=>p.section==='plate'&&p.side==='right')!;
  expect(visible(right.svg)).toContain('Nº 2 Inside La Cuchara');expect(visible(right.svg)).not.toContain('Nº 4');
  const box=right.svg.slice(right.svg.indexOf('data-art="inside"')).match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
  expect(Number(box[2])).toBe(220);expect(Number(box[3])).toBe(1018);expect(Number(box[4])).toBeGreaterThan(900);
 });
 it('keeps picture numbering contiguous when a full specimen plate has no facade',()=>{
  const issue=render(trip(),[art('dish','specimen','Dish'),art('drink','specimen','Drink'),art('inside','interior','Restaurant')]),right=issue.pages.find(p=>p.section==='plate'&&p.side==='right')!;
  expect(visible(right.svg)).toContain('Nº 2 Drink');expect(visible(right.svg)).toContain('Nº 3 Restaurant');expect(visible(right.svg)).not.toContain('Nº 4');
 });
 it('uses explicit card/art links for plate provenance and excludes a private linked venue',()=>{
  const s=trip(),refs=[art('restaurant','facade','Actual restaurant')];
  const publicCard=s.execute<{id:string}>(owner,'trip_card_create',{kind:'place',title:'Actual restaurant',assetIds:['restaurant'],scope:'stay'});
  s.execute(owner,'trip_card_create',{kind:'place',title:'PRIVATE RESTAURANT NOTE',assetIds:['restaurant'],scope:'private'});
  s.execute(owner,'trip_card_create',{kind:'place',title:'Unrelated hotel',scope:'stay'});
  const plate=render(s,refs).pages.find(p=>p.section==='plate'&&p.side==='right')!;
  expect(plate.sourceCardIds).toEqual([publicCard.id]);expect(visible(plate.svg)).not.toMatch(/PRIVATE|Unrelated hotel/);
 });
 it('rechecks the reported cover story and long place phrase without altering their stored titles',()=>{
  const s=trip(),story='A convent and an extension tell different parts of the story',place='Hotel de Londres y de Inglaterra';
  s.execute(owner,'trip_card_create',{kind:'note',title:story,body:'Actual source body.',provenance:'fcc',source:{id:'story',kind:'article',retrievedAt:'2026-10-29'},scope:'stay'});
  s.execute(owner,'trip_card_create',{kind:'place',title:place,scope:'stay'});
  const cover=render(s).pages[0]!.svg,lines=[...cover.matchAll(/<g data-reader-block="cover-line">[\s\S]*?<\/g>/g)].map(m=>visible(m[0]));
  expect(lines).toEqual([place]);expect(readAllCards(s.parts).map(c=>c.title)).toEqual([story,place]);
 });
});
