import {z} from 'zod';
import {discoveryRequestSchema} from './core-shim.ts';

export const PROJECT_ID='nonhumanintelligence';
export const DATABASE_ID='mot-discovery-usage';
export const SECRET_ID='MOT_META_DISCOVERY_API_KEY';
export const REGION='us-central1';
export const ORIGINS=['https://ministryoftourism.web.app','https://ministryoftourism.firebaseapp.com'] as const;
export const PUBLIC_LIMITS=Object.freeze({lifetimeAttempts:100,dailyAttempts:20,actorDailyAttempts:3,concurrency:2,
  observedTokens:200000,leaseMs:75000,requestBytes:2048,inputBytes:12000,responseBytes:192000,outputTokens:2500,toolCalls:2,timeoutMs:30000});
export const publicRequestSchema=discoveryRequestSchema.extend({requestId:z.uuid(),contributorConsent:z.literal(true)}).strict();
export type PublicRequest=z.infer<typeof publicRequestSchema>;
export interface Usage {inputTokens:number;outputTokens:number;totalTokens:number;}
export type FailureCode='unavailable'|'unauthenticated'|'invalid_request'|'rate_limited'|'busy'|'replayed'|'provider_unavailable'|'invalid_response'|'timeout'|'cancelled';
export class DiscoveryFailure extends Error {
  readonly code:FailureCode;
  constructor(code:FailureCode){super(code);this.name='DiscoveryFailure';this.code=code;}
}
export function safeFailure(code:FailureCode){
  const reason:Record<FailureCode,string>={unavailable:'Public discovery is unavailable. Continue with FCC.',unauthenticated:'This discovery session could not be verified. Reload or continue with FCC.',invalid_request:'Choose one to three public FCC venues and agree to the Contributor notice.',rate_limited:'The public preview allowance is reached. Continue with FCC.',busy:'Public discovery is busy. Try later.',replayed:'This request was already used. Start a new request if needed.',provider_unavailable:'Meta discovery is unavailable. Nothing was added.',invalid_response:'No usable source evidence was returned. Nothing was added.',timeout:'Discovery timed out. Nothing was added.',cancelled:'Discovery stopped. Nothing was added.'};
  return{status:code==='unavailable'?'unavailable' as const:'error' as const,code,reason:reason[code]};
}
