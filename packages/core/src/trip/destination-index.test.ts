import {describe,expect,it} from 'vitest';
import {buildDestinationIndex} from './destination-index.ts';

const row=(slug:string,country:string,tz:string|null,name=slug)=>({slug,name,identity:{slug,name,country,tz}});
describe('MOT-75 canonical source geography',()=>{
 it('retains explicit city zones across five multi-zone countries instead of assigning a country zone',()=>{
  const rows=[row('new-york','United States','America/New_York'),row('los-angeles','United States','America/Los_Angeles'),row('sydney','Australia','Australia/Sydney'),row('perth','Australia','Australia/Perth'),row('toronto','Canada','America/Toronto'),row('vancouver','Canada','America/Vancouver'),row('sao-paulo','Brazil','America/Sao_Paulo'),row('manaus','Brazil','America/Manaus'),row('cancun','Mexico','America/Cancun'),row('tijuana','Mexico','America/Tijuana')];
  const {publication}=buildDestinationIndex(rows,rows.map(r=>r.slug));
  for(const [country,code] of [['United States','US'],['Australia','AU'],['Canada','CA'],['Brazil','BR'],['Mexico','MX']]){
   const cities=publication.cities.filter(c=>c.countryCode===code);expect(cities).toHaveLength(2);expect(new Set(cities.map(c=>c.timeZone)).size).toBe(2);
   for(const source of rows.filter(r=>r.identity.country===country))expect(cities.find(c=>c.id===source.slug)!.timeZone).toBe(source.identity.tz);
  }
 });
 it('keeps unknown zones explicit and reports both unmatched art IDs and registered cities without art',()=>{
  const {publication,report}=buildDestinationIndex([row('new-york','United States',null),row('sydney','Australia','Australia/Sydney')],['new-york','renamed-sydney']);
  expect(publication.cities.find(c=>c.id==='new-york')!.timeZone).toBeNull();
  expect(report).toMatchObject({registryCount:2,artCityCount:2,unmatchedArtCityIds:['renamed-sydney'],registeredCitiesWithoutArt:['sydney'],unknownTimeZoneCityIds:['new-york']});
 });
 it('takes names and aliases from explicit source metadata and preserves accented display names',()=>{
  const {publication}=buildDestinationIndex([row('san-sebastian','Spain','Europe/Madrid','San Sebastián / Donostia')],['san-sebastian']);
  expect(publication.cities[0]).toEqual({id:'san-sebastian',name:'San Sebastián',aliases:['Donostia','San Sebastián / Donostia'],countryCode:'ES',timeZone:'Europe/Madrid'});
 });
 it('is byte-identical for reordered source rows and reports with no generated clock',()=>{
  const rows=[row('tokyo','Japan','Asia/Tokyo'),row('bangkok','Thailand','Asia/Bangkok')];
  expect(JSON.stringify(buildDestinationIndex(rows,['tokyo','bogus','bangkok']))).toBe(JSON.stringify(buildDestinationIndex(rows.slice().reverse(),['bangkok','tokyo','bogus'])));
 });
 it('rejects duplicate/invalid identities, unknown countries and invalid explicit zones',()=>{
  const a=row('paris','France','Europe/Paris');
  for(const rows of [[a,a],[row('Paris bad','France','Europe/Paris')],[row('paris','Unknown country','Europe/Paris')],[row('paris','France','not/a/zone')]])expect(()=>buildDestinationIndex(rows,[])).toThrow();
 });
});
