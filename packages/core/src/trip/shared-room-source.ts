import {z} from 'zod';
import {sourceRefSchema} from './schema.ts';
import {catalogueItemSchema,type CatalogueIndexItem} from './public-catalogue.ts';
import {isPublicFccUrl} from './city-source.ts';

const id=z.string().min(1).max(200),date=z.iso.datetime({offset:true});
const publicUrl=z.string().max(2000).refine(value=>{
 if(/\s|[\u0000-\u001f\u007f]/u.test(value)||!isPublicFccUrl(value))return false;
 const url=new URL(value);return !url.search&&!url.hash&&url.href===value;
},'Only exact public publisher references without private URL context');
export const roomPublicCitationSchema=z.object({provider:z.literal('fcc'),id,canonicalUrl:publicUrl,retrievedAt:date,version:id.optional()}).strict();
export type RoomPublicCitation=z.infer<typeof roomPublicCitationSchema>;
/** The service supplies authority from its verified pinned catalogue, never the request body. */
export interface RoomCitationAuthority {snapshotId:string;expectedSnapshotId:string;item:CatalogueIndexItem;}
/** Citation metadata is not a rights grant or proof of uploaded pixels. Byte/source binding stays in the trusted media admission. */
export function projectRoomPublicCitation(rawSource:unknown,authority?:RoomCitationAuthority):RoomPublicCitation|undefined {
 if(rawSource===undefined)return undefined;
 // Check original bytes before a general URL validator can normalize whitespace.
 if(rawSource&&typeof rawSource==='object'&&!Array.isArray(rawSource))for(const key of ['url','canonicalUrl']){
  const value=(rawSource as Record<string,unknown>)[key];if(value!==undefined)publicUrl.parse(value);
 }
 const source=sourceRefSchema.parse(rawSource);
 if(source.provider!=='fcc'||!authority||id.parse(authority.snapshotId)!==id.parse(authority.expectedSnapshotId))throw Error('A pinned public source authority is required');
 const item=catalogueItemSchema.parse(authority.item);
 if(item.personalOnly||!item.eligibility.share.allowed||!item.sourceUrl)throw Error('This source is unavailable for room sharing; keep the local original');
 if(source.sourceId!==undefined?source.sourceId!==item.sourceId:![item.id,item.sourceId,item.runtimeArtworkId].includes(source.id))throw Error('Public source identity differs from catalogue');
 const canonicalUrl=publicUrl.parse(item.sourceUrl);
 if((source.canonicalUrl??source.url)!==canonicalUrl||source.url!==undefined&&source.url!==canonicalUrl)throw Error('Public source URL differs from catalogue');
 if(source.version!==undefined&&source.version!==item.sourceVersion)throw Error('Public source version differs from catalogue');
 if(source.cityId!==undefined&&source.cityId!==item.originCityId||source.countryCode!==undefined&&source.countryCode!==item.countryCode)throw Error('Public source origin differs from catalogue');
 const kind=item.type==='place'?'venue':item.type==='article'?'article':item.type==='city'?'almanac':'artwork';
 if(source.kind!==undefined&&source.kind!==kind)throw Error('Public source representation differs from catalogue');
 return roomPublicCitationSchema.parse({provider:'fcc',id:item.sourceId,canonicalUrl,retrievedAt:source.retrievedAt,...(source.version!==undefined?{version:source.version}:{})});
}
