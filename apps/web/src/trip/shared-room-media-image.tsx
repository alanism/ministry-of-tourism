import{useEffect,useRef,useState}from'react';
import{SharedRoomRequestError,sharedRoomAwait,type SharedRoomServiceClient}from'./shared-room-client';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
import type{RoomSharedMedia}from'../../../../packages/core/src/trip/shared-room-media';
let decodeTail:Promise<unknown>=Promise.resolve();
/** One explicit image decoder across views and upload preparation; an aborted late bitmap is still closed. */
export function decodeSharedRoomPng<T>(blob:Blob,signal:AbortSignal,consume:(bitmap:ImageBitmap)=>Promise<T>|T):Promise<T>{
 const work=decodeTail.then(async()=>{if(signal.aborted)throw new SharedRoomRequestError('cancelled');const bitmap=await createImageBitmap(blob);try{if(signal.aborted)throw new SharedRoomRequestError('cancelled');if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>16777216)throw new SharedRoomRequestError('limit');return await consume(bitmap);}finally{bitmap.close();}});decodeTail=work.then(()=>{},()=>{});return sharedRoomAwait(()=>work,signal);
}
export interface SharedRoomLoadedImage{readonly url:string|undefined;asset:RoomSharedMedia;dispose:()=>void;}
export async function loadSharedRoomMediaImage(client:SharedRoomServiceClient,room:RoomSnapshot,assetId:string,signal:AbortSignal):Promise<SharedRoomLoadedImage>{
 let url:string|undefined;const dispose=()=>{signal.removeEventListener('abort',dispose);if(url){URL.revokeObjectURL(url);url=undefined;}};
 try{const{bytes,asset}=await client.readRoomMedia(room,assetId,signal),blob=new Blob([new Uint8Array(bytes).buffer],{type:'image/png'});await decodeSharedRoomPng(blob,signal,bitmap=>{if(bitmap.width!==asset.width||bitmap.height!==asset.height)throw new SharedRoomRequestError('invalid-response');});if(signal.aborted)throw new SharedRoomRequestError('cancelled');url=URL.createObjectURL(blob);signal.addEventListener('abort',dispose,{once:true});return{get url(){return url;},asset,dispose};}catch(cause){dispose();throw cause;}
}
export interface SharedRoomMediaImageProps{active:boolean;client:SharedRoomServiceClient;room:RoomSnapshot;assetId:string;onAccessUnavailable?:()=>void;}
export function SharedRoomMediaImage(props:SharedRoomMediaImageProps){
 const asset=props.room.assets?.find(item=>item.id===props.assetId),available=props.active&&props.room.capabilities.includes('room-media/1')&&!!asset,scope=JSON.stringify([props.room.roomId,props.room.principal.uid,props.room.principal.membershipEpoch,props.assetId,asset?.hash,asset?.width,asset?.height,asset?.bytes]);
 const[state,setState]=useState<{scope:string;client:SharedRoomServiceClient;image?:SharedRoomLoadedImage;error?:string}>(),current=useRef({scope,props});current.current={scope,props};
 useEffect(()=>{if(!available)return;const abort=new AbortController();let image:SharedRoomLoadedImage|undefined,alive=true;void loadSharedRoomMediaImage(props.client,props.room,props.assetId,abort.signal).then(loaded=>{image=loaded;if(!alive||abort.signal.aborted){loaded.dispose();return;}setState({scope,client:props.client,image:loaded});}).catch(cause=>{if(!alive||abort.signal.aborted)return;setState({scope,client:props.client,error:cause instanceof SharedRoomRequestError&&cause.code==='unavailable'?'Shared image access unavailable.':'Shared image unavailable. No unverified preview is shown.'});if(cause instanceof SharedRoomRequestError&&cause.code==='unavailable')current.current.props.onAccessUnavailable?.();});return()=>{alive=false;abort.abort();image?.dispose();};},[available,props.client,scope]);
 if(!available)return <p>Protected image unavailable.</p>;
 const visible=state?.scope===scope&&state.client===props.client?state:undefined;
 return <figure className="shared-room-media-image">{visible?.image?.url?<img src={visible.image.url} width={asset!.width} height={asset!.height} alt="Shared room photograph" onError={()=>{if(current.current.scope!==scope||current.current.props.client!==props.client)return;visible.image?.dispose();setState({scope,client:props.client,error:'Shared image could not be decoded.'});}}/>:<p role="status">{visible?.error??'Checking and decoding protected image...'}</p>}{asset!.caption!==undefined&&<figcaption>{asset!.caption}</figcaption>}{asset!.credit&&<p className="shared-room-exact-text">{asset!.credit}</p>}</figure>;
}
