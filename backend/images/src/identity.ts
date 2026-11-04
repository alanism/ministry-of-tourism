import {createHash} from 'node:crypto';
import {createPublicIdentityVerifier} from '../../discovery/src/identity.ts';

/** The durable replay check also gates Auth lookup when provider consumption lags. */
export function createImageIdentity(checks:Parameters<typeof createPublicIdentityVerifier>[0],isUsed:(hash:string)=>Promise<boolean>){
  return createPublicIdentityVerifier({...checks,async verifyAppCheck(token,options){
    const checked=await checks.verifyAppCheck(token,options),jti=checked.token?.jti;
    if(checked.appId===checks.appId&&checked.alreadyConsumed===false&&typeof jti==='string'&&jti.length>=16&&jti.length<=500){
      const fingerprint=createHash('sha256').update(checked.appId+'\0'+jti).digest('hex');
      if(await isUsed(fingerprint))throw Error('replayed_attestation');
    }
    return checked;
  }});
}
