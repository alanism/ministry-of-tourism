import {expect,it} from 'vitest';
import {buildCustomConnector, CONNECTOR_ROOT, CONNECTOR_ORIGIN} from './custom-connector.ts';

function fixture(count=28){
 const eligibility=Object.fromEntries(['discover','preview','insert','share','embed','shop'].map(op=>[op,{allowed:op==='discover'||op==='preview',reason:'Fixture metadata only'}]));
 const items=Array.from({length:count},(_,i)=>({id:`item-${i}`,type:'art',title:`Public art ${i}`,originCityId:'bangkok',countryCode:'TH',sourceId:`source-${i}`,sourceVersion:'test-v1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'cached',rights:{credit:'FCC fixture',evidence:'unknown',policyRef:'test'},eligibility:structuredClone(eligibility),sourceUrl:'https://foreignclubberscorespondence.web.app/artwork/test.png',sourceUnit:'asset-row',sourceState:'matched',category:'city-illustrations',line:null,cityLabel:'Bangkok',countryLabel:'Thailand',thumbnailUrl:null,thumbnailRole:null,detail:'/fcc-catalogue/details/bangkok.json'}));
 return {schema:'mot.public-catalogue.index/1',snapshotId:'fixture-snapshot',items,coverage:{sourceRows:count,unresolvedRows:0,excludedRows:0,shopProductRecords:0,runtimeExtraRecords:0,cities:0,articles:0,places:0},gaps:[],aliases:[],tombstones:[]};
}
const json=(files:Map<string,string>,path:string)=>JSON.parse(files.get(path)!);
it('provides exact paged GET routes, stable provenance and a matching OpenAPI contract',()=>{
 const input=fixture();const files=buildCustomConnector(input);
 const cities=json(files,`${CONNECTOR_ROOT}/v1/cities.json`);
 const category=cities.cities[0].categories[0];expect(category.count).toBe(28);expect(category.pages).toBe(2);
 const seen:string[]=[];let url:string|null=category.firstPageUrl;
 while(url){const page=json(files,new URL(url).pathname);expect(page.items.length).toBeLessThanOrEqual(25);expect(page.catalogSnapshot).toBe(input.snapshotId);seen.push(...page.items.map((item:{id:string})=>item.id));expect(page.items[0].rights).toEqual(input.items[0]!.rights);expect(page.items[0].eligibility.embed.allowed).toBe(false);url=page.nextPageUrl;}
 expect(new Set(seen).size).toBe(28);
 const spec=json(files,`${CONNECTOR_ROOT}/openapi.json`);expect(spec.servers).toEqual([{url:CONNECTOR_ORIGIN}]);expect(spec.security).toEqual([]);
 for(const operation of Object.values(spec.paths))expect(Object.keys(operation as object)).toEqual(['get']);
 const capability=json(files,`${CONNECTOR_ROOT}/v1/capabilities.json`);expect(capability).toMatchObject({authentication:'none',privateTripAccess:false,writeAccess:false,nativeMcp:false,catalogSnapshot:input.snapshotId});
 expect([...files.keys()].every(path=>path.startsWith(CONNECTOR_ROOT+'/'))).toBe(true);
 expect([...files.values()].every(text=>Buffer.byteLength(text)<=128*1024)).toBe(true);
 expect(buildCustomConnector(input)).toEqual(files);
});
it('excludes non-discoverable and personal-only rows rather than publishing them',()=>{
 const input=fixture();input.items[0]!.eligibility.discover!.allowed=false;
 Object.assign(input.items[1]!,{personalOnly:true});
 const files=buildCustomConnector(input);const text=[...files.values()].join('\n');
 expect(text).not.toContain('"id":"item-0"');expect(text).not.toContain('"id":"item-1"');
 const capability=json(files,`${CONNECTOR_ROOT}/v1/capabilities.json`);expect(capability.publishedRecords).toBe(26);expect(capability.excludedRecords).toBe(2);
});
it('rejects unknown/private fields, foreign references and unsafe output paths',()=>{
 for(const value of [{privateNotes:'private canary'},{sourceUrl:'http://127.0.0.1/private'},{originCityId:'../private'},{sourceUrl:'https://untrusted.example/data'}]){
  const input=fixture(1);Object.assign(input.items[0]!,value);expect(()=>buildCustomConnector(input)).toThrow();
 }
});
it('escapes source labels in human-readable documentation and preserves gaps honestly',()=>{
 const input=fixture(1);input.items[0]!.cityLabel='<script>alert(1)</script>';
 input.gaps.push({type:'article',cityId:'bangkok',reason:'Feed unavailable'} as never);
 const files=buildCustomConnector(input);
 const cities=json(files,`${CONNECTOR_ROOT}/v1/cities.json`);expect(cities.gaps).toEqual(input.gaps);
 expect(files.get(`${CONNECTOR_ROOT}/index.html`)).not.toContain('<script>alert');
 expect(json(files,`${CONNECTOR_ROOT}/v1/capabilities.json`).dataFreshness).toContain('snapshot');
});
it('paginates the full city directory without dropping cities or exceeding response bounds',()=>{
 const input=fixture(60);input.items.forEach((item,i)=>{item.originCityId=`city-${i}`;});
 const files=buildCustomConnector(input),seen=new Set<string>();let path:string|null=`${CONNECTOR_ROOT}/v1/cities.json`;
 while(path){const page=json(files,path);expect(page.totalCities).toBe(60);expect(page.cities.length).toBeLessThanOrEqual(25);page.cities.forEach((city:{id:string})=>seen.add(city.id));path=page.nextPageUrl?new URL(page.nextPageUrl).pathname:null;}
 expect(seen.size).toBe(60);
});
