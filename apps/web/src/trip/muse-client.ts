import { z } from 'zod';
import { buildMuseRequest, createDiagnostic, diagnosticText, parseMuseOutput, type DiagnosticErrorClass, type DiagnosticReceipt, type FccCityContent, type TripSession } from '@writers-board/core';
const receiptSchema=z.object({requestId:z.string().min(1).max(200),modelId:z.string().min(1).max(200),date:z.string().min(1),latencyMs:z.number().optional(),usage:z.unknown().optional()});
export type MuseFailureCode='invalid_request'|'invalid_response'|'rate_limited'|'provider_unavailable'|'timeout'|'cancelled'|'busy'|'unavailable'|'network'|'stale';
const failureMessages:Record<MuseFailureCode,string>={invalid_request:'This request exceeds the input limit. Nothing was sent. Choose fewer cards or a shorter request.',invalid_response:'Muse returned an invalid answer. Nothing changed. Try again.',rate_limited:'The Muse limit is reached for now. Nothing changed. Try later or plan by hand.',provider_unavailable:'Muse returned an error. Nothing changed. Try again or continue manually.',timeout:'Muse did not answer in time. Nothing changed. Try again or ask for less.',cancelled:'Stopped. Nothing changed; a late answer will not be added.',busy:'A Muse request is already active. Nothing changed. Wait or plan by hand.',unavailable:'Muse is not connected. Board, FCC, art and export still work.',network:'The connection to the MoT server failed. Nothing changed. Try again.',stale:'The trip changed while Muse was working. Nothing was added. Ask again with the current revision.'};
const diagnosticClasses:Record<MuseFailureCode,DiagnosticErrorClass>={invalid_request:'invalid_input',invalid_response:'failed',rate_limited:'rate_limited',provider_unavailable:'unavailable',timeout:'timed_out',cancelled:'cancelled',busy:'unavailable',unavailable:'unavailable',network:'network',stale:'failed'};
export class MuseRequestError extends Error {
 readonly code:MuseFailureCode;
 readonly diagnostic:DiagnosticReceipt&{latencyMs:number};
 constructor(code:MuseFailureCode,context:{boardId:string;revision:number;startedAt?:string;receipt?:unknown;message?:string}){
  super(context.message??failureMessages[code]);this.name='MuseRequestError';this.code=code;
  const remote=receiptSchema.safeParse(context.receipt),startedAt=context.startedAt??new Date().toISOString();
  const latency=remote.success?remote.data.latencyMs:undefined;
  this.diagnostic={...createDiagnostic({requestId:remote.success?remote.data.requestId:crypto.randomUUID(),operation:'muse.proposal',boardId:context.boardId,revision:context.revision,appVersion:'mot-web',errorClass:diagnosticClasses[code],startedAt}),latencyMs:typeof latency==='number'&&Number.isFinite(latency)&&latency>=0?latency:Math.max(0,Date.now()-Date.parse(startedAt))};
 }
}
/** Re-project on copying: neither error messages nor arbitrary receipt fields may leave the UI. */
export function museDiagnosticText(error:MuseRequestError):string{
 const clean=JSON.parse(diagnosticText(error.diagnostic)),latency=error.diagnostic.latencyMs;
 return JSON.stringify({...clean,latencyMs:Number.isFinite(latency)&&latency>=0?latency:0},null,2);
}
export type MusePhase='sending'|'waiting'|'validating'|'ready';
export async function requestMuseProposal(session:TripSession,selection:{prompt:string;cardIds:string[]},content?:FccCityContent,signal?:AbortSignal,fetcher:typeof fetch=fetch,onPhase?:(phase:MusePhase)=>void) {
  const boardId=session.boardId,revision=session.boardRev,startedAt=new Date().toISOString(),context={boardId,revision,startedAt};
  if(signal?.aborted)throw new MuseRequestError('cancelled',context);
  const request=buildMuseRequest(session,{...selection,cityContent:content});
  if(!request.prompt.trim()||request.prompt.length>8000)throw new MuseRequestError('invalid_request',{...context,message:'Use a request of 1–8,000 characters. Nothing was sent.'});
  const body=JSON.stringify(request);
  if(request.cards.length>40||request.assetIds.length>100||new TextEncoder().encode(body).length>96000)throw new MuseRequestError('invalid_request',{...context,message:'This request exceeds the server input limit. Choose fewer cards or a shorter request. Nothing was sent.'});
  const token=session.token(request.cards.map(card=>card.id));
  onPhase?.('sending');
  let response:Response;
  try{const pending=fetcher('/api/muse/propose',{method:'POST',headers:{'content-type':'application/json','x-mot-request':'1'},body,signal,credentials:'same-origin'});onPhase?.('waiting');response=await pending;}
  catch{throw new MuseRequestError(signal?.aborted?'cancelled':'network',context);}
  let result:{status?:string;reason?:string;error?:{code?:string;message?:string};proposal?:unknown;receipt?:unknown};
  try{const raw:unknown=await response.json();if(!raw||typeof raw!=='object')throw Error();result=raw as typeof result;}
  catch{throw new MuseRequestError(signal?.aborted?'cancelled':'invalid_response',context);}
  if(signal?.aborted)throw new MuseRequestError('cancelled',context);
  if(session.boardId!==boardId||session.boardRev!==revision)throw new MuseRequestError('stale',context);
  if(result.status==='unavailable')throw new MuseRequestError('unavailable',{...context,message:typeof result.reason==='string'?result.reason:undefined});
  if(!response.ok||result.status!=='ok'){
   const code=result.error?.code;
   const known=typeof code==='string'&&Object.hasOwn(failureMessages,code)?code as MuseFailureCode:response.status===429?'rate_limited':'provider_unavailable';
   throw new MuseRequestError(known,{...context,receipt:result.receipt});
  }
  const parsedReceipt=receiptSchema.safeParse(result.receipt);
  if(!parsedReceipt.success)throw new MuseRequestError('invalid_response',context);
  const receipt=parsedReceipt.data;
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
