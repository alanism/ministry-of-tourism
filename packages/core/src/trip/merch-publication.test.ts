import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {fccShopUrl,selectCityApparel} from './merch.ts';
const root=new URL('../../../../apps/web/public/',import.meta.url);
it('prioritizes the three named tee roles from actual San Sebastián and Kyoto catalogs',()=>{
 for(const city of ['san-sebastian','kyoto']){
  const raw=JSON.parse(readFileSync(new URL('artwork/fcc/'+city+'/apparel.json',root),'utf8')).items;
  expect(selectCityApparel(city,raw).slice(0,3).map(a=>a.role)).toEqual(['apparel-brush','apparel-map-mono','apparel-map-color']);
 }
});
it('makes city-only shop URLs for all 200 canonical destinations',()=>{
 const cities=JSON.parse(readFileSync(new URL('fcc/destinations.json',root),'utf8')).cities;
 expect(cities).toHaveLength(200);
 for(const city of cities){const url=new URL(fccShopUrl(city.id));expect(url.origin).toBe('https://foreignclubberscorespondence.web.app');expect(url.pathname).toBe('/shop/');expect([...url.searchParams]).toEqual([['city',city.id]]);}
});
