import { z } from 'zod';
import { buildMuseRequest, parseMuseOutput, readAllCards, type FccCityContent, type TripSession } from '@writers-board/core';
const receiptSchema=z.object({requestId:z.string().min(1).max(200),modelId:z.string().min(1).max(200),date:z.string().min(1),latencyMs:z.number().optional(),usage:z.unknown().optional()});
export async function requestMuseProposal(session:TripSession,selection:{prompt:string;cardIds:string[]},content?:FccCityContent,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
  const boardId=session.boardId,revision=session.boardRev,token=session.token(readAllCards(session.parts).filter(card=>card.scope!=='private').map(card=>card.id));
  const request=buildMuseRequest(session,{...selection,cityContent:content});
  const response=await fetcher('/api/muse/propose',{method:'POST',headers:{'content-type':'application/json','x-mot-request':'1'},body:JSON.stringify(request),signal,credentials:'same-origin'});
  const result=await response.json() as {status?:string;reason?:string;error?:{message?:string};proposal?:unknown;receipt?:unknown};
  signal?.throwIfAborted();
  if(session.boardId!==boardId||session.boardRev!==revision)throw new Error('The trip changed while Muse was working. Ask again with the current revision.');
  if(result.status==='unavailable')throw new Error(result.reason??'Muse is unavailable. Continue manually.');
  if(!response.ok||result.status!=='ok')throw new Error(result.error?.message??'Muse could not return a proposal. Retry or continue manually.');
  const receipt=receiptSchema.parse(result.receipt);
  const proposal=parseMuseOutput(result.proposal,session,token);
  const sources=new Map((content?.articles??[]).map(article=>[article.source.id,article.source]));
  for(const source of proposal.sources){const known=sources.get(source.id);if(content&&(!known||(source.url&&source.url!==known.canonicalUrl)))throw new Error('Muse cited a source outside the selected issue. Nothing changed.');}
  return {proposal,receipt,revision,grounding:request.grounding.level};
}
