import {expect,it} from 'vitest';
import {createTrip,readMagazineApparel} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';
import {encodeTrip} from './persist.ts';
const owner={kind:'human' as const,id:'owner',name:'Owner'};
it('preserves explicitly saved magazine apparel when the same asset also appears on the free board',()=>{
  const s=new TripSession(createTrip({title:'Our London',city:'London',cityId:'london',timeZone:null})),origin='https://foreignclubberscorespondence.web.app';
  const apparel={assetId:'saved-tee',kind:'apparel-mockup',category:'tee',originCityId:'london',thumbnailUrl:origin+'/assets/tee.png',renditionUrl:origin+'/assets/tee.png',width:800,height:1000,mimeType:'image/png',hash:'a'.repeat(64),rightsStatus:'approved',credit:'Actual FCC credit',source:{provider:'fcc',sourceId:'saved-tee',canonicalUrl:origin+'/london.html',cityId:'london',kind:'artwork',retrievedAt:'2026-11-01',origin:'artwork'}};
  s.execute(owner,'trip_magazine_tee_select',{assetId:'saved-tee',assets:[{id:'saved-tee',hash:'a'.repeat(64),mime:'image/png',role:'original',credit:'Actual FCC credit',rightsStatus:'approved',apparel}]});
  s.execute(owner,'trip_presentation_create',{assetId:'saved-tee',scope:'stay',surface:'board',rotation:0});
  const before=encodeTrip(s.doc),issue=buildMagazine(s.doc,{assetUrls:new Map([['saved-tee','data:image/png;base64,iVBORw0KGgo=']]),artwork:readMagazineApparel(s.parts).map(asset=>asset.apparel!)});
  expect(issue.pages.flatMap(page=>page.assetIds)).toContain('saved-tee');expect(issue.selection?.assets.find(asset=>asset.id==='saved-tee')?.pageIds.length).toBeGreaterThan(0);expect(encodeTrip(s.doc)).toEqual(before);
});
