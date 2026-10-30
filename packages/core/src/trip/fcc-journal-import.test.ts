import {describe,expect,it} from 'vitest';
import {createTrip,readAllCards,readPresentations,readTripMeta} from './model.ts';
import {TripSession} from './session.ts';
import {encodeTrip} from './persist.ts';
import {exportFccJournal,importFccJournal} from './fcc-journal.ts';
import {exportTripPackage,sha256Hex} from './package.ts';

const actor={kind:'human' as const,id:'qa',name:'QA'},options={party:['Fictional traveler'],created:'2026-10-30T00:00:00Z'};
async function fixture(){
  const doc=createTrip({title:'Round trip',city:'San Sebastián',cityId:'san-sebastian',timeZone:null,dates:{start:'2026-11-13',end:'2026-11-14'}}),session=new TripSession(doc);
  const {id}=session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Publisher title',body:'Saved excerpt',sourceText:'Original publisher snapshot',travelerNote:'Original traveler note',day:'2026-11-13',provenance:'fcc',source:{id:'source',url:'https://example.org/original',retrievedAt:'2026-10-29'},currentFacts:[{field:'Hours',value:'Ten',observedAt:'2026-10-29',evidenceUrl:'https://example.org/hours'}]});
  session.execute(actor,'trip_card_create',{kind:'note',title:'Private sentinel',body:'PRIVATE_SENTINEL',scope:'private',day:'2026-11-13'});
  const result=await exportFccJournal(doc,new Map(),options);return{doc,session,id,...result};
}
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
describe('FCC edits return as traveler annotations with the original scoped ZIP',()=>{
  it('round-trips unchanged cards exactly, with a fresh board and no writes to the source',async()=>{
    const f=await fixture(),before=encodeTrip(f.doc),copy=await importFccJournal(bytes(f.fcc),f.originalPackage);
    expect(readAllCards(new TripSession(copy.doc).parts)).toEqual(readAllCards(f.session.parts).filter(c=>c.scope!=='private'));
    expect(readTripMeta(copy.doc).boardId).not.toBe(readTripMeta(f.doc).boardId);expect(encodeTrip(f.doc)).toEqual(before);
    expect(copy.originalFcc).toEqual(bytes(f.fcc));copy.doc.destroy();f.session.destroy();f.doc.destroy();
  });
  it('keeps source/title/body/facts immutable when FCC text is replaced, appending the whole edit as an annotation',async()=>{
    const f=await fixture(),original=readAllCards(f.session.parts).find(c=>c.id===f.id)!;
    f.fcc.nb.days[0]!.items[0]!.text='Source snapshot: forged replacement\n\nMy actual FCC edit';
    const copy=await importFccJournal(bytes(f.fcc),f.originalPackage),card=readAllCards(new TripSession(copy.doc).parts)[0]!;
    expect(card).toMatchObject({id:f.id,title:original.title,body:original.body,source:original.source,sourceText:original.sourceText,currentFacts:original.currentFacts,provenance:'fcc'});
    expect(card.travelerNote).toContain('Original traveler note');expect(card.travelerNote).toContain('FCC Journal edit (2026-11-13)');expect(card.travelerNote).toContain('forged replacement');
    expect(JSON.stringify(readAllCards(new TripSession(copy.doc).parts))).not.toContain('PRIVATE_SENTINEL');copy.doc.destroy();f.session.destroy();f.doc.destroy();
  });
  it('imports new FCC notes and reports deleted originals without deleting native cards',async()=>{
    const f=await fixture();f.fcc.nb.days[0]!.items=[{...f.fcc.nb.days[0]!.items[0]!,id:'n-99',text:'New words from FCC'}];f.fcc.nb.seq=99;
    const copy=await importFccJournal(bytes(f.fcc),f.originalPackage),cards=readAllCards(new TripSession(copy.doc).parts);
    expect(cards.find(c=>c.id===f.id)?.sourceText).toBe('Original publisher snapshot');expect(cards.find(c=>c.id!==f.id)).toMatchObject({provenance:'traveler',scope:'stay',day:'2026-11-13',travelerNote:'New words from FCC'});
    expect(copy.unsupported.some(x=>x.path.includes('n-1')&&/deleted|missing/i.test(x.reason))).toBe(true);copy.doc.destroy();f.session.destroy();f.doc.destroy();
  });
  it('sets the FCC item sequence above existing notes so FCC can add notes without collisions',async()=>{const f=await fixture();expect(f.fcc.nb.seq).toBe(1);expect(f.fcc.nb.proto).toBe('city');expect(f.fcc.nb.places).toEqual([]);expect(f.fcc.nb.trip.motSource.packageSha256).toBe(await sha256Hex(f.originalPackage));f.session.destroy();f.doc.destroy();});
  it('rejects an original ZIP outside the exported 30-day calendar bound',async()=>{const f=await fixture(),doc=createTrip({title:'Overlong',city:'San Sebastián',cityId:'san-sebastian',timeZone:null,dates:{start:'2026-11-01',end:'2026-12-01'}}),zip=await exportTripPackage(doc);f.fcc.nb.trip.motSource.packageSha256=await sha256Hex(zip);await expect(importFccJournal(bytes(f.fcc),zip)).rejects.toThrow(/calendar|range/i);doc.destroy();f.session.destroy();f.doc.destroy();});
  it('round-trips a large unchanged source snapshot and checked facts without treating them as a new annotation',async()=>{const f=await fixture();f.session.execute(actor,'trip_card_update',{id:f.id,sourceText:'s'.repeat(100000),currentFacts:Array.from({length:100},(_,i)=>({field:`Fact ${i}`,value:'v'.repeat(2000),observedAt:'2026-10-29',evidenceUrl:'https://example.org/fact'}))});const out=await exportFccJournal(f.doc,new Map(),options);expect(out.fcc.nb.days[0]!.items[0]!.text.length).toBeGreaterThan(200000);const copy=await importFccJournal(bytes(out.fcc),out.originalPackage);expect(readAllCards(new TripSession(copy.doc).parts).find(c=>c.id===f.id)).toEqual(readAllCards(f.session.parts).find(c=>c.id===f.id));copy.doc.destroy();f.session.destroy();f.doc.destroy();});
  it.each(['city','schema','format','package','duplicate','date','huge-note','bad-json'])('rejects %s before returning an imported document',async(kind)=>{
    const f=await fixture(),v:any=structuredClone(f.fcc);let raw:Uint8Array;
    if(kind==='city')v.nb.city='lisbon';if(kind==='schema')v.nb.schema='future';if(kind==='format')v.format='future';if(kind==='package')v.nb.trip.motSource.packageSha256='0'.repeat(64);
    if(kind==='duplicate')v.nb.days[0].items.push({...v.nb.days[0].items[0]});if(kind==='date')v.nb.days[0].date='2026-02-30';if(kind==='huge-note')v.nb.days[0].items[0].text='x'.repeat(20001);
    raw=kind==='bad-json'?new TextEncoder().encode('{'):bytes(v);await expect(importFccJournal(raw,f.originalPackage)).rejects.toThrow();f.session.destroy();f.doc.destroy();
  });
  it('retains native art bytes and placement while reporting unsupported FCC ink/media with the original FCC bytes',async()=>{
    const f=await fixture(),art=new TextEncoder().encode('fictional-art');f.session.execute(actor,'trip_asset_register',{asset:{id:'art',hash:await sha256Hex(art),mime:'image/webp',role:'original',rightsStatus:'approved'}});f.session.execute(actor,'trip_presentation_create',{cardId:f.id,assetId:'art',x:.2,y:.3,width:.4,height:.5,rotation:12});
    const out=await exportFccJournal(f.doc,new Map([['art',art]]),options),v:any=out.fcc;v.nb.seq=99;v.nb.days[0].items.push({...v.nb.days[0].items[0],id:'k-99',type:'ink',text:'handwriting'});v.media.extra='data:image/png;base64,AA==';
    const raw=bytes(v),copy=await importFccJournal(raw,out.originalPackage);expect(copy.assets.get('art')).toEqual(art);expect(readPresentations(new TripSession(copy.doc).parts)[0]).toMatchObject({x:.2,y:.3,width:.4,height:.5,rotation:12});expect(copy.unsupported.some(x=>x.path.includes('k-99'))).toBe(true);expect(copy.unsupported.some(x=>x.path==='media')).toBe(true);expect(copy.originalFcc).toEqual(raw);copy.doc.destroy();f.session.destroy();f.doc.destroy();
  });
});
