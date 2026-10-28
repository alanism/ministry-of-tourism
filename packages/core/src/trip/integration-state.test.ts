import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import * as model from './model.ts';
import * as persistence from './persist.ts';
import { TripSession } from './session.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
import { createGuestCopy } from './lineage.ts';
import { todayProjection } from './projections.ts';
import type { Actor } from '../doc/model.ts';

const you: Actor = {kind:'human',id:'traveler',name:'Traveler'};
const agent: Actor = {kind:'agent',id:'agent',name:'Agent'};
const destination = {cityId:'san-sebastian',city:'San Sebastián',countryCode:'ES',timeZone:'Europe/Madrid'};
function make(kind: 'traveler'|'host_guide'='traveler') {
  let i=0;
  return new TripSession(model.createTrip({title:'Trip',city:'bangkok',timeZone:'Asia/Bangkok',kind}), {newId:()=>`test-${++i}`,destinations:[{id:destination.cityId,name:destination.city,countryCode:destination.countryCode,timeZone:destination.timeZone}]} as ConstructorParameters<typeof TripSession>[1]);
}
const presentations = (s:TripSession) => (model as unknown as {readPresentations:(p:typeof s.parts)=>{id:string;boardId:string;crop:number[];rotation:number;locked:boolean;scope:string}[]}).readPresentations(s.parts);
async function art(s:TripSession,scope='guide',rightsStatus='approved') {
  const bytes=strToU8('fictional-art');
  const card=s.execute<{id:string}>(you,'trip_card_create',{kind:'photo',title:'Original artwork',scope});
  const asset={id:'art',hash:await sha256Hex(bytes),mime:'image/webp',role:'original',credit:'FCC artist',rightsStatus};
  s.execute(you,'trip_asset_attach',{cardId:card.id,asset});
  const placed=s.execute<{id:string}>(you,'trip_presentation_create',{assetId:asset.id,cardId:card.id,x:.1,y:.2,width:.5,height:.6,crop:[.1,.2,.7,.6],rotation:20,zIndex:3,locked:true,scope});
  return {bytes,cardId:card.id,presentationId:placed.id};
}

