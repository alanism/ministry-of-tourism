import { z } from 'zod';
import { buildMuseRequest, parseMuseOutput, type FccCityContent, type TripSession } from '@writers-board/core';
const receiptSchema=z.object({requestId:z.string().min(1).max(200),modelId:z.string().min(1).max(200),date:z.string().min(1),latencyMs:z.number().optional(),usage:z.unknown().optional()});
export type MusePhase='sending'|'waiting'|'validating'|'ready';
export async function requestMuseProposal(session:TripSession,selection:{prompt:string;cardIds:string[]},content?:FccCityContent,signal?:AbortSignal,fetcher:typeof fetch=fetch,onPhase?:(phase:MusePhase)=>void) {
  signal?.throwIfAborted();
  const boardId=session.boardId,revision=session.boardRev;
  const request=buildMuseRequest(session,{...selection,cityContent:content});
  if(!request.prompt.trim()||request.prompt.length>8000)throw new Error('Use a request of 1–8,000 characters. Nothing was sent.');
  const body=JSON.stringify(request);
  if(request.cards.length>40||request.assetIds.length>100||new TextEncoder().encode(body).length>96000)throw new Error('This request exceeds the server input limit. Choose fewer cards or a shorter request. Nothing was sent.');
  const token=session.token(request.cards.map(card=>card.id));
  onPhase?.('sending');
  const pending=fetcher('/api/muse/propose',{method:'POST',headers:{'content-type':'application/json','x-mot-request':'1'},body,signal,credentials:'same-origin'});
  onPhase?.('waiting');
  const response=await pending;
  const result=await response.json() as {status?:string;reason?:string;error?:{message?:string};proposal?:unknown;receipt?:unknown};
  signal?.throwIfAborted();
  if(session.boardId!==boardId||session.boardRev!==revision)throw new Error('The trip changed while Muse was working. Ask again with the current revision.');
  if(result.status==='unavailable')throw new Error(result.reason??'Muse is unavailable. Continue manually.');
  if(!response.ok||result.status!=='ok')throw new Error(result.error?.message??'Muse could not return a proposal. Retry or continue manually.');
  const receipt=receiptSchema.parse(result.receipt);
  onPhase?.('validating');
  const proposal=parseMuseOutput(result.proposal,session,token);
  const sources=new Map((content?.articles??[]).map(article=>[article.source.id,article.source]));
  for(const source of proposal.sources){const known=sources.get(source.id);if(!known||(source.url&&source.url!==known.canonicalUrl)||source.retrievedAt!==known.retrievedAt)throw new Error('Muse cited a source outside the selected issue or its saved date. Nothing changed.');source.url=known.canonicalUrl;}
  for(const op of proposal.ops){
    const source=op.input.source as {id?:string;url?:string;canonicalUrl?:string;retrievedAt?:string}|undefined;
    if(!source)continue;
    const known=source.id?sources.get(source.id):undefined;
    if(!known||!proposal.sources.some(cite=>cite.id===known.id)||(source.url&&source.url!==known.canonicalUrl)||(source.canonicalUrl&&source.canonicalUrl!==known.canonicalUrl)||source.retrievedAt!==known.retrievedAt)throw new Error('A suggestion cited an invalid source. Nothing changed.');
    op.input.source={...known};
  }
  onPhase?.('ready');
  return {proposal,receipt,revision,grounding:request.grounding.level};
}
