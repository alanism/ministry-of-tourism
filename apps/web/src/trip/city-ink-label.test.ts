import { afterEach, expect, it, vi } from 'vitest';
import { addCityInkMark, drawCityInkMark } from './city-ink-label';

afterEach(()=>vi.unstubAllGlobals());
it('draws exact mixed-case MoT locally in white serif lettering on a blue backplate',()=>{
  const fillText=vi.fn(),fillRect=vi.fn(),context={fillStyle:'',font:'',textAlign:'',textBaseline:'',letterSpacing:'',fillText,fillRect};
  drawCityInkMark(context as unknown as CanvasRenderingContext2D,1200,900);
  expect(fillText).toHaveBeenCalledWith('MoT',600,117);expect(fillRect).toHaveBeenCalledOnce();
  expect(context.font).toContain('IBM Plex Serif');expect(context.fillStyle).toBe('#ffffff');
});
it('saves the local overlay with the image bytes while preserving provider attribution and rejecting cancellation',async()=>{
  const close=vi.fn(),fillText=vi.fn(),blob=new Blob(['fixture city output'],{type:'image/png'});
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1200,height:900,close})));
  const context={fillStyle:'',font:'',textAlign:'',textBaseline:'',letterSpacing:'',fillText,fillRect:vi.fn(),drawImage:vi.fn()};
  const canvas={width:0,height:0,getContext:()=>context,toBlob:(callback:(blob:Blob)=>void)=>callback(blob)};
  vi.stubGlobal('document',{createElement:()=>canvas,fonts:{load:vi.fn(async()=>[])}});
  const result={blob:new Blob(['fixture raw provider']),mime:'image/png',width:1200,height:900,elapsedMs:1,createdAt:'2026-11-04T00:00:00.000Z',model:'muse-image-1.0'};
  expect(await addCityInkMark(result,new AbortController().signal)).toEqual({...result,blob});expect(close).toHaveBeenCalledOnce();
  const abort=new AbortController();abort.abort();await expect(addCityInkMark(result,abort.signal)).rejects.toThrow();
});
