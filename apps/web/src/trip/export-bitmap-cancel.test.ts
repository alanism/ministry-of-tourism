import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,sha256Hex,TripSession} from '@writers-board/core';
import {prepareMagazine} from './artifacts';
import {getTripBlob} from './trip-assets';

vi.mock('./trip-assets',()=>({getTripBlob:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('cancels a stalled source bitmap decode and closes its late result without preparing a magazine',async()=>{
  const blob=new Blob(['synthetic bitmap control'],{type:'image/png'}),hash=await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
  vi.mocked(getTripBlob).mockResolvedValue(blob);
  vi.stubGlobal('FileReader',class{result:string|null=null;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;readAsDataURL(){this.result='data:image/png;base64,c3ludGhldGlj';queueMicrotask(()=>this.onload?.());}});
  let began!:()=>void,release!:(image:ImageBitmap)=>void;
  const started=new Promise<void>(resolve=>{began=resolve;});
  vi.stubGlobal('createImageBitmap',()=>{began();return new Promise<ImageBitmap>(resolve=>{release=resolve;});});
  const doc=createTrip({title:'Synthetic bitmap cancellation',city:'Bilbao',cityId:'bilbao',timeZone:null}),session=new TripSession(doc),actor={kind:'human' as const,id:'qa',name:'QA'};
  session.execute(actor,'trip_asset_register',{asset:{id:'bitmap-control',hash,mime:'image/png',role:'original',rightsStatus:'approved'}});
  session.execute(actor,'trip_card_create',{kind:'note',title:'Source unchanged',assetIds:['bitmap-control']});
  const before=encodeTrip(doc),controller=new AbortController(),prepared=vi.fn(),close=vi.fn(),pending=prepareMagazine(session,controller.signal,false,{onPrepared:prepared}).then(()=> 'ready',()=> 'cancelled');
  try{
    await started;controller.abort();
    expect(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still decoding'),30))])).toBe('cancelled');
    release({width:1,height:1,close} as unknown as ImageBitmap);await Promise.resolve();await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();expect(prepared).not.toHaveBeenCalled();expect(encodeTrip(doc)).toEqual(before);
  }finally{release?.({width:1,height:1,close} as unknown as ImageBitmap);await pending;session.destroy();doc.destroy();}
});
