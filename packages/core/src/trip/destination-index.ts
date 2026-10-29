import {z} from 'zod';

// Exact source country labels -> ISO 3166-1 alpha-2. No city or time-zone inference.
const countryCodes=new Map(`Argentina=AR|Australia=AU|Austria=AT|Bahamas=BS|Belgium=BE|Belize=BZ|Brazil=BR|Canada=CA|Chile=CL|China=CN|Colombia=CO|Costa Rica=CR|Croatia=HR|Czech Republic=CZ|Denmark=DK|Dominican Republic=DO|Egypt=EG|Ethiopia=ET|Finland=FI|France=FR|Georgia=GE|Germany=DE|Ghana=GH|Greece=GR|Hungary=HU|India=IN|Indonesia=ID|Ireland=IE|Italy=IT|Japan=JP|Kenya=KE|Laos=LA|Lithuania=LT|Malaysia=MY|Maldives=MV|Mauritius=MU|Mexico=MX|Montenegro=ME|Morocco=MA|Netherlands=NL|New Zealand=NZ|Nigeria=NG|Norway=NO|Oman=OM|Panama=PA|Peru=PE|Philippines=PH|Poland=PL|Portugal=PT|Qatar=QA|Saudi Arabia=SA|Seychelles=SC|Singapore=SG|South Africa=ZA|South Korea=KR|Spain=ES|Sri Lanka=LK|St Kitts and Nevis=KN|Sweden=SE|Switzerland=CH|Taiwan=TW|Tanzania=TZ|Thailand=TH|Türkiye=TR|United Arab Emirates=AE|United Kingdom=GB|United States=US|Vietnam=VN`.split('|').map(pair=>pair.split('=') as [string,string]));
const slug=z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const name=z.string().trim().min(1).max(160);
const zone=z.string().min(1).max(80).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Invalid explicit city time zone');
const sourceRows=z.array(z.object({slug,name:name.optional(),aliases:z.array(name).optional(),identity:z.object({slug,name,country:name,tz:zone.nullable().optional(),aliases:z.array(name).optional()})}));
export interface CanonicalDestination {id:string;name:string;aliases:string[];countryCode:string;timeZone:string|null;}

/** Pure build step. Unexpected art identifiers are reported verbatim rather than dropped or renamed. */
export function buildDestinationIndex(source:unknown,artworkCityIds:readonly string[]){
 const rows=sourceRows.parse(source),ids=new Set<string>(),cities:CanonicalDestination[]=[];
 for(const row of rows){
  if(ids.has(row.slug)||row.identity.slug!==row.slug)throw Error('Duplicate or inconsistent city identity: '+row.slug);
  ids.add(row.slug);
  const countryCode=countryCodes.get(row.identity.country);if(!countryCode)throw Error('Country code requires an explicit source mapping: '+row.identity.country);
  const labels=row.identity.name.split(/\s+\/\s+/),display=labels[0]!.trim();
  if(!display||display.length>120)throw Error('Invalid city display name: '+row.slug);
  const aliases=[...new Set([row.name,row.identity.name,...labels.slice(1),...(row.aliases??[]),...(row.identity.aliases??[])].filter((s):s is string=>!!s&&s!==display))].sort();
  cities.push({id:row.slug,name:display,aliases,countryCode,timeZone:row.identity.tz??null});
 }
 cities.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const art=[...new Set(z.array(z.string().min(1).max(200)).parse(artworkCityIds))].sort(),artIds=new Set(art);
 const report={registryCount:cities.length,artCityCount:art.length,matchedArtCityCount:art.filter(id=>ids.has(id)).length,unmatchedArtCityIds:art.filter(id=>!ids.has(id)),registeredCitiesWithoutArt:cities.filter(city=>!artIds.has(city.id)).map(city=>city.id),unknownTimeZoneCityIds:cities.filter(city=>city.timeZone===null).map(city=>city.id)};
 return {publication:{schema:'mot.fcc-destinations/1',version:1 as const,cities},report};
}
