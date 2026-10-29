import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createTrip,readAllCards,readTripMeta} from './model.ts';
import {encodeTrip} from './persist.ts';
import {TripSession} from './session.ts';
import type {DestinationRecord} from './schema.ts';

const destinations=JSON.parse(readFileSync(new URL('../../../../apps/web/public/fcc/destinations.json',import.meta.url),'utf8')).cities as DestinationRecord[];
const actor={kind:'human' as const,id:'destination-qa',name:'QA'};
const details=(city:DestinationRecord)=>({city:city.name,cityId:city.id,countryCode:city.countryCode,timeZone:city.timeZone});
function board(){
 const session=new TripSession(createTrip({title:'My trip',city:'Bangkok',cityId:'bangkok',countryCode:'TH',timeZone:'Asia/Bangkok'}),{destinations});
 for(let i=0;i<7;i++)session.execute(actor,'trip_card_create',{kind:'place',title:'Saved Bangkok place '+i,source:{id:'bangkok:'+i,provider:'fcc',cityId:'bangkok',countryCode:'TH',url:'https://foreignclubberscorespondence.web.app/bangkok.html',kind:'venue',retrievedAt:'2026-10-29'},provenance:'fcc'});
 return session;
}
describe('MOT-76 real registry and command boundary',()=>{
 it('binds all 200 published identities and rejects country/name/zone mismatches without writes',()=>{
  expect(destinations).toHaveLength(200);const session=board(),destination=details(destinations.find(city=>city.id==='san-sebastian')!);
  for(const patch of [{countryCode:'FR'},{timeZone:'Asia/Bangkok'},{city:'An unrelated city'}]){
   const before=encodeTrip(session.doc);expect(()=>session.execute(actor,'trip_meta_update',{...destination,...patch})).toThrow();expect(encodeTrip(session.doc)).toEqual(before);
  }
  session.execute(actor,'trip_meta_update',destination);expect(readTripMeta(session.doc)).toMatchObject(destination);
 });
 it('changes Bangkok to unlisted Bilbao without changing any of seven cards or provenance, and undoes once',()=>{
  const session=board(),before=readAllCards(session.parts);
  session.execute(actor,'trip_meta_update',{city:'Bilbao',countryCode:'ES',timeZone:null,dates:{start:'2026-11-01',end:'2026-11-07'}});
  expect(readAllCards(session.parts)).toEqual(before);expect(readTripMeta(session.doc)).toMatchObject({city:'Bilbao',countryCode:'ES',timeZone:null});expect(readTripMeta(session.doc).cityId).toBeUndefined();
  session.undo(actor.id);expect(readTripMeta(session.doc).city).toBe('Bangkok');expect(readAllCards(session.parts)).toEqual(before);
 });
 it('rejects invented country codes at the same metadata boundary',()=>{
  const session=board();for(const patch of [{countryCode:'ZZ'},{countryCode:'UK'}]){
   const before=encodeTrip(session.doc);expect(()=>session.execute(actor,'trip_meta_update',{city:'Unlisted city',timeZone:null,...patch})).toThrow();expect(encodeTrip(session.doc)).toEqual(before);
  }
 });
 it('rejects blank city names before changing the document',()=>{
  const session=board(),before=encodeTrip(session.doc);expect(()=>session.execute(actor,'trip_meta_update',{city:'   ',countryCode:'ES',timeZone:null})).toThrow();expect(encodeTrip(session.doc)).toEqual(before);
 });
 it('rejects invalid local dates and time zones before metadata changes',()=>{
  const session=board();for(const patch of [{timeZone:'Unknown/Zone'},{dates:{start:'2026-02-30',end:'2026-03-01'}},{dates:{start:'2026-11-07',end:'2026-11-01'}}]){
   const before=encodeTrip(session.doc);expect(()=>session.execute(actor,'trip_meta_update',{city:'Bilbao',countryCode:'ES',timeZone:null,...patch})).toThrow();expect(encodeTrip(session.doc)).toEqual(before);
  }
 });
});
