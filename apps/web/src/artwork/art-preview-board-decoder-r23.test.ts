import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Artwork} from './catalog';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const art={src:'https://example.org/preview.png',thumb:'https://example.org/thumb.png',original:'https://example.org/original.png'} as Artwork;
const file=()=>new File([png],'original.png',{type:'image/png'});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{vi.resetModules();vi.stubGlobal('fetch',vi.fn(async()=>new Response(png,{headers:{'content-type':'image/png'}})));});
afterEach(()=>vi.unstubAllGlobals());
function gated(){
  let live=0,peak=0;
  const gates:{settled:boolean;resolve:()=>void;reject:()=>void}[]=[],closed:number[]=[];
  vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise<ImageBitmap>((resolve,reject)=>{
    const index=gates.length;live++;peak=Math.max(peak,live);
    const gate={settled:false,resolve:()=>{if(gate.settled)return;gate.settled=true;resolve({width:1,height:1,close:()=>{closed.push(index);live--;}} as ImageBitmap);},reject:()=>{if(gate.settled)return;gate.settled=true;live--;reject(new Error('decode failed'));}};gates.push(gate);
  })));
  return {gates,closed,peak:()=>peak,live:()=>live,drain:async()=>{for(let i=0;i<8;i++){gates.forEach(g=>g.resolve());await flush();}}};
}
it('serializes a pending preview and board Add through actual bitmap close',async()=>{
  const {loadArtworkPreview}=await import('./art-preview'),{prepareBoardImages}=await import('../trip/board-images'),g=gated(),controller=new AbortController();
  const preview=loadArtworkPreview(art,controller.signal),adding=()=>{const work=prepareBoardImages([file()]);void work.catch(()=>{});return work;};void preview.catch(()=>{});let insertion:ReturnType<typeof adding>|undefined;
  try{await vi.waitFor(()=>expect(g.gates).toHaveLength(1));insertion=adding();await flush();await flush();expect(g.gates).toHaveLength(1);g.gates[0]!.resolve();await preview;await vi.waitFor(()=>expect(g.gates).toHaveLength(2));g.gates[1]!.resolve();await insertion;expect(g.peak()).toBe(1);expect(g.closed).toEqual([0,1]);}
  finally{controller.abort();await g.drain();await Promise.allSettled([preview,...(insertion?[insertion]:[])]);}
});
it('immediate preview cancellation cannot release its late native bitmap to a retry',async()=>{
  const {loadArtworkPreview}=await import('./art-preview'),{prepareBoardImages}=await import('../trip/board-images'),g=gated(),old=new AbortController(),retry=new AbortController();
  const preview=loadArtworkPreview(art,old.signal).catch(e=>e);let next:Promise<unknown>|undefined;
  try{await vi.waitFor(()=>expect(g.gates).toHaveLength(1));old.abort();expect(await preview).toMatchObject({name:'AbortError'});next=prepareBoardImages([file()],retry.signal);void next.catch(()=>{});await flush();await flush();expect(g.gates).toHaveLength(1);g.gates[0]!.resolve();await vi.waitFor(()=>expect(g.gates).toHaveLength(2));g.gates[1]!.resolve();await next;expect(g.peak()).toBe(1);expect(g.closed).toEqual([0,1]);}
  finally{old.abort();retry.abort();await g.drain();await Promise.allSettled([preview,...(next?[next]:[])]);}
});
it('aborts a queued preview without decoding it and lets the next Add proceed',async()=>{
  const {loadArtworkPreview}=await import('./art-preview'),{prepareBoardImages}=await import('../trip/board-images'),g=gated(),controller=new AbortController();
  const first=prepareBoardImages([file()]);let preview:Promise<unknown>|undefined,next:Promise<unknown>|undefined;
  try{await vi.waitFor(()=>expect(g.gates).toHaveLength(1));preview=loadArtworkPreview(art,controller.signal).catch(e=>e);await flush();controller.abort();expect(await preview).toMatchObject({name:'AbortError'});next=prepareBoardImages([file()]);await flush();expect(g.gates).toHaveLength(1);g.gates[0]!.resolve();await first;await vi.waitFor(()=>expect(g.gates).toHaveLength(2));g.gates[1]!.resolve();await next;expect(g.peak()).toBe(1);expect(g.closed).toEqual([0,1]);}
  finally{controller.abort();await g.drain();await Promise.allSettled([first,...(preview?[preview]:[]),...(next?[next]:[])]);}
});
it('a failed preview releases the slot so the selected original can still be added',async()=>{
  const {loadArtworkPreview}=await import('./art-preview'),{prepareBoardImages}=await import('../trip/board-images'),g=gated(),controller=new AbortController();
  const preview=loadArtworkPreview(art,controller.signal).catch(e=>e);let insertion:Promise<unknown>|undefined;
  try{await vi.waitFor(()=>expect(g.gates).toHaveLength(1));insertion=prepareBoardImages([file()]);await flush();g.gates[0]!.reject();expect((await preview).message).toBe('decode failed');await vi.waitFor(()=>expect(g.gates).toHaveLength(2));g.gates[1]!.resolve();await insertion;expect(g.peak()).toBe(1);expect(g.live()).toBe(0);}
  finally{controller.abort();await g.drain();await Promise.allSettled([preview,...(insertion?[insertion]:[])]);}
});
