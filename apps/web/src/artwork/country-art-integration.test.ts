import {expect,it} from 'vitest';
import {resolveArtScope,loadCountryArtwork,restoreCountryArtCache,persistCountryArtCache,type CountryArtCache} from './country-art';
import type {Manifest} from './catalog';
const destinations=[{id:'san-sebastian',name:'San Sebastián',countryCode:'ES',timeZone:null},{id:'barcelona',name:'Barcelona',countryCode:'ES',timeZone:null},{id:'paris',name:'Paris',countryCode:'FR',timeZone:null}];
const manifest:Manifest={version:1,styleId:'fcc-editorial',cities:destinations.map(city=>({id:city.id,label:city.name})),subjects:[{id:'hotels',label:'Hotels'},{id:'people',label:'People'},{id:'apparel',label:'Apparel'}],catalogs:[{city:'san-sebastian',subject:'hotels',count:1,url:'/artwork/ss/hotels.json'},{city:'barcelona',subject:'people',count:1,url:'/artwork/bcn/people.json'},{city:'barcelona',subject:'apparel',count:1,url:'/artwork/bcn/apparel.json'},{city:'paris',subject:'hotels',count:1,url:'/artwork/paris/hotels.json'}]};
const scope=(category='all')=>resolveArtScope({cityId:'san-sebastian',countryCode:'ES',category,mode:'country',destinations,manifest});
const fetcher=(async url=>{const ref=manifest.catalogs.find(ref=>ref.url===String(url))!;return new Response(JSON.stringify({version:1,styleId:'fcc-editorial',items:[{id:ref.city+'-drawing',styleId:'fcc-editorial',city:ref.city,subject:ref.subject,label:'A source drawing',thumb:'https://example.com/thumb.webp',src:'https://example.com/preview.webp',width:960,height:640}]}));}) as typeof fetch;
it('browses all actual country categories while excluding apparel and foreign-country shards',()=>{
 const selection=scope();expect(selection.catalogPaths).toEqual(['/artwork/ss/hotels.json','/artwork/bcn/people.json']);
});
it('retains all-category source identities and restores a dated public metadata copy after reopening',async()=>{
 const cache:CountryArtCache=new Map(),options={scope:scope(),manifest,subject:'all',signal:new AbortController().signal};
 const first=await loadCountryArtwork({...options,cache,fetcher,now:()=>new Date('2026-10-29T10:00:00Z')});expect(first.items).toHaveLength(2);
 let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
 expect(persistCountryArtCache(cache,storage)).toBe(true);const restored=restoreCountryArtCache(storage);
 expect(await loadCountryArtwork({...options,cache:restored,offline:true})).toMatchObject({status:'cached',retrievedAt:'2026-10-29T10:00:00.000Z',items:first.items});
});
it('refuses a cached city from another country instead of trusting its cache key',async()=>{
 const cache:CountryArtCache=new Map(),options={scope:scope('hotels'),manifest,subject:'hotels',signal:new AbortController().signal};await loadCountryArtwork({...options,cache,fetcher});
 const saved=[...cache.values()][0]!;saved.items[0]!.originCityId='paris';saved.items[0]!.artwork.city='paris';
 const result=await loadCountryArtwork({...options,cache,offline:true});expect(result.status).toBe('unavailable');expect(result.items).toEqual([]);
});
