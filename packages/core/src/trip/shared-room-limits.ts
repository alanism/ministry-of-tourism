import {canonicalFileJson} from './file-exchange-json.ts';

const MiB=1024*1024,minute=60000;
export interface RoomSnapshotAsset {id:string;hash:string;bytes:number;[key:string]:unknown;}
/** Already validated fresh public projection, never an unfiltered room/admin document. */
export interface RoomPublicSnapshot {metadata:unknown;cards:readonly unknown[];presentations:readonly unknown[];assets:RoomSnapshotAsset[];}
export interface RoomReferencedMedia {assetId:string;hash:string;bytes:number;}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
/** Reconcile actual referenced objects each transaction; no previous counter or hash-wide permission/dedup. */
export function measureRoomSnapshot(snapshot:RoomPublicSnapshot,media:readonly RoomReferencedMedia[]){
 if(!snapshot||Object.keys(snapshot).sort().join(',')!=='assets,cards,metadata,presentations'||!Array.isArray(snapshot.cards)||!Array.isArray(snapshot.presentations)||!Array.isArray(snapshot.assets)||!Array.isArray(media))throw Error('Use the exact public room snapshot');
 const objectCount=snapshot.cards.length+snapshot.presentations.length;
 if(objectCount>500||snapshot.assets.length>200||media.length!==snapshot.assets.length)throw Error('Room object or media capacity/binding mismatch');
 const assets=new Map<string,RoomSnapshotAsset>();
 for(const asset of snapshot.assets){
  if(!asset||!validId(asset.id)||assets.has(asset.id)||typeof asset.hash!=='string'||!/^[a-f0-9]{64}$/.test(asset.hash)||!integer(asset.bytes)||asset.bytes<1||asset.bytes>10*MiB)throw Error('Invalid room asset identity or file limit');
  assets.set(asset.id,asset);
 }
 let mediaBytes=0;const seen=new Set<string>();
 for(const descriptor of media){
  const asset=assets.get(descriptor.assetId);
  if(!asset||seen.has(descriptor.assetId)||descriptor.hash!==asset.hash||descriptor.bytes!==asset.bytes)throw Error('Referenced room media does not match its verified bytes');
  seen.add(descriptor.assetId);mediaBytes+=descriptor.bytes;
 }
 const metadataBytes=new TextEncoder().encode(canonicalFileJson(snapshot)).length,totalBytes=metadataBytes+mediaBytes;
 if(totalBytes>50*MiB)throw Error('Room snapshot exceeds50MiB; preserve local draft');
 return{metadataBytes,mediaBytes,totalBytes,objectCount,mediaCount:seen.size};
}

export interface RoomAttemptWindow {attempts:number[];updatedAt:number;}
/** creditMs is integer capacity:1000 admits one attempt;10000 is the approved burst10. */
export interface RoomWriteBucket extends RoomAttemptWindow {creditMs:number;}
function recent(state:RoomAttemptWindow|undefined,now:number,limit:number){
 if(!integer(now))throw Error('Invalid trusted admission clock');
 if(!state)return[];
 if(!integer(state.updatedAt)||now<state.updatedAt||!Array.isArray(state.attempts)||state.attempts.length>limit||state.attempts.some((t,i)=>!integer(t)||t>state.updatedAt||(i>0&&t<state.attempts[i-1]!)))throw Error('Invalid admission state or clock rollback');
 return state.attempts.filter(t=>t>now-minute);
}
/** Persist returned state even if admission or later semantic validation fails. Revocation/withdrawal bypass this ordinary-write gate. */
export function attemptRoomWrite(previous:RoomWriteBucket|undefined,now:number):{allowed:boolean;state:RoomWriteBucket;retryAfterMs:number}{
 const attempts=recent(previous,now,60);
 if(previous&&(!integer(previous.creditMs)||previous.creditMs>10000))throw Error('Invalid write burst state');
 const credit=Math.min(10000,(previous?.creditMs??10000)+(previous?now-previous.updatedAt:0));
 const allowed=attempts.length<60&&credit>=1000;
 const nextAttempts=attempts.length<60?[...attempts,now]:attempts;
 const state={attempts:nextAttempts,creditMs:allowed?credit-1000:credit,updatedAt:now};
 const rollingWait=nextAttempts.length>=60?Math.max(0,nextAttempts[0]!+minute-now):0;
 return{allowed,state,retryAfterMs:allowed?0:Math.max(rollingWait,Math.max(0,1000-credit))};
}
function attemptWindow(previous:RoomAttemptWindow|undefined,now:number){
 const attempts=recent(previous,now,10),allowed=attempts.length<10;
 const state={attempts:allowed?[...attempts,now]:attempts,updatedAt:now};
 return{allowed,state,retryAfterMs:allowed?0:Math.max(0,attempts[0]!+minute-now)};
}
/** Account and trusted network bucket are separate authority keys; do not derive the network key from caller headers. */
export function attemptRoomRedemption(account:RoomAttemptWindow|undefined,network:RoomAttemptWindow|undefined,now:number){
 const a=attemptWindow(account,now),n=attemptWindow(network,now);
 return{allowed:a.allowed&&n.allowed,account:a.state,network:n.state,retryAfterMs:Math.max(a.retryAfterMs,n.retryAfterMs)};
}
