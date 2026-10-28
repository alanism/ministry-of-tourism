import {describe,expect,it} from 'vitest';
import {createTrip,readAsset,readTripMeta} from './model.ts';
import {TripSession} from './session.ts';
import {encodeTrip,loadTrip} from './persist.ts';
import {exportTripPackage,sha256Hex} from './package.ts';
import {importTripPackage} from './import.ts';

const human={kind:'human' as const,id:'owner',name:'Owner'};
const origin='https://foreignclubberscorespondence.web.app';
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,69,78,68,174,66,96,130]);
async function asset(id='tee'){
  const hash=await sha256Hex(bytes);
  const apparel={assetId:id,kind:'apparel-mockup' as const,category:'tee',originCityId:'bilbao',
    thumbnailUrl:origin+'/assets/tee.png',renditionUrl:origin+'/assets/tee.png',width:800,height:1000,
    mimeType:'image/png' as const,hash,rightsStatus:'unknown' as const,credit:'Actual FCC credit',
    source:{provider:'fcc' as const,sourceId:id,canonicalUrl:origin+'/bilbao.html',cityId:'bilbao',kind:'artwork' as const,retrievedAt:'2026-10-28',origin:'artwork' as const}};
  return{id,hash,mime:'image/png',role:'original' as const,credit:apparel.credit,rightsStatus:apparel.rightsStatus,apparel};
}
const session=()=>new TripSession(createTrip({title:'Trip',city:'Bilbao',cityId:'bilbao',countryCode:'ES',timeZone:null}));

describe('persisted magazine tee preference',()=>{
  it('registers explicit cached apparel and changes preference in one revision, surviving ZIP reopen',async()=>{
    const s=session(),a=await asset();
    s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:a.id,assets:[a]}}]);
    expect(s.boardRev).toBe(1);expect(readTripMeta(s.doc).magazine).toEqual({wornTeeAssetId:'tee',apparelAssetIds:['tee']});
    expect(s.parts.cards.size).toBe(0);expect(s.parts.presentations.size).toBe(0);
    const reopened=loadTrip(encodeTrip(s.doc));expect(readTripMeta(reopened).magazine?.wornTeeAssetId).toBe('tee');reopened.destroy();
    const result=await importTripPackage(await exportTripPackage(s.doc,new Map([['tee',bytes]]),{includePrivate:false}));
    expect(readTripMeta(result.doc).magazine?.wornTeeAssetId).toBe('tee');
    expect(result.assets.get('tee')).toEqual(bytes);
    expect(readAsset(new TripSession(result.doc).parts,'tee')?.apparel).toMatchObject({kind:'apparel-mockup',source:{sourceId:'tee'},credit:'Actual FCC credit'});
    result.doc.destroy();s.doc.destroy();
  });
  it('rejects invalid declared classification, source, hash and conflicting immutable IDs without edits',async()=>{
    for(const change of [{apparel:{kind:'map'}},{apparel:{renditionUrl:'https://evil.example/tee.png'}},{apparel:{hash:'b'.repeat(64)}},{apparel:{originCityId:'paris'}},{credit:''}]){
      const s=session(),a=await asset(),altered={...a,...change,apparel:{...a.apparel,...change.apparel}};
      const before=encodeTrip(s.doc);
      expect(()=>s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:a.id,assets:[altered]}}])).toThrow();
      expect(encodeTrip(s.doc)).toEqual(before);s.doc.destroy();
    }
    const s=session(),a=await asset();s.execute(human,'trip_asset_register',{asset:{...a,apparel:undefined}});const before=encodeTrip(s.doc);
    expect(()=>s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:a.id,assets:[a]}}])).toThrow(/immutable/i);
    expect(encodeTrip(s.doc)).toEqual(before);
  });
  it('is human-only and never copies a private-owned cached shirt into a shared ZIP',async()=>{
    const s=session(),a=await asset();
    expect(()=>s.execute({kind:'agent',id:'bot',name:'Bot'},'trip_magazine_tee_select',{assetId:a.id,assets:[a]})).toThrow();
    s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:a.id,assets:[a]}}]);
    s.execute(human,'trip_card_create',{kind:'photo',scope:'private',assetIds:[a.id]});
    const result=await importTripPackage(await exportTripPackage(s.doc,new Map(),{includePrivate:false}));
    expect(result.assets.size).toBe(0);expect(readTripMeta(result.doc).magazine).toBeUndefined();result.doc.destroy();
    const before=encodeTrip(s.doc);
    expect(()=>s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:a.id,assets:[a]}}])).toThrow(/private/i);
    expect(encodeTrip(s.doc)).toEqual(before);
  });
  it('does not leave unreferenced cached catalog choices in a shared package after hiding the chosen tee',async()=>{
    const s=session(),assets=await Promise.all(['brush','mono','color'].map(id=>asset(id)));
    s.executeAll(human,[{command:'trip_magazine_tee_select',input:{assetId:'mono',assets}}]);
    s.execute(human,'trip_card_create',{kind:'photo',scope:'private',assetIds:['mono']});
    const result=await importTripPackage(await exportTripPackage(s.doc,new Map(assets.map(a=>[a.id,bytes])),{includePrivate:false}));
    expect(result.assets.size).toBe(0);expect(readTripMeta(result.doc).magazine).toBeUndefined();
  });
});
