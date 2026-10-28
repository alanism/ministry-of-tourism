import {apparelArtRefSchema,readAsset,readTripMeta,TRIP_PACKAGE_LIMITS,type Actor,type ApparelArtRef,type Asset,type TripSession} from '@writers-board/core';
import {commitTripBlobs,getTripBlob} from './trip-assets';

/** Only an explicit FCC apparel choice may become the persisted worn tee. Preview never calls this. */
export async function selectMagazineTee(session:TripSession,actor:Actor,chosen:ApparelArtRef,candidates:readonly ApparelArtRef[],signal?:AbortSignal):Promise<{persisted:boolean}>{
  signal?.throwIfAborted();
  if(actor.kind!=='human')throw new Error('Only a person can choose the worn tee.');
  if(!candidates.length||candidates.length>3)throw new Error('Choose from the current three FCC apparel variants.');
  const refs=candidates.map(candidate=>apparelArtRefSchema.parse(candidate)),selected=apparelArtRefSchema.parse(chosen),cityId=readTripMeta(session.doc).cityId;
  if(new Set(refs.map(art=>art.assetId)).size!==refs.length||!refs.some(art=>JSON.stringify(art)===JSON.stringify(selected)))throw new Error('The chosen tee must match its actual catalog reference.');
  for(const art of refs){
    if(!cityId||art.originCityId!==cityId||(art.source.cityId&&art.source.cityId!==cityId))throw new Error('Choose explicitly classified apparel from this trip city.');
    if(art.rightsStatus!=='approved'&&!art.credit?.trim())throw new Error('The actual FCC apparel credit is required.');
  }
  const blobs:Blob[]=[];
  for(const art of refs){
    signal?.throwIfAborted();
    const existing=readAsset(session.parts,art.assetId);
    let blob=existing?.apparel&&JSON.stringify(existing.apparel)===JSON.stringify({...art,hash:existing.hash})?await getTripBlob(existing.hash):null;
    if(!blob){
      const response=await fetch(art.originalUrl??art.renditionUrl,{signal,credentials:'omit',redirect:'error'});
      if(!response.ok)throw new Error('The selected FCC tee image could not be downloaded. Retry.');
      if(Number(response.headers.get('content-length'))>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error('This tee original exceeds the portable 10 MiB image limit.');
      blob=await response.blob();
    }
    signal?.throwIfAborted();
    if(blob.type!==art.mimeType)throw new Error('The tee image does not match its declared raster format.');
    if(!blob.size||blob.size>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error('This tee original exceeds the portable 10 MiB image limit.');
    blobs.push(blob);
  }
  return commitTripBlobs(blobs,hashes=>{
    const assets:Asset[]=refs.map((art,index)=>{
      const hash=hashes[index]!;
      if(art.hash&&art.hash!==hash)throw new Error('The FCC tee original failed its checksum. Nothing changed.');
      return{id:art.assetId,hash,mime:art.mimeType,role:'original',width:art.width,height:art.height,
        ...(art.label?{caption:art.label}:{}),credit:art.credit,rightsStatus:art.rightsStatus,apparel:{...art,hash}};
    });
    session.executeAll(actor,[{command:'trip_magazine_tee_select',input:{assetId:selected.assetId,assets}}]);
  },signal);
}
