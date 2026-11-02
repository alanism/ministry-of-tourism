import{useEffect,useRef,useState}from'react';
import type{z}from'zod';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
import type{RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{roomTransferOperationId,type roomTransferOfferRequestSchema,type roomTransferAcceptRequestSchema,type roomTransferCancelRequestSchema,type roomTransferListSchema}from'../../../../packages/core/src/trip/shared-room-transfer-wire';
import{SharedRoomRequestError,type SharedRoomServiceClient}from'./shared-room-client';

export interface SharedRoomTransferPanelProps{active:boolean;client:SharedRoomServiceClient;roomId:string;room?:RoomSnapshot;session?:RoomRegisteredSession;onChanged:()=>void;onAccessUnavailable:()=>void;onRecoveryChange?:(data:unknown)=>void;}
type OfferRequest=z.infer<typeof roomTransferOfferRequestSchema>;type AcceptRequest=z.infer<typeof roomTransferAcceptRequestSchema>;type CancelRequest=z.infer<typeof roomTransferCancelRequestSchema>;
type Pending={kind:'offer';request:OfferRequest}|{kind:'accept';request:AcceptRequest}|{kind:'cancel';request:CancelRequest};
type Status='idle'|'pending'|'uncertain'|'unavailable'|'rejected';
type Listing=z.infer<typeof roomTransferListSchema>;
const message=(e:unknown)=>e instanceof SharedRoomRequestError?e.message:'Transfer could not be confirmed. Keep the exact recovery request and inspect current room access.';
const context=(p:SharedRoomTransferPanelProps)=>!!p.active&&!!p.room&&!!p.session&&p.room.capabilities.includes('room-transfer/1')&&p.room.roomId===p.roomId&&p.room.principal.uid===p.client.uid&&p.session.roomId===p.roomId&&p.session.uid===p.client.uid&&p.session.active&&p.session.membershipEpoch===p.room.principal.membershipEpoch;
/** Explicit bilateral confirmation only. No token decoding, inferred owner state, automatic retry or session registration. */
export function SharedRoomTransferPanel(props:SharedRoomTransferPanelProps){
 const current=useRef(props);current.current=props;
 const live=useRef(false),generation=useRef(0),controller=useRef<AbortController|undefined>(undefined),busyRef=useRef(false),held=useRef<Pending|undefined>(undefined);
 const[list,setList]=useState<Listing>(),[receivedAt,setReceivedAt]=useState(0),[,setClock]=useState(0),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending>(),[status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[recipient,setRecipient]=useState(''),[formerRole,setFormerRole]=useState<''|'editor'|'viewer'|'respondent'>(''),[offerConfirmed,setOfferConfirmed]=useState(false),[receivedConfirmed,setReceivedConfirmed]=useState(false),[cancelConfirmed,setCancelConfirmed]=useState(false),[recoveredConfirmed,setRecoveredConfirmed]=useState(false);
 const resetConfirmation=()=>{setOfferConfirmed(false);setReceivedConfirmed(false);setCancelConfirmed(false);setRecoveredConfirmed(false);};
 const recovery=(action:Pending|undefined)=>current.current.onRecoveryChange?.(action?{schema:'mot-room-transfer-recovery/1',uid:current.current.client.uid,roomId:action.request.roomId,kind:action.kind,request:structuredClone(action.request)}:undefined);
 useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;controller.current?.abort();};},[]);
 useEffect(()=>{held.current=undefined;setPending(undefined);setStatus('idle');setRecipient('');setFormerRole('');setNotice('');setError('');recovery(undefined);},[props.client.uid,props.roomId]);
 useEffect(()=>{generation.current++;controller.current?.abort();busyRef.current=false;setBusy(false);setList(undefined);resetConfirmation();if(held.current){setStatus(value=>value==='pending'?'uncertain':value);recovery(held.current);}},[props.active,props.client,props.roomId,props.session?.id,props.session?.membershipEpoch,props.room?.principal.membershipEpoch,props.room?.principal.role]);
 useEffect(()=>{if(!list)return;const elapsed=Math.max(0,Date.now()-receivedAt),remaining=300000-(list.serverTime-list.authenticatedAt)-elapsed;const timer=setTimeout(()=>setClock(value=>value+1),Math.max(0,remaining+1));return()=>clearTimeout(timer);},[list,receivedAt]);
 const safe=(epoch:number,client:SharedRoomServiceClient)=>live.current&&generation.current===epoch&&current.current.active&&current.current.client===client;
 const serverNow=list?list.serverTime+Math.max(0,Date.now()-receivedAt):0,fresh=!!list&&serverNow>=list.authenticatedAt&&serverNow-list.authenticatedAt<=300000,ready=context(props),owner=ready&&props.room!.principal.role==='owner';
 const row=list?.offers[0],incoming=!!row&&row.offer.recipientUid===props.client.uid,offerFresh=!!row&&serverNow>=row.offer.ownerAuthenticatedAt&&serverNow-row.offer.ownerAuthenticatedAt<=300000;
 const sameContext=!!pending&&ready&&pending.request.sessionId===props.session!.id&&pending.request.membershipEpoch===props.session!.membershipEpoch;
 const recoveredContext=!!pending&&pending.kind==='accept'&&ready&&props.room!.principal.role==='owner'&&props.session!.membershipEpoch===pending.request.membershipEpoch+1;
 const retryAllowed=!!pending&&!busy&&['uncertain','unavailable'].includes(status)&&(sameContext||recoveredContext&&recoveredConfirmed);
 async function refresh(){
  if(!context(current.current)||busyRef.current)return;const p=current.current,epoch=generation.current,client=p.client,abort=new AbortController();controller.current=abort;busyRef.current=true;setBusy(true);setError('');
  try{const result=await client.transfers(p.roomId,abort.signal);if(!safe(epoch,client))return;setList(result);setReceivedAt(Date.now());resetConfirmation();}
  catch(e){if(safe(epoch,client)){setError(message(e));if(e instanceof SharedRoomRequestError&&e.code==='unavailable')current.current.onAccessUnavailable();}}
  finally{if(safe(epoch,client)){busyRef.current=false;setBusy(false);}}
 }
 async function deliver(action:Pending,epoch:number,client:SharedRoomServiceClient){
  if(!safe(epoch,client))return;const abort=new AbortController();controller.current=abort;held.current=action;setPending(action);setStatus('pending');setError('');recovery(action);
  try{
   const result=action.kind==='offer'?await client.offerTransfer(action.request,abort.signal):action.kind==='accept'?await client.acceptTransfer(action.request,abort.signal):await client.cancelTransfer(action.request,abort.signal);
   if(!safe(epoch,client))return;held.current=undefined;setPending(undefined);setStatus('idle');setList(undefined);resetConfirmation();recovery(undefined);
   setNotice(action.kind==='accept'?'Transfer receipt confirmed. Check your own registered sessions and explicitly open the room again; this receipt is not a live owner view.':`Transfer ${action.kind==='offer'?'offer':'cancellation'} accepted${result.replayed?' with the same receipt':''}. Check current transfer state.`);
   if(action.kind==='accept')current.current.onAccessUnavailable();else current.current.onChanged();
  }catch(e){if(safe(epoch,client)){setStatus(e instanceof SharedRoomRequestError&&e.code==='unavailable'?'unavailable':e instanceof SharedRoomRequestError&&['network','cancelled','invalid-response'].includes(e.code)?'uncertain':'rejected');setError(message(e));if(e instanceof SharedRoomRequestError&&e.code==='unavailable')current.current.onAccessUnavailable();}}
  finally{if(safe(epoch,client)){busyRef.current=false;setBusy(false);}}
 }
 async function prepare(kind:Pending['kind']){
  if(busyRef.current||held.current||!ready||!list)return;
  if(kind==='offer'&&(!owner||!fresh||!offerConfirmed||!formerRole||recipient===props.client.uid||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(recipient)))return;
  if(kind==='accept'&&(!incoming||!fresh||!offerFresh||!receivedConfirmed)||kind==='cancel'&&(!owner||!row||row.offer.ownerUid!==props.client.uid||!cancelConfirmed))return;
  const epoch=generation.current,client=props.client,base={roomId:props.roomId,schemaMajor:1 as const,capability:'room-transfer/1' as const,sessionId:props.session!.id,membershipEpoch:props.session!.membershipEpoch};busyRef.current=true;setBusy(true);
  try{
   let action:Pending;
   if(kind==='offer'){const intent={...base,baseVersion:list.admissionVersion,recipientUid:recipient,formerOwnerRole:formerRole as 'editor'|'viewer'|'respondent',ownerAuthenticatedAt:list.authenticatedAt,confirmed:true as const};action={kind,request:{...intent,operationId:await roomTransferOperationId(client.uid,'transfer-offer',intent)}};}
   else if(kind==='accept'){const intent={...base,baseVersion:row!.version,offerId:row!.offer.offerId,formerOwnerRole:row!.offer.formerOwnerRole,confirmed:true as const};action={kind,request:{...intent,operationId:await roomTransferOperationId(client.uid,'transfer-accept',intent)}};}
   else{const intent={...base,baseVersion:row!.version,offerId:row!.offer.offerId};action={kind,request:{...intent,operationId:await roomTransferOperationId(client.uid,'transfer-cancel',intent)}};}
   await deliver(action,epoch,client);
  }catch(e){if(safe(epoch,client)){setError(message(e));busyRef.current=false;setBusy(false);}}
 }
 async function retry(){if(!retryAllowed||!held.current||busyRef.current)return;busyRef.current=true;setBusy(true);await deliver(held.current,generation.current,props.client);}
 if(!props.active)return null;
 const blocked=busy||!!pending;
 return<section><h3>Transfer room ownership</h3><p>Both accounts must explicitly confirm while freshly authenticated within five minutes. The recipient must already be a current room member. No automatic successor or household voting authority is created.</p>
  <p>Account UID: {props.client.uid} · room {props.roomId}. {!ready?'Open a current registered room session with ownership transfer support to inspect or confirm a transfer.':''}</p>
  <button className="m-btn" disabled={!ready||busy} onClick={()=>void refresh()}>Check ownership transfer</button>
  {list&&<p>Verified server authentication: {new Date(list.authenticatedAt).toISOString()}. {!fresh?'Authenticate again, reopen the registered session and check the transfer before confirming.':'The service will recheck both authentication deadlines at acceptance.'}</p>}
  {owner&&<fieldset disabled={blocked||!list||!fresh}><legend>Offer ownership to a current member</legend><label>Recipient account UID<input className="m-field" aria-label="Recipient account UID" value={recipient} maxLength={200} onChange={e=>{setRecipient(e.target.value);setOfferConfirmed(false);}}/></label><label>Your role after transfer<select className="m-field" aria-label="Former owner role" value={formerRole} onChange={e=>{setFormerRole(e.target.value as typeof formerRole);setOfferConfirmed(false);}}><option value="">Choose explicitly</option><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="respondent">Household respondent</option></select></label><p>Transfer {props.client.uid} → {recipient||'no recipient selected'}; your resulting role: {formerRole||'not selected'}. Respondent grants no new household assignment.</p><label><input type="checkbox" aria-label="Confirm exact transfer offer" checked={offerConfirmed} onChange={e=>setOfferConfirmed(e.target.checked)}/>I confirm this exact recipient UID and my resulting role.</label><button className="m-btn" disabled={blocked||!fresh||!offerConfirmed||!formerRole||!recipient||recipient===props.client.uid} onClick={()=>void prepare('offer')}>Confirm transfer offer</button></fieldset>}
  {row&&<article><p>Offer {row.offer.offerId}: owner {row.offer.ownerUid} → recipient {row.offer.recipientUid}. Former owner becomes {row.offer.formerOwnerRole}. Current recipient role: {row.offer.recipientRole}.</p>{incoming&&<><label><input type="checkbox" aria-label="Confirm received transfer" disabled={blocked} checked={receivedConfirmed} onChange={e=>setReceivedConfirmed(e.target.checked)}/>I accept ownership from this exact UID and confirm the former owner's displayed role.</label><button className="m-btn" disabled={blocked||!ready||!fresh||!offerFresh||!receivedConfirmed} onClick={()=>void prepare('accept')}>Accept this ownership transfer</button></>}{owner&&row.offer.ownerUid===props.client.uid&&<><label><input type="checkbox" aria-label="Confirm transfer cancellation" disabled={blocked} checked={cancelConfirmed} onChange={e=>setCancelConfirmed(e.target.checked)}/>I want to cancel this exact offer.</label><button className="m-btn" disabled={blocked||!cancelConfirmed} onClick={()=>void prepare('cancel')}>Cancel this transfer offer</button></>}</article>}
  {busy&&<p role="status">Transfer request pending. Ownership is not assumed.</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  {pending&&<section><h4>Exact transfer request retained · {status}</h4><p>{pending.kind} · operation {pending.request.operationId}. No automatic retry, changed confirmation or new request is sent.</p>{recoveredContext&&!sameContext&&<label><input type="checkbox" aria-label="Confirm recovered owner context" checked={recoveredConfirmed} disabled={busy} onChange={e=>setRecoveredConfirmed(e.target.checked)}/>I inspected this account's current owner view and new registered session. Check only the original acceptance receipt.</label>}<button className="m-btn" disabled={!retryAllowed} onClick={()=>void retry()}>Retry exact transfer request</button><button className="m-btn small" disabled={busy} onClick={()=>{held.current=undefined;setPending(undefined);setStatus('idle');setList(undefined);resetConfirmation();recovery(undefined);setNotice('Local retry context discarded. Any accepted server transfer remains; inspect current access.');}}>Discard local transfer retry context</button></section>}
 </section>;
}
