import type {TripCard} from '@writers-board/core';

export interface CardDraft {title:string;body:string;travelerNote:string;day:string;time:string;scope:TripCard['scope'];}
export const sourceTextFor=(card:TripCard)=>card.sourceText??(card.provenance==='fcc'?card.body:undefined);
export const editsSourceNote=(card:TripCard)=>!!card.source&&card.provenance!=='agent';
export const sourceKey=(source:TripCard['source'])=>source?`${source.kind??'source'}:${source.id}`:undefined;
export const editedSourceCopy=(card:TripCard)=>editsSourceNote(card)&&card.sourceText&&card.body&&!card.sourceText.startsWith(card.body)?card.body:undefined;
export function cardEditInput(card:TripCard,draft:CardDraft){
  return {id:card.id,title:draft.title.trim()||card.title,day:draft.day||null,time:draft.time||null,scope:draft.scope,
    ...(editsSourceNote(card)?{travelerNote:draft.travelerNote}:{body:draft.body})};
}
export function sourceHref(value:string|undefined):string|undefined{
  if(!value)return;
  try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{/* An invalid source stays plain text. */}
}
const date=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
export function sourceDate(value:string|undefined){return value&&Number.isFinite(Date.parse(value))?date.format(new Date(value)):value??'Not provided';}
