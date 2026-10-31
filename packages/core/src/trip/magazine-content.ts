import type * as Y from 'yjs';
import {readAllCards,tripParts} from './model.ts';
import {recoverFccTitle} from './fcc-text.ts';
import type {Presentation,TripCard} from './schema.ts';
import type {MagazineDocument} from './magazine.ts';
import {magazineReadingText} from './magazine-markdown.ts';

export interface MagazineReading {id:string;title:string;day?:string;time?:string;source:boolean;body:string;note?:string;text:string;}
export interface MagazineSelection {
  version:1;boardId:string;revision:number;scope:'personal'|'guide'|'stay';
  cards:{id:string;title:string;order:number;kind:string;readingId:string;pageIds:string[];source?:{id:string;version?:string;retrievedAt:string;contentHash?:string}}[];
  assets:{id:string;hash?:string;caption?:string;credit?:string;pageIds:string[];representation:'image'|'same-image';representedBy?:string}[];
  placements:{id:string;cardId?:string;assetId?:string;crop:number[];rotation:number;pageIds:string[]}[];
  excluded:{reason:'private'|'outside-guide';cards:number};
}
/** An allowlisted projection of the selected snapshot, never a serialized live document. */
export function magazineContent(doc:Y.Doc,issue:MagazineDocument,cards:TripCard[],layers:Presentation[],scope:MagazineSelection['scope']):void{
  const parts=tripParts(doc),pageIds=(id:string,asset=false)=>issue.pages.filter(page=>(asset?page.assetIds:page.sourceCardIds??[]).includes(id)).map(page=>page.id);
  // Legacy rendering can read older asset records; project only independently valid scalar fields.
  const asset=(id:string)=>{const value=parts.assets.get(id),hash=value?.get('hash'),caption=value?.get('caption'),credit=value?.get('credit');return {hash:typeof hash==='string'&&/^[a-f\d]{64}$/.test(hash)?hash:undefined,caption:typeof caption==='string'?caption:undefined,credit:typeof credit==='string'?credit:undefined};};
  cards=cards.map(card=>card.provenance==='fcc'||card.source?.provider==='fcc'?{...card,title:recoverFccTitle(card.title)}:card);
  const source=(card:TripCard)=>card.provenance==='fcc'||card.source?.kind==='article';
  issue.reading=cards.slice().sort((a,b)=>Number(source(a))-Number(source(b))||Number(b.kind==='brief')-Number(a.kind==='brief')).map(card=>({id:card.id,title:card.title,...(card.day?{day:card.day}:{}),...(card.time?{time:card.time}:{}),source:source(card),body:card.body,...(card.travelerNote?{note:card.travelerNote}:{}),text:magazineReadingText(card.body)+(card.travelerNote?'\nYour note\n'+magazineReadingText(card.travelerNote):'')}));
  const ids=[...new Set([...cards.flatMap(card=>card.assetIds),...layers.flatMap(layer=>layer.assetId?[layer.assetId]:[]),...issue.pages.flatMap(page=>page.assetIds)])];
  issue.selection={version:1,boardId:issue.boardId,revision:issue.revision,scope,cards:cards.map((card,order)=>({id:card.id,title:card.title,order,kind:card.kind,readingId:`reading-${encodeURIComponent(card.id)}`,pageIds:issue.pages.filter(page=>page.sourceCardIds?.includes(card.id)||page.assetIds.some(id=>card.assetIds.includes(id))).map(page=>page.id),...(card.source?{source:{id:card.source.id,version:card.source.version,retrievedAt:card.source.retrievedAt,contentHash:card.source.contentHash}}:{})})),assets:ids.map(id=>{
    const metadata=asset(id),direct=pageIds(id,true),same=!direct.length&&metadata.hash?ids.find(other=>other!==id&&asset(other).hash===metadata.hash&&pageIds(other,true).length):undefined;
    return {id,...metadata,pageIds:same?pageIds(same,true):direct,representation:same?'same-image' as const:'image' as const,...(same?{representedBy:same}:{})};
  }),placements:layers.map(layer=>({id:layer.id,cardId:layer.cardId,assetId:layer.assetId,crop:[...layer.crop],rotation:layer.rotation,pageIds:pageIds(layer.assetId??layer.cardId??'',!!layer.assetId)})),excluded:{reason:scope==='guide'?'outside-guide':'private',cards:readAllCards(parts).length-cards.length}};
  issue.navigation=issue.spreads.map(spread=>({id:spread.id,title:spread.title,pageIds:[...spread.pageIds]}));
}
