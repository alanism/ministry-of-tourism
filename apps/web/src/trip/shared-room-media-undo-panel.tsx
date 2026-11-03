import{useEffect,useRef,useState,useSyncExternalStore}from'react';
import{SharedRoomRequestError,type SharedRoomServiceClient}from'./shared-room-client';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
import type{RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{createSharedRoomMediaUndo,type SharedRoomMediaUndo,type SharedRoomMediaUndoTarget,type SharedRoomMediaUndoView}from'./shared-room-media-undo-client';
import{downloadFileBytes}from'./file-handoff';
export interface SharedRoomMediaUndoPanelProps{
 active:boolean;client:SharedRoomServiceClient;room:RoomSnapshot;session:RoomRegisteredSession;target:SharedRoomMediaUndoTarget;
 onChanged:()=>void;onAccessUnavailable:()=>void;onRecoveryChange?:(data:unknown)=>void;onDiscard?:()=>void;
}
const empty:SharedRoomMediaUndoView={state:'ready'},noop=()=>()=>{};
export function SharedRoomMediaUndoPanel(props:SharedRoomMediaUndoPanelProps){
 const[resource,setResource]=useState<SharedRoomMediaUndo>(),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),current=useRef(props),held=useRef(resource),alive=useRef(true);current.current=props;held.current=resource;
 const capture=props.target.capture,receipt=props.target.receipt,scope=JSON.stringify([props.client.uid,props.room.roomId,props.session.id,props.session.membershipEpoch,receipt.operationId]),view=useSyncExternalStore(resource?.subscribe??noop,resource?.getSnapshot??(()=>empty),()=>empty);
 const supported=props.room.capabilities.includes('room-media-undo/1')&&props.room.capabilities.includes('room-media/1')&&capture.client===props.client&&capture.uid===props.client.uid&&capture.roomId===props.room.roomId&&capture.sessionId===props.session.id&&capture.membershipEpoch===props.session.membershipEpoch&&props.session.active&&props.session.uid===props.client.uid&&props.session.roomId===props.room.roomId&&props.room.principal.uid===props.client.uid&&props.room.principal.membershipEpoch===props.session.membershipEpoch&&['owner','editor'].includes(props.room.principal.role),fresh=props.room.cards.some(card=>card.payload.id===receipt.cardId&&card.version===receipt.version),busy=view.state==='preparing'||view.state==='pending';
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.onRecoveryChange?.(undefined);};},[]);
 useEffect(()=>{setResource(undefined);setConfirmed(false);setError('');},[scope,props.client]);
 useEffect(()=>()=>resource?.dispose(),[resource]);
 useEffect(()=>{if(!props.active||!supported)resource?.hide();else resource?.showPreview();},[props.active,supported,resource]);
 useEffect(()=>{props.onRecoveryChange?.(resource&&view.state!=='accepted'?resource.recoveryData():undefined);},[resource,view,props.onRecoveryChange]);
 const valid=(value:SharedRoomMediaUndo)=>alive.current&&held.current===value&&current.current.active&&current.current.client===capture.client&&current.current.target.receipt.operationId===value.context.undoOf&&current.current.room.roomId===value.context.roomId&&current.current.session.id===value.context.sessionId&&current.current.session.membershipEpoch===value.context.membershipEpoch;
 function failed(cause:unknown,value?:SharedRoomMediaUndo){if(!alive.current||!current.current.active||value&&!valid(value))return;setError(cause instanceof SharedRoomRequestError?cause.message:'Photo Undo could not be completed. Keep the prior PNG and recovery details.');if(cause instanceof SharedRoomRequestError&&cause.code==='unavailable')current.current.onAccessUnavailable();}
 async function prepare(){if(!supported||!fresh||!props.active||resource)return;let value:SharedRoomMediaUndo|undefined;try{value=createSharedRoomMediaUndo({client:props.client,room:props.room,session:props.session,target:props.target});held.current=value;setResource(value);setError('');setConfirmed(false);await value.prepare();}catch(cause){failed(cause,value);}}
 async function publish(retry=false){if(!resource||!props.active||!supported||busy||!retry&&(!fresh||!confirmed))return;const value=resource;try{setError('');if(retry)await value.retry();else await value.publish(confirmed);if(valid(value))current.current.onChanged();}catch(cause){failed(cause,value);}}
 if(!props.active)return null;
 return <section><h4>Undo your last photo change</h4><p>This session can {capture.previousAsset?'restore the exact prior photograph, caption and credit under a fresh image identity':'remove the photograph added by your accepted operation'}. A later card edit prevents this Undo. No cross-device Undo history is promised.</p>
  {!supported&&<p>Photo Undo is unavailable for this current account, session or service capability.</p>}
  {supported&&view.state==='ready'&&<button className="m-btn" disabled={!fresh} onClick={()=>void prepare()}>Review photo Undo</button>}
  {!fresh&&view.state!=='accepted'&&<p>The target card changed. Keep this local copy and review the current room; no automatic rebase is performed.</p>}
  {supported&&view.preview?.url&&<figure className="shared-room-media-image"><img src={view.preview.url} width={view.preview.asset.width} height={view.preview.asset.height} alt="Verified prior shared photograph for Undo"/><figcaption>{view.preview.asset.caption}</figcaption><p>{view.preview.asset.credit}</p></figure>}
  {supported&&view.state==='review'&&<><label><input type="checkbox" aria-label="Confirm reviewed photo Undo" checked={confirmed} disabled={!fresh} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed this exact photo Undo. Only the shown change should be reversed.</label><button className="m-btn" disabled={!fresh||!confirmed||busy} onClick={()=>void publish()}>Apply reviewed photo Undo</button></>}
  {resource&&<><p role="status">Photo Undo state: {view.state}{view.step?' · '+view.step:''}. {view.message}</p>{supported&&view.state==='uncertain'&&<button className="m-btn" disabled={busy} onClick={()=>void publish(true)}>Retry exact photo Undo</button>}{resource.hasPreviousBytes()&&<button className="m-btn small" disabled={busy} onClick={()=>{const bytes=resource.previousBytes();if(bytes)downloadFileBytes(bytes,'prior-shared-photo.png','image/png');}}>Download prior PNG recovery copy</button>}{!busy&&<button className="m-btn small" onClick={()=>{resource.dispose();held.current=undefined;setResource(undefined);setConfirmed(false);props.onRecoveryChange?.(undefined);props.onDiscard?.();}}>Discard session Undo copy</button>}</>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
