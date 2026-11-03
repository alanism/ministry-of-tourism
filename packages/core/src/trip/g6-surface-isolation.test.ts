import {describe,expect,it} from 'vitest';
import {createTrip,readPresentations,tripParts} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';
import {memorabiliaHtml} from './render.ts';
import {reusableArt,reviewKeepsakePages} from './keepsake-workflow.ts';
import {exportTripPackage} from './package.ts';
import {importTripPackage} from './import.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'};
const png='data:image/png;base64,iVBORw0KGgo=';

function makeTrip(){
  let n=0;
  const session=new TripSession(createTrip({title:'Our Bangkok',city:'Bangkok',cityId:'bangkok',timeZone:null}),{newId:()=>`item-${++n}`});
  const register=(id:string,hash:string)=>session.execute<{id:string}>(owner,'trip_asset_register',{asset:{id,hash:hash.repeat(64),mime:'image/png',role:'original',width:1200,height:1200,credit:'FCC',rightsStatus:'approved'}}).id;
  const place=(assetId:string,input:Record<string,unknown>={})=>session.execute<{id:string}>(owner,'trip_presentation_create',{assetId,scope:'stay',...input}).id;
  return {session,register,place};
}

describe('G6 presentation surface isolation',()=>{
  it('excludes board-only assets from magazine pages, slots and unused assets',()=>{
    const {session,register,place}=makeTrip();
    const magazineAsset=register('dish','a');
    const boardAsset=register('board-art','b');
    place(magazineAsset,{pattern:'food-culture',magazineRole:'specimen'});
    place(boardAsset,{surface:'board',rotation:0,zIndex:1});
    // No URL is supplied for the board asset: a magazine candidate would throw as missing.
    const magazine=buildMagazine(session.doc,{assetUrls:new Map([[magazineAsset,png]])});
    const pageAssetIds=magazine.pages.flatMap(page=>page.assetIds);
    const slotAssetIds=magazine.spreads.flatMap(spread=>spread.usedSlots.map(slot=>slot.assetId));
    expect(pageAssetIds).toContain(magazineAsset);
    expect(pageAssetIds).not.toContain(boardAsset);
    expect(slotAssetIds).not.toContain(boardAsset);
    expect(magazine.unusedAssetIds).not.toContain(boardAsset);
    expect(magazine.pages.map(page=>page.svg).join('\n')).not.toContain(`data-art="${boardAsset}"`);
  });

  it('does not revive board-only assets through options artwork, while retaining an asset also used by a magazine presentation',()=>{
    const {session,register,place}=makeTrip();
    const magazineAsset=register('dish','a');
    const boardAsset=register('board-art','b');
    const fallbackBoardAsset=register('board-fallback','c');
    const sharedAsset=register('shared-art','d');
    place(magazineAsset,{pattern:'food-culture',magazineRole:'specimen'});
    place(boardAsset,{surface:'board',rotation:0,zIndex:1});
    place(fallbackBoardAsset,{surface:'board',rotation:0,zIndex:2});
    place(sharedAsset,{surface:'board',rotation:0,zIndex:3});
    place(sharedAsset,{pattern:'food-culture',magazineRole:'specimen'});
    const artwork=[boardAsset,fallbackBoardAsset].map(assetId=>({assetId,kind:'original-art',role:'specimen',width:1200,height:1200,credit:'FCC',rightsStatus:'approved'}));
    const magazine=buildMagazine(session.doc,{assetUrls:new Map([[magazineAsset,png],[sharedAsset,png]]),artwork});
    const pageAssetIds=magazine.pages.flatMap(page=>page.assetIds);
    expect(pageAssetIds).toContain(magazineAsset);
    expect(pageAssetIds).toContain(sharedAsset);
    expect(pageAssetIds).not.toContain(boardAsset);
    expect(pageAssetIds).not.toContain(fallbackBoardAsset);
    expect(magazine.unusedAssetIds).not.toContain(boardAsset);
    expect(magazine.unusedAssetIds).not.toContain(fallbackBoardAsset);
    expect(magazine.pages.map(page=>page.svg).join('\n')).not.toContain(`data-art="${boardAsset}"`);
    expect(magazine.pages.map(page=>page.svg).join('\n')).not.toContain(`data-art="${fallbackBoardAsset}"`);
  });

  it('excludes board-only assets from keepsake review, reusable art and memorabilia without bogus missing or collision problems',()=>{
    const {session,register,place}=makeTrip();
    const magazineAsset=register('keepsake-art','a');
    const boardAsset=register('keepsake-board','b');
    place(magazineAsset,{magazineRole:'specimen'});
    place(boardAsset,{surface:'board',rotation:0,zIndex:1});
    const review=reviewKeepsakePages(session,{cardIds:[],hasBytes:id=>id===magazineAsset});
    expect(review).toEqual({ok:true,problems:[]});
    expect(reusableArt(session).map(item=>item.assetId)).toContain(magazineAsset);
    expect(reusableArt(session).map(item=>item.assetId)).not.toContain(boardAsset);
    const html=memorabiliaHtml(session.doc,new Set(),undefined,new Map([[magazineAsset,png],[boardAsset,png]]));
    expect(html).toContain(`data-asset="${magazineAsset}"`);
    expect(html).not.toContain(boardAsset);
  });

  it('retains board presentations in the native package and in direct presentation reads',async()=>{
    const {session,register,place}=makeTrip();
    const magazineAsset=register('package-art','a');
    const boardAsset=register('package-board','b');
    place(magazineAsset,{pattern:'food-culture',magazineRole:'specimen'});
    const boardPresentationId=place(boardAsset,{surface:'board',rotation:0,zIndex:1});
    expect(readPresentations(session.parts).some(p=>p.id===boardPresentationId&&p.surface==='board'&&p.assetId===boardAsset)).toBe(true);
    const packed=await exportTripPackage(session.doc,new Map([[magazineAsset,new TextEncoder().encode('magazine image bytes')],[boardAsset,new TextEncoder().encode('board image bytes')]]),{includePrivate:true});
    const imported=await importTripPackage(packed);
    const importedPresentations=readPresentations(tripParts(imported.doc));
    expect(importedPresentations.some(p=>p.surface==='board'&&p.assetId===boardAsset)).toBe(true);
    expect(importedPresentations.some(p=>p.surface!=='board'&&p.assetId===magazineAsset)).toBe(true);
  });
});
