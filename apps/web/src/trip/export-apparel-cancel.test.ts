import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,loadCityApparel,sha256Hex,TripSession,type ApparelArtRef} from '@writers-board/core';
import {prepareMagazine} from './artifacts';

vi.mock('@writers-board/core',async original=>({...await original<typeof import('@writers-board/core')>(),loadCityApparel:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

async function fixture(){
  const blob=new Blob(['synthetic FCC garment decoder control'],{type:'image/png'}),hash=await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
  const art:ApparelArtRef={assetId:'fcc:bangkok:tee-control',kind:'apparel-mockup',category:'apparel',originCityId:'bangkok',role:'apparel-brush',width:800,height:1200,mimeType:'image/png',hash,thumbnailUrl:'https://foreignclubberscorespondence.web.app/tee-thumb.png',renditionUrl:'https://foreignclubberscorespondence.web.app/tee.png',credit:'FCC decoder control',rightsStatus:'unknown',source:{provider:'fcc',sourceId:'tee-control',canonicalUrl:'https://foreignclubberscorespondence.web.app/bangkok.html',cityId:'bangkok',kind:'artwork',retrievedAt:'2026-10-30',origin:'artwork',contentHash:hash}};
  vi.mocked(loadCityApparel).mockResolvedValue([art]);
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(blob));vi.stubGlobal('fetch',fetcher);
  const doc=createTrip({title:'Garment cancellation control',city:'Bangkok',cityId:'bangkok',timeZone:null}),session=new TripSession(doc);
  session.execute({kind:'human',id:'qa',name:'QA'},'trip_card_create',{kind:'note',title:'Keep the note unchanged',scope:'guide'});
  return{blob,art,fetcher,doc,session,before:encodeTrip(doc)};
}

it('settles a stalled FCC garment decode on Cancel, preserves the reason and closes its late bitmap once',async()=>{
  const f=await fixture(),controller=new AbortController(),reason=new DOMException('Garment export stopped','AbortError'),prepared=vi.fn(),close=vi.fn();
  let began!:()=>void,release!:(image:ImageBitmap)=>void;const started=new Promise<void>(resolve=>{began=resolve;});
  const decode=vi.fn(()=>{began();return new Promise<ImageBitmap>(resolve=>{release=resolve;});});vi.stubGlobal('createImageBitmap',decode);
  const pending=prepareMagazine(f.session,controller.signal,false,{onPrepared:prepared}).then(value=>({value}),error=>({error}));
  try{
    await started;controller.abort(reason);
    expect(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still decoding'),30))])).toEqual({error:reason});
    release({width:800,height:1200,close} as unknown as ImageBitmap);await Promise.resolve();await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();expect(prepared).not.toHaveBeenCalled();expect(f.fetcher).toHaveBeenCalledOnce();expect(encodeTrip(f.doc)).toEqual(f.before);
  }finally{release?.({width:800,height:1200,close} as unknown as ImageBitmap);await pending;f.session.destroy();f.doc.destroy();}
});

it('does not start a garment decoder if cancellation arrives while its checksum finishes',async()=>{
  const f=await fixture(),controller=new AbortController(),reason=new DOMException('Stopped after checksum','AbortError'),prepared=vi.fn(),close=vi.fn(),decode=vi.fn(async()=>({width:800,height:1200,close}));
  vi.stubGlobal('createImageBitmap',decode);const digest=crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{const hash=await digest(...args);controller.abort(reason);return hash;});
  try{await expect(prepareMagazine(f.session,controller.signal,false,{onPrepared:prepared})).rejects.toBe(reason);expect(decode).not.toHaveBeenCalled();expect(prepared).not.toHaveBeenCalled();expect(encodeTrip(f.doc)).toEqual(f.before);}
  finally{f.session.destroy();f.doc.destroy();}
});

it('still omits a garment whose decoded dimensions conflict with its declared original',async()=>{
  const f=await fixture(),close=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1200,height:800,close})));
  try{const magazine=await prepareMagazine(f.session,undefined,false);expect(magazine.warnings).toContain('1 FCC tee photo is unavailable; the remaining trip pages are kept.');expect(magazine.pages.every(page=>!page.assetIds.includes(f.art.assetId))).toBe(true);expect(close).toHaveBeenCalledOnce();expect(encodeTrip(f.doc)).toEqual(f.before);}
  finally{f.session.destroy();f.doc.destroy();}
});
