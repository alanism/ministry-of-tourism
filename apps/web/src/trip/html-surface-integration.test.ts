import {beforeEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,TripSession} from '@writers-board/core';
const {getTripBlob}=vi.hoisted(()=>({getTripBlob:vi.fn(async()=>null)}));
vi.mock('./trip-assets',()=>({getTripBlob}));
import {artifactInventory,prepareHtmlMagazine} from './artifacts';
const owner={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(shared=false){
  const s=new TripSession(createTrip({title:'Our London',city:'London',timeZone:null}));
  s.execute(owner,'trip_asset_register',{asset:{id:'board-image',hash:'a'.repeat(64),mime:'image/png',role:'original',width:1200,height:800}});
  s.execute(owner,'trip_presentation_create',{assetId:'board-image',scope:'stay',surface:'board',rotation:0});
  s.execute(owner,'trip_card_create',{kind:'note',scope:'stay',title:'Our brief',body:'Keep the complete saved plan.',...(shared?{assetIds:['board-image']}:{})});return s;
}
beforeEach(()=>getTripBlob.mockClear());
it('does not collect or charge magazine memory for an image used only on the free board',async()=>{
  const s=fixture(),before=encodeTrip(s.doc),prepared=await prepareHtmlMagazine(s);
  expect(getTripBlob).not.toHaveBeenCalled();expect(prepared.media).toEqual([]);expect(prepared.magazine.selection?.assets).toEqual([]);expect(encodeTrip(s.doc)).toEqual(before);
});
it('keeps native ZIP inventory complete while HTML counts its own selected surface',()=>{
  const s=fixture();expect(artifactInventory(s.doc).assets).toBe(1);expect(artifactInventory(s.doc,'stay','html').assets).toBe(0);expect(artifactInventory(s.doc,'stay','html').placements).toBe(0);
});
it('still requires a board image when a selected magazine card also uses it',async()=>{
  const s=fixture(true);await expect(prepareHtmlMagazine(s)).rejects.toThrow(/selected image.*board-image.*missing|selected image is missing.*board-image/i);expect(getTripBlob).toHaveBeenCalledOnce();
});
