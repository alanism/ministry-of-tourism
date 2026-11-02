import {afterEach,expect,it,vi} from 'vitest';
import {PublicCatalogueReader} from './public-catalogue-browser';

afterEach(()=>vi.unstubAllGlobals());
it('uses native fetch without assigning the catalogue reader as its WebIDL receiver',async()=>{
 const calls:unknown[]=[];
 vi.stubGlobal('fetch',function(this:unknown){
  calls.push(this);
  if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');
  return Promise.resolve(new Response('unavailable',{status:503}));
 });
 await expect(new PublicCatalogueReader().manifest(new AbortController().signal)).rejects.toThrow('Catalogue request failed (503)');
 expect(calls).toHaveLength(1);
});
