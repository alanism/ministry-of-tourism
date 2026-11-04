import type {PublicIdentityVerifier} from './http.ts';
import {createHash} from 'node:crypto';

interface IdentityChecks {
  appId:string;
  verifyAppCheck:(token:string,options:{consume:true})=>Promise<{appId:string;alreadyConsumed?:boolean;token?:{sub?:string;jti?:unknown}}>;
  verifyIdToken:(token:string,checkRevoked:true)=>Promise<{uid:string;firebase?:{sign_in_provider?:string}}>;
}

/** A fresh attestation gates the remote Auth revocation lookup, not just quota admission. */
export function createPublicIdentityVerifier(checks:IdentityChecks):PublicIdentityVerifier{
  return{async verify(idToken,appCheckToken,signal){
    signal?.throwIfAborted();
    const checked=await checks.verifyAppCheck(appCheckToken,{consume:true});
    if(checked.alreadyConsumed!==false||checked.appId!==checks.appId)throw Error('invalid_app_attestation');
    const jti=checked.token?.jti;
    if(typeof jti!=='string'||jti.length<16||jti.length>500)throw Error('limited_use_attestation_required');
    signal?.throwIfAborted();
    const token=await checks.verifyIdToken(idToken,true);
    signal?.throwIfAborted();
    if(token.firebase?.sign_in_provider!=='anonymous'||!token.uid||token.uid.length>128)throw Error('anonymous_session_required');
    return{uid:token.uid,appId:checked.appId,attestationHash:createHash('sha256').update(checked.appId+'\0'+jti).digest('hex')};
  }};
}
