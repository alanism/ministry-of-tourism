import {afterEach,expect,it,vi} from 'vitest';
import {prepareBoardImages} from './board-images';
afterEach(()=>vi.unstubAllGlobals());
it('rejects aggregate header pixels before any native decode even when each image fits',async()=>{
  const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,3000);v.setUint32(20,3000);
  const decode=vi.fn(async()=>({width:3000,height:3000,close:vi.fn()}));vi.stubGlobal('createImageBitmap',decode);
  await expect(prepareBoardImages([new File([b],'a.png',{type:'image/png'}),new File([b],'b.png',{type:'image/png'})])).rejects.toThrow(/total|aggregate/);
  expect(decode).not.toHaveBeenCalled();
});
