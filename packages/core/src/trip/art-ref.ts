import {z} from 'zod';
import {apparelArtRefSchema} from './merch.ts';

export const ART_CATEGORIES=['cafe','portraits','city-ink','hotels','restaurants','maps','stickers','objects','people','activities','city-illustrations','apparel','other'] as const;
const credit=z.string().trim().min(1).max(1000),rights=z.enum(['approved','unknown','restricted']);
const common={credit,countryCode:z.string().regex(/^[A-Z]{2}$/),category:z.enum(ART_CATEGORIES)};
const original=apparelArtRefSchema.extend({...common,kind:z.enum(['original-art','map','sticker','photo']),variant:z.never().optional(),role:z.enum(['backdrop','foreground','city-ink','specimen','facade','interior','portrait','postcard','tag','stamp','vehicle','vignette','map']).optional()});
const apparel=apparelArtRefSchema.extend({...common,category:z.literal('apparel')});
export const artRefSchema=z.discriminatedUnion('kind',[original,apparel]).superRefine((art,ctx)=>{
 if(art.kind!=='apparel-mockup'&&art.category==='apparel')ctx.addIssue({code:'custom',message:'Apparel cannot be classified as original artwork'});
 if(art.source.cityId&&art.source.cityId!==art.originCityId)ctx.addIssue({code:'custom',message:'ArtRef source city differs from its origin'});
 if(art.source.countryCode&&art.source.countryCode!==art.countryCode)ctx.addIssue({code:'custom',message:'ArtRef source country differs from its origin'});
});
export type ArtRef=z.infer<typeof artRefSchema>;
export type ArtCollection='city-illustrations'|'brush-portraits-apparel'|'map-tee-apparel'|'brush-original';
export function normalizeArtCategory(category:string,collection:ArtCollection):{kind:ArtRef['kind'];category:ArtRef['category']}{
 if(collection==='brush-portraits-apparel'||collection==='map-tee-apparel')return{kind:'apparel-mockup',category:'apparel'};
 if(collection==='brush-original')return{kind:'original-art',category:'portraits'};
 const categories:Record<string,ArtRef['category']>={cafe:'cafe',fashion:'portraits','fashion-men':'portraits','brush-portrait':'portraits','city-ink':'city-ink',hotel:'hotels',restaurant:'restaurants',map:'maps',maps:'maps',tag:'stickers',stamp:'stickers',sticker:'stickers',object:'objects',objects:'objects',people:'people',activity:'activities','city-illustration':'city-illustrations',backdrop:'city-illustrations',foreground:'city-illustrations'};
 const normalized=categories[category]??'other';return{kind:normalized==='maps'?'map':normalized==='stickers'?'sticker':'original-art',category:normalized};
}
type Policy={credit?:string;rightsStatus?:z.infer<typeof rights>};
export function resolveArtRights(pack:Policy,entry:Policy){const value=entry.credit??pack.credit;if(!value?.trim())throw Error('Artwork source credit is required');return{credit:credit.parse(value),rightsStatus:rights.parse(entry.rightsStatus??pack.rightsStatus??'unknown')};}
