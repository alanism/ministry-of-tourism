import {expect,it,vi} from 'vitest';
import {checkedPixels,rasterDimensions,sanitizedRaster} from './standalone-media';

it('preflights encoded dimensions rather than trusting an asset declaration',()=>{
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')),view=new DataView(png.buffer);view.setUint32(16,1024);view.setUint32(20,768);
  expect(rasterDimensions(png,'image/png')).toEqual({width:1024,height:768});
  view.setUint32(16,100000);expect(()=>checkedPixels(rasterDimensions(png,'image/png'))).toThrow(/decode limit/);
});
it('retains the decoder slot across cancellation and overlapping preview/export work',async()=>{
  let release!:()=>void,started!:()=>void,calls=0,closed=0;
  const began=new Promise<void>(resolve=>{started=resolve;}),decode=new Promise<void>(resolve=>{release=resolve;});
  vi.stubGlobal('createImageBitmap',async()=>{calls++;started();await decode;return {width:1,height:1,close:()=>{closed++;}};});
  const first=new AbortController(),second=new AbortController();
  const a=sanitizedRaster(new Blob(),{width:1,height:1},first.signal).catch(error=>error);
  await began;first.abort();
  const b=sanitizedRaster(new Blob(),{width:1,height:1},second.signal).catch(error=>error);
  try{await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toBe(1);}
  finally{second.abort();release();await Promise.all([a,b]);vi.unstubAllGlobals();}
  expect(closed).toBe(1);
});
it('rejects unknown formats, malformed headers and unsafe dimension arithmetic before decode',()=>{
  for(const mime of ['image/svg+xml','image/gif','image/avif','image/png','image/jpeg','image/webp'])expect(()=>rasterDimensions(new Uint8Array(12),mime)).toThrow();
  for(const size of [{width:0,height:2},{width:1.5,height:3},{width:Infinity,height:10},{width:5000,height:5000}])expect(()=>checkedPixels(size)).toThrow();
});
