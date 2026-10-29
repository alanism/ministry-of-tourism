import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {destinationRows,loadDestinations} from './destination';
const rows=destinationRows.parse(JSON.parse(readFileSync(new URL('../../public/fcc/destinations.json',import.meta.url),'utf8')).cities);
const storage={getItem:()=>null,setItem:vi.fn()};
it('can use an explicit validated bundled index offline without a warmed browser cache or network',async()=>{
 const fetcher=vi.fn();const result=await loadDestinations({bundled:rows,offline:true,storage,fetcher});
 expect(result).toMatchObject({status:'bundled',cities:rows});expect(result.retrievedAt).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
});
it('keeps the included list usable when its refresh fails, without claiming it was fetched or saved',async()=>{
 const result=await loadDestinations({bundled:rows,storage,fetcher:async()=>new Response('',{status:503})});
 expect(result).toMatchObject({status:'bundled',cities:rows});expect(result.error).toMatch(/included/i);expect(result.retrievedAt).toBeUndefined();
});
it('publishes real source tag URLs and current art counts, with an identical compiled copy',()=>{
 const bundled=JSON.parse(readFileSync(new URL('./destination-bundle.json',import.meta.url),'utf8'));
 expect(bundled.cities).toEqual(rows);expect(rows).toHaveLength(200);expect(rows.filter(row=>row.tagUrl)).toHaveLength(150);
 expect(rows.find(row=>row.id==='bangkok')?.tagUrl).toMatch(/airport-tag/);expect(rows.find(row=>row.id==='san-sebastian')?.tagUrl).toBeNull();
 expect(rows.find(row=>row.id==='san-sebastian')?.artworkCount).toBe(14);
});
