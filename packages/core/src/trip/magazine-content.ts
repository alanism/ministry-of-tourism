import type * as Y from 'yjs';
import {readAllCards,readPresentations,tripParts} from './model.ts';
import {escapeXml} from './magazine-style.ts';
import {recoverFccTitle} from './fcc-text.ts';
import type {Presentation,TripCard} from './schema.ts';
import type {MagazineDocument} from './magazine.ts';
import {magazineReadingText} from './magazine-markdown.ts';

export interface MagazineReading {id:string;title:string;day?:string;time?:string;source:boolean;body:string;note?:string;text:string;}
interface MaterialIssue {kind:'card'|'asset'|'placement';id:string;title?:string;reason:'outside-guide'|'board-only'|'outside-copy'|'placement-not-rendered'|'image-not-rendered';}
export interface MagazineSelection {
  version:1;boardId:string;revision:number;scope:'personal'|'guide'|'stay';
  cards:{id:string;title:string;order:number;kind:string;readingId:string;pageIds:string[];source?:{id:string;version?:string;retrievedAt:string;contentHash?:string}}[];
  assets:{id:string;hash?:string;caption?:string;credit?:string;source?:{id:string;version?:string;retrievedAt:string;contentHash?:string};pageIds:string[];representation:'image'|'same-image';representedBy?:string}[];
  placements:{id:string;cardId?:string;assetId?:string;crop:number[];rotation:number;pageIds:string[]}[];
  excluded:{reason:'private'|'outside-guide';cards:number};
  selectionRule?:string;
  excludedItems?:MaterialIssue[];
  privateExcluded?:{cards:number;placements:number};
  outsideScopeExcluded?:{cards:number;placements:number};
  unresolved?:MaterialIssue[];
}
/** The same plain-language accounting is displayed in preview and the portable reading. */
export function magazineSelectionSummary(selection:MagazineSelection):string[]{
  const lines=[selection.selectionRule??'Saved material permitted by this copy’s scope.',`${selection.cards.length} selected cards with complete reading text · ${selection.assets.length} selected images · ${selection.placements.length} selected magazine placements.`];
  const excluded=selection.excludedItems??[],hidden=selection.privateExcluded;
  if(excluded.length)lines.push(`${excluded.length} other saved items are excluded from this output: ${excluded.filter(item=>item.reason==='board-only').length} board-only placements; ${excluded.filter(item=>item.reason!=='board-only').length} outside this copy’s scope.`);
  if(hidden&&(hidden.cards||hidden.placements))lines.push(`${hidden.cards} private cards and ${hidden.placements} private placements excluded; their identities and content are not included.`);
  const outside=selection.outsideScopeExcluded;if(outside&&(outside.cards||outside.placements))lines.push(`${outside.cards} cards and ${outside.placements} placements outside this copy’s scope are excluded without their identities or content.`);
  for(const item of selection.unresolved??[])lines.push(`${item.title??item.id}: ${item.reason==='placement-not-rendered'?'this placement is not rendered. Open Composition and remove the extra placement or use a distinct saved image.':'this selected image is not rendered. Restore its bytes or remove it from the selected item in Composition.'}`);
  return lines;
}
/** An allowlisted projection of the selected snapshot, never a serialized live document. */
export function magazineContent(doc:Y.Doc,issue:MagazineDocument,cards:TripCard[],layers:Presentation[],scope:MagazineSelection['scope']):void{
  const parts=tripParts(doc),pageIds=(id:string,asset=false)=>issue.pages.filter(page=>(asset?page.assetIds:page.sourceCardIds??[]).includes(id)).map(page=>page.id);
  // Legacy rendering can read older asset records; project only independently valid scalar fields.
  const asset=(id:string)=>{const value=parts.assets.get(id),hash=value?.get('hash'),caption=value?.get('caption'),credit=value?.get('credit'),raw=value?.get('source') as Record<string,unknown>|undefined;const source=raw&&typeof raw.id==='string'&&typeof raw.retrievedAt==='string'?{id:raw.id,retrievedAt:raw.retrievedAt,...(typeof raw.version==='string'?{version:raw.version}:{}),...(typeof raw.contentHash==='string'?{contentHash:raw.contentHash}:{})}:undefined;return {hash:typeof hash==='string'&&/^[a-f\d]{64}$/.test(hash)?hash:undefined,caption:typeof caption==='string'?caption:undefined,credit:typeof credit==='string'?credit:undefined,...(source?{source}:{})};};
  cards=cards.map(card=>card.provenance==='fcc'||card.source?.provider==='fcc'?{...card,title:recoverFccTitle(card.title)}:card);
  const source=(card:TripCard)=>card.provenance==='fcc'||card.source?.kind==='article';
  issue.reading=cards.slice().sort((a,b)=>Number(source(a))-Number(source(b))||Number(b.kind==='brief')-Number(a.kind==='brief')).map(card=>({id:card.id,title:card.title,...(card.day?{day:card.day}:{}),...(card.time?{time:card.time}:{}),source:source(card),body:card.body,...(card.travelerNote?{note:card.travelerNote}:{}),text:magazineReadingText(card.body)+(card.travelerNote?'\nYour note\n'+magazineReadingText(card.travelerNote):'')}));
  const ids=[...new Set([...cards.flatMap(card=>card.assetIds),...layers.flatMap(layer=>layer.assetId?[layer.assetId]:[]),...issue.pages.flatMap(page=>page.assetIds)])];
  issue.selection={version:1,boardId:issue.boardId,revision:issue.revision,scope,cards:cards.map((card,order)=>({id:card.id,title:card.title,order,kind:card.kind,readingId:`reading-${encodeURIComponent(card.id)}`,pageIds:issue.pages.filter(page=>page.sourceCardIds?.includes(card.id)||page.assetIds.some(id=>card.assetIds.includes(id))).map(page=>page.id),...(card.source?{source:{id:card.source.id,version:card.source.version,retrievedAt:card.source.retrievedAt,contentHash:card.source.contentHash}}:{})})),assets:ids.map(id=>{
    const metadata=asset(id),direct=pageIds(id,true),same=!direct.length&&metadata.hash?ids.find(other=>other!==id&&asset(other).hash===metadata.hash&&pageIds(other,true).length):undefined;
    return {id,...metadata,pageIds:same?pageIds(same,true):direct,representation:same?'same-image' as const:'image' as const,...(same?{representedBy:same}:{})};
  }),placements:layers.map(layer=>({id:layer.id,cardId:layer.cardId,assetId:layer.assetId,crop:[...layer.crop],rotation:layer.rotation,pageIds:issue.pages.filter(page=>page.svg.includes(`data-placement="${escapeXml(layer.id)}"`)).map(page=>page.id)})),excluded:{reason:scope==='guide'?'outside-guide':'private',cards:readAllCards(parts).length-cards.length}};
  const allCards=readAllCards(parts),allLayers=readPresentations(parts),selectedCards=new Set(cards.map(card=>card.id)),selectedLayers=new Set(layers.map(layer=>layer.id));
  const privateCards=new Set(allCards.filter(card=>card.scope==='private').map(card=>card.id)),privateLayer=(layer:Presentation)=>layer.scope==='private'||!!(layer.cardId&&privateCards.has(layer.cardId));
  const permittedLayer=(layer:Presentation)=>scope==='personal'||(!privateLayer(layer)&&(scope!=='guide'||layer.scope==='guide')&&(!layer.cardId||selectedCards.has(layer.cardId)));
  const excludedItems:MaterialIssue[]=[];
  for(const layer of allLayers)if(!selectedLayers.has(layer.id)&&permittedLayer(layer))excludedItems.push({kind:'placement',id:layer.id,reason:layer.surface==='board'?'board-only':'outside-copy'});
  const unresolved:MaterialIssue[]=[...issue.selection.assets.filter(item=>!item.pageIds.length).map(item=>({kind:'asset' as const,id:item.id,title:item.caption,reason:'image-not-rendered' as const})),...issue.selection.placements.filter(item=>!item.pageIds.length).map(item=>({kind:'placement' as const,id:item.id,reason:'placement-not-rendered' as const}))];
  Object.assign(issue.selection,{selectionRule:'All saved cards permitted by this copy’s scope, eligible magazine placements, and explicitly saved apparel. Memory reactions do not change magazine selection.',excludedItems,privateExcluded:{cards:scope==='personal'?0:privateCards.size,placements:scope==='personal'?0:allLayers.filter(privateLayer).length},outsideScopeExcluded:{cards:allCards.filter(card=>!selectedCards.has(card.id)&&!privateCards.has(card.id)).length,placements:allLayers.filter(layer=>!permittedLayer(layer)&&!privateLayer(layer)).length},unresolved});
  if(unresolved.length)issue.warnings.push(`${unresolved.length} selected items are unresolved. Open Composition and review inclusion details before exporting HTML.`);
  issue.navigation=issue.spreads.map(spread=>({id:spread.id,title:spread.title,pageIds:[...spread.pageIds]}));
}
