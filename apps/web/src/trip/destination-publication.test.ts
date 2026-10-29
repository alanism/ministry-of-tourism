import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {destinationRows} from './destination';
const json=(path:string)=>JSON.parse(readFileSync(new URL('../../public/'+path,import.meta.url),'utf8'));
describe('MOT-75 published registry and bundled art reconciliation',()=>{
 it('validates all 200 canonical destinations and counts actual bundled city catalogs, not raw source keys',()=>{
  const cities=destinationRows.parse(json('fcc/destinations.json').cities),report=json('fcc/destinations-reconciliation.json'),manifest=json('artwork/fcc/manifest.json');
  const bundled=new Set<string>(manifest.cities.map((c:{id:string})=>c.id));
  expect(cities).toHaveLength(200);expect(report.registryCount).toBe(200);expect(report.artCityCount).toBe(bundled.size);
  expect(report.registeredCitiesWithoutArt).toEqual(cities.filter(c=>!bundled.has(c.id)).map(c=>c.id).sort());
  expect(report.unmatchedArtCityIds).toEqual([...bundled].filter(id=>!cities.some(c=>c.id===id)).sort());
 });
});
