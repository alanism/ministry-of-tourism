import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';

// Synthetic local proof only. Never fall back to production or accept a caller-supplied account.
if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.GCLOUD_PROJECT!=='demo-mot-rooms')throw Error('Explicit demo-mot-rooms/Auth9099 emulator required');
const fixture='astra-recovery-'+Date.now()+'-'+randomBytes(4).toString('hex'),email=fixture+'@example.test',oldPassword=randomBytes(24).toString('base64url')+'aA1!',newPassword=randomBytes(24).toString('base64url')+'bB2!';
const app=initializeApp({projectId:'demo-mot-rooms'},fixture),auth=getAuth(app),started=Date.now();let phase='create-unique-fixture';
async function rest(operation,body){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:'+operation+'?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});return{ok:response.ok,status:response.status,value:await response.json()};}
const signIn=password=>rest('signInWithPassword',{email,password,returnSecureToken:true});
try{
 const created=await auth.createUser({uid:fixture,email,password:oldPassword,emailVerified:true});assert.equal(created.uid,fixture);
 phase='baseline-credentials';const before=await signIn(oldPassword);assert.equal(before.ok,true);assert.equal((await signIn(newPassword)).ok,false);const beforeToken=await auth.verifyIdToken(before.value.idToken,true);assert.equal(beforeToken.uid,fixture);assert.equal(beforeToken.email_verified,true);
 phase='issue-local-reset';let resetLink=await auth.generatePasswordResetLink(email),oobCode=new URL(resetLink).searchParams.get('oobCode');assert(oobCode);resetLink='';
 phase='verify-local-reset';const verification=await rest('resetPassword',{oobCode});assert.equal(verification.ok,true);assert.equal(verification.value.email,email);assert.equal(verification.value.requestType,'PASSWORD_RESET');
 phase='apply-local-reset';const reset=await rest('resetPassword',{oobCode,newPassword});assert.equal(reset.ok,true);assert.equal(reset.value.email,email);assert.equal((await rest('resetPassword',{oobCode,newPassword})).ok,false);oobCode='';
 phase='old-password-must-fail';assert.equal((await signIn(oldPassword)).ok,false);
 phase='recovered-subject';const after=await signIn(newPassword);assert.equal(after.ok,true);const afterToken=await auth.verifyIdToken(after.value.idToken,true);assert.equal(afterToken.uid,beforeToken.uid);assert.equal(afterToken.email_verified,true);const user=await auth.getUser(fixture);assert.equal(user.emailVerified,true);
 console.log(JSON.stringify({pass:true,fixtureUid:fixture,project:'demo-mot-rooms',emulator:'127.0.0.1:9099',oldPasswordInitiallyWorks:true,newPasswordInitiallyDenied:true,oldPasswordAfterResetDenied:true,newPasswordAfterResetWorks:true,sameVerifiedUid:true,emailVerifiedPreserved:true,resetCodeReplayDenied:true,elapsedMs:Date.now()-started,limits:'Local mechanism only; no email delivery, real account, production recovery, existing-token invalidation or room authority claim'}));
}catch(error){console.error(JSON.stringify({pass:false,fixtureUid:fixture,phase,errorCode:typeof error.code==='string'?error.code:'verification-failed',elapsedMs:Date.now()-started}));process.exitCode=1;}
finally{await deleteApp(app);}
