import {z} from 'zod';
export {PROJECT_ID,DATABASE_ID,SECRET_ID,REGION,ORIGINS} from '../../discovery/src/contract.ts';
export const IMAGE_MODEL='muse-image-1.0';
export const IMAGE_ENDPOINT='https://api.meta.ai/v1/images/edits';
export const IMAGE_LIMITS=Object.freeze({guestLifetime:2,globalDaily:20,globalLifetime:100,concurrency:1,sourceBytes:4*1024*1024,sourceSide:1600,bodyBytes:6*1024*1024,responseBytes:24*1024*1024,outputBytes:16*1024*1024,outputPixels:16_777_216,timeoutMs:240000,leaseMs:330000});
export const imageRequestSchema=z.object({requestId:z.uuid(),style:z.enum(['fashion','city']),photoBase64:z.string().min(4).max(Math.ceil(IMAGE_LIMITS.sourceBytes*4/3)),consent:z.literal(true)}).strict();
export type ImageRequest=z.infer<typeof imageRequestSchema>;
export type ImageCode='unavailable'|'invalid_request'|'unauthenticated'|'rate_limited'|'busy'|'replayed'|'provider_unavailable'|'invalid_response'|'timeout'|'cancelled';
export class ImageFailure extends Error {readonly code:ImageCode;constructor(code:ImageCode){super(code);this.code=code;}}
export function imageFailure(code:ImageCode){
  const reasons:Record<ImageCode,string>={unavailable:'The hackathon image allowance is unavailable. You can choose BYOK.',invalid_request:'Choose a prepared JPEG photo and agree to the image notice.',unauthenticated:'This image session could not be verified. Reload or use BYOK.',rate_limited:'The hackathon image allowance has been used. You can choose BYOK.',busy:'Another free image is being prepared. Try later.',replayed:'This image request or verification was already used. Nothing was generated again.',provider_unavailable:'The image service did not complete. The attempt counts; no automatic retry was sent.',invalid_response:'No usable image was returned. The attempt counts; no automatic retry was sent.',timeout:'Image generation timed out. The attempt counts and Meta may have charged it.',cancelled:'Image generation stopped. A dispatched request may still be charged; no image was added.'};
  return{status:code==='unavailable'?'unavailable' as const:'error' as const,code,reason:reasons[code]};
}
export interface ImageSession {uid:string;appId:string;attestationHash:string}
