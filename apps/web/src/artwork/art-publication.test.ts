import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {artRefSchema,selectCityApparel} from '@writers-board/core';
import {catalogSchema,manifestSchema} from './catalog';

it('publishes strict ArtRefs, keeps 50 real map-tee photos out of flat maps, and exposes only populated categories',()=>{
 const root=new URL('../../public/',import.meta.url),read=(url:string)=>JSON.parse(readFileSync(new URL(url.replace(/^\//,''),root),'utf8'));
 const manifest=manifestSchema.parse(read('/artwork/fcc/manifest.json'));
 const apparel=manifest.catalogs.filter(ref=>ref.subject==='apparel').slice(0,50);
 expect(apparel).toHaveLength(50);
 for(const ref of [...apparel,...manifest.catalogs.filter(ref=>ref.city==='bangkok')]){
  const catalog=catalogSchema.parse(read(ref.url));expect(catalog.items.length).toBe(ref.count);expect(ref.count).toBeGreaterThan(0);
  for(const art of catalog.items){expect(art.artRef).toBeDefined();artRefSchema.parse(art.artRef);expect(art.artRef?.category).toBe(ref.subject);}
  if(ref.subject==='apparel'){
   const tees=selectCityApparel(ref.city!,catalog.items).filter(art=>art.variant==='mono'||art.variant==='color');
   expect(tees.length).toBeGreaterThan(0);expect(tees.every(art=>art.kind==='apparel-mockup'&&art.category==='apparel')).toBe(true);
  }
 }
});
