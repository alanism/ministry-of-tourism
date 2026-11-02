import{useSyncExternalStore}from'react';
import type{SharedRoomSessionAccess}from'./shared-room-session-access';
import type{SharedRoomServiceClient}from'./shared-room-client';
export interface SharedRoomSessionControlsProps{access:SharedRoomSessionAccess;onReady:(client:SharedRoomServiceClient,roomId:string)=>void;onClosed:()=>void;onError:(cause:unknown)=>void;}
export function SharedRoomSessionControls(props:SharedRoomSessionControlsProps){
 const{access}=props,view=useSyncExternalStore(access.subscribe,access.getSnapshot,access.getSnapshot),blocked=view.state==='pending';
 const settled=(client?:SharedRoomServiceClient)=>{const held=access.getSnapshot().session;if(client&&held)props.onReady(client,held.roomId);else if(!held)props.onClosed();};
 return <section><h3>Your registered room sessions</h3><p>Session memory only. This is a service registration, not physical-device verification. Signing in or refreshing does not publish your private trip.</p>{view.roomId&&<p>Room {view.roomId} · {view.state}.</p>}{view.message&&<p role="status">{view.message}</p>}
  {view.session&&<p>Current registered session: {view.session.id} · membership epoch {view.session.membershipEpoch}.</p>}
  {view.state==='limit'&&<p role="alert">Three current sessions are already registered. Explicitly revoke one, then open the room again. No session is replaced automatically.</p>}
  {view.sessions.map(record=><article key={record.id}><p>Own session {record.id} · created {new Date(record.createdAt).toISOString()} · epoch {record.membershipEpoch}.</p><button className="m-btn small" disabled={blocked||!!view.pending} onClick={()=>void access.revoke(record.id).then(()=>settled()).catch(props.onError)}>Revoke this own session</button></article>)}
  {view.roomId&&<button className="m-btn small" disabled={blocked||!!view.pending} onClick={()=>void access.inspect().then(()=>settled()).catch(props.onError)}>Check own registered sessions</button>}
  {view.pending&&<><p>Exact {view.pending.kind} request retained · operation {view.pending.request.operationId}. No automatic rebase or retry.</p>{view.state==='uncertain'&&<button className="m-btn" disabled={blocked} onClick={()=>void access.retry().then(settled).catch(props.onError)}>Retry exact session request</button>}{!blocked&&<button className="m-btn small" onClick={()=>access.discard()}>Discard local session retry context</button>}</>}
 </section>;
}