describe('production integration state contracts',()=>{
  it('validates destination geography before changing anything and preserves existing provenance',()=>{
    const s=make();s.execute(you,'trip_card_create',{kind:'note',title:'Bangkok',provenance:'fcc',source:{id:'bangkok:1',retrievedAt:'2026-10-28'}});
    const before=persistence.encodeTrip(s.doc);
    expect(()=>s.execute(you,'trip_meta_update',{...destination,countryCode:'FR'})).toThrow();
    expect(persistence.encodeTrip(s.doc)).toEqual(before);
    const rev=s.boardRev;s.execute(you,'trip_meta_update',destination);
    expect(model.readTripMeta(s.doc)).toMatchObject(destination);expect(s.boardRev).toBeGreaterThan(rev);
    expect(model.readAllCards(s.parts)[0]!.source!.id).toBe('bangkok:1');
    s.execute(you,'trip_meta_update',{city:'Unlisted village',countryCode:'ES',timeZone:null});
    expect(model.readTripMeta(s.doc).timeZone).toBeNull();expect(model.readTripMeta(s.doc).cityId).toBeUndefined();
    expect(todayProjection(s.doc)).toEqual([]);
  });
  it('source text, traveler note and fact evidence remain independent',()=>{
    const s=make();const c=s.execute<{id:string}>(you,'trip_card_create',{kind:'note',title:'Article',sourceText:'Editorial source',travelerNote:'My note',source:{id:'city:article',url:'https://fcc.example/article',retrievedAt:'2026-10-28',provider:'fcc',cityId:'san-sebastian',kind:'article'},currentFacts:[{field:'openingHours',value:'10:00',evidenceUrl:'https://venue.example/hours',observedAt:'2026-10-28'}]});
    s.execute(you,'trip_card_update',{id:c.id,travelerNote:'Edited note'});
    expect(model.readCard(s.parts,c.id)).toMatchObject({sourceText:'Editorial source',travelerNote:'Edited note',currentFacts:[{field:'openingHours',value:'10:00'}]});
    expect(()=>s.execute(you,'trip_card_update',{id:c.id,source:{id:'x',url:'javascript:alert(1)',retrievedAt:'today'}})).toThrow();
  });
  it('rejects impossible calendar dates without changing the trip',()=>{
    const s=make();const before=persistence.encodeTrip(s.doc);
    expect(()=>s.execute(you,'trip_meta_update',{...destination,dates:{start:'2026-02-30',end:'2026-03-04'}})).toThrow();
    expect(persistence.encodeTrip(s.doc)).toEqual(before);
  });
  it('presentation changes use one document and one undo step, with strict geometry',async()=>{
    const s=make();const a=await art(s);const rev=s.boardRev;
    s.execute(you,'trip_presentation_update',{id:a.presentationId,rotation:45,locked:false});
    expect(presentations(s)[0]).toMatchObject({rotation:45,locked:false});expect(s.boardRev).toBeGreaterThan(rev);
    s.undo(you.id);expect(presentations(s)[0]).toMatchObject({rotation:20,locked:true});
    const before=persistence.encodeTrip(s.doc);
    expect(()=>s.execute(you,'trip_presentation_update',{id:a.presentationId,crop:[.8,.8,.8,.8]})).toThrow();
    expect(persistence.encodeTrip(s.doc)).toEqual(before);
  });
  it('direct agent commands cannot read or change private state',()=>{
    const s=make();const card=s.execute<{id:string}>(you,'trip_card_create',{kind:'note',title:'Secret guest name',scope:'private'});
    expect(()=>s.execute(agent,'trip_card_update',{id:card.id,title:'changed'})).toThrow(/private/);
    expect(JSON.stringify(s.execute(agent,'trip_read'))).not.toContain('Secret guest name');
  });
  it('places a text card without media and rejects a placement with no owner or asset',()=>{
    const s=make();const card=s.execute<{id:string}>(you,'trip_card_create',{kind:'note',title:'A text spread',scope:'stay'});
    s.execute(you,'trip_presentation_create',{cardId:card.id,width:.5,height:.4});
    expect(presentations(s)).toHaveLength(1);
    const before=persistence.encodeTrip(s.doc);
    expect(()=>s.execute(you,'trip_presentation_create',{width:.4,height:.3})).toThrow();
    expect(persistence.encodeTrip(s.doc)).toEqual(before);
  });
  it('migrates v1 in a preserved copy and rejects future versions',()=>{
    const s=make();s.parts.meta.set('schemaVersion',1);const original=persistence.encodeTrip(s.doc);
    const migrate=(persistence as unknown as {loadTripWithMigration:(b:Uint8Array)=>{doc:typeof s.doc;original:Uint8Array|null;migrated:boolean}}).loadTripWithMigration;
    const migrated=migrate(original);expect(migrated.migrated).toBe(true);expect(migrated.original).toEqual(original);
    expect(model.readTripMeta(migrated.doc).schemaVersion).toBe(2);expect(persistence.encodeTrip(s.doc)).toEqual(original);
    s.parts.meta.set('schemaVersion',999);expect(()=>persistence.loadTrip(persistence.encodeTrip(s.doc))).toThrow(/Unsupported/);
  });
  it('round-trips art, source, crop, rotation, lock and credits with a new board identity',async()=>{
    const s=make();const a=await art(s);const zip=await exportTripPackage(s.doc,new Map([['art',a.bytes]]),{includePrivate:true});
    const imported=await importTripPackage(zip);const back=new TripSession(imported.doc);
    expect(imported.assets.get('art')).toEqual(a.bytes);expect(presentations(back)[0]).toMatchObject({crop:[.1,.2,.7,.6],rotation:20,locked:true,boardId:back.boardId});
    expect(back.boardId).not.toBe(s.boardId);expect(model.readAsset(back.parts,'art')).toMatchObject({credit:'FCC artist',rightsStatus:'approved'});
  });
  it('filters private decorations but preserves credited restricted art in shared copies',async()=>{
    const s=make('host_guide');const a=await art(s,'private','restricted');
    const guide=s.execute<{id:string}>(you,'trip_card_create',{kind:'note',title:'Public guide',scope:'guide'});
    s.execute(you,'trip_presentation_create',{assetId:'art',cardId:guide.id,width:.5,height:.5,scope:'guide'});
    const zip=await exportTripPackage(s.doc,new Map([['art',a.bytes]]),{variant:'guide'} as Parameters<typeof exportTripPackage>[2]);
    const files=unzipSync(zip);expect(Object.keys(files)).toContain('assets/art');
    expect(strFromU8(files['trip.json']!)).not.toContain('Original artwork');
    const imported=await importTripPackage(zip);expect(presentations(new TripSession(imported.doc))).toHaveLength(1);
    const guest=new TripSession(createGuestCopy(s.doc));expect(presentations(guest)).toHaveLength(1);expect(model.readAsset(guest.parts,'art')).toMatchObject({credit:'FCC artist',rightsStatus:'restricted'});
    s.parts.assets.get('art')!.delete('credit');
    await expect(exportTripPackage(s.doc,new Map([['art',a.bytes]]),{variant:'guide'} as Parameters<typeof exportTripPackage>[2])).rejects.toThrow(/credit/i);
    expect(()=>createGuestCopy(s.doc)).toThrow(/credit/i);
  });
  it('does not silently drop a selected asset when its bytes are missing',async()=>{
    const s=make();await art(s);await expect(exportTripPackage(s.doc)).rejects.toThrow(/missing.*art|art.*missing/i);
  });
  it('rejects unknown readable fields instead of silently losing them',async()=>{
    const s=make();const files=unzipSync(await exportTripPackage(s.doc));const raw=JSON.parse(strFromU8(files['trip.json']!));raw.futureLayout={lost:true};files['trip.json']=strToU8(JSON.stringify(raw));
    await expect(importTripPackage(zipSync(files))).rejects.toThrow(/readable|unknown|schema|unsupported/i);
  });
});
