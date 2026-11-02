import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
import {roomAdminOperationId} from '../packages/core/src/trip/shared-room-admission.ts';
import {zlibSync} from 'fflate';
import {sha256Hex} from '../packages/core/src/trip/sha256.ts';
const app=initializeApp({projectId:'demo-mot-rooms'},'central-proof-'+Date.now()),db=getFirestore(app),auth=getAuth(app),server=await startRoomEmulatorHttp({port:0,appOrigin:'http://127.0.0.1:5199'});
try{
 const stamp=Date.now(),email=`central-${stamp}@example.test`,password='Synthetic-Only-123!';
 const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert(signup.ok);const user=await signup.json();await auth.updateUser(user.localId,{emailVerified:true});
 const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const identity=await login.json(),roomId=`central-${stamp}`,sessionId=randomBytes(32).toString('hex'),member={role:'owner',epoch:1,active:true},ref=db.doc('rooms/'+roomId);
 await ref.set({id:roomId,title:'Synthetic central proof',schemaMajor:1,closed:false,ownerUid:user.localId,members:{[user.localId]:member},receiptCount:0});await ref.collection('members').doc(user.localId).set(member);await ref.collection('sessions').doc(sessionId).set({record:{id:sessionId,roomId,uid:user.localId,membershipEpoch:1,active:true,createdAt:stamp}});
 await ref.collection('cards').doc('card').set({version:1,authorUid:user.localId,updatedAt:stamp,payload:{id:'card',kind:'note',title:'Selected note',body:'Synthetic shared text',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0}});
 const headers={authorization:'Bearer '+identity.idToken,'x-room-session':sessionId,'x-room-membership-epoch':'1'};
 const snapshot=await fetch(server.url+'/rooms/'+roomId,{headers});assert.equal(snapshot.status,200);const feed=await snapshot.json();assert(feed.capabilities.includes('room-media/1'),'central feed must expose enforced media capability');assert.deepEqual(feed.assets,[]);
 for(const path of ['/lifecycle','/transfers']){const response=await fetch(server.url+'/rooms/'+roomId+path,{headers});assert.equal(response.status,200,path);}
 const secondEmail=`expiry-claimant-${stamp}@example.test`,signed=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:secondEmail,password,returnSecureToken:true})}),second=await signed.json();await auth.updateUser(second.localId,{emailVerified:true});const signedAgain=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:secondEmail,password,returnSecureToken:true})}),claimant=await signedAgain.json(); const results=[];
 for(const kind of ['claim','approve']){
  const secret=randomBytes(32).toString('hex'),inviteId=await sha256Hex(new TextEncoder().encode(secret)),expiresAt=Date.now()+250,guest=claimant.localId;
  await ref.collection('invites').doc(inviteId).set({role:'viewer',expiresAt,used:kind==='approve',revoked:false,version:1,terminal:false});
  if(kind==='approve')await ref.collection('claims').doc(inviteId).set({uid:guest,role:'viewer',state:'pending',version:1,expiresAt});
  const intent={schemaMajor:1,capability:'room-admission/1',baseVersion:kind==='claim'?0:1,expiresAt,...(kind==='claim'?{inviteSecret:secret}:{inviteId,confirmedSubject:guest})},operationId=await roomAdminOperationId(kind==='claim'?claimant.localId:user.localId,roomId,kind,intent),bytes=new TextEncoder().encode(JSON.stringify({...intent,operationId}));
  const slowBody=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,1));setTimeout(()=>{controller.enqueue(bytes.slice(1));controller.close();},500);}});
  const response=await fetch(server.url+'/rooms/'+roomId+(kind==='claim'?'/claims':'/approve'),{method:'POST',headers:{...headers,authorization:'Bearer '+(kind==='claim'?claimant.idToken:identity.idToken),'content-type':'application/json'},body:slowBody,duplex:'half'});results.push({kind,status:response.status});assert.equal(response.status,403,kind+' crossing expiry while reading body must refuse');
  assert.equal((await ref.collection('members').doc(guest).get()).exists,false);
  if(kind==='claim')assert.equal((await ref.collection('claims').doc(inviteId).get()).exists,false);
 }
 const validSecret=randomBytes(32).toString('hex'),validId=await sha256Hex(new TextEncoder().encode(validSecret)),validExpiry=Date.now()+10000;await ref.collection('invites').doc(validId).set({role:'viewer',expiresAt:validExpiry,used:false,revoked:false,version:1,terminal:false});
 const call=async(kind,actor,token,extra,baseVersion)=>{const intent={schemaMajor:1,capability:'room-admission/1',baseVersion,expiresAt:validExpiry,...extra},operationId=await roomAdminOperationId(actor,roomId,kind,intent);return fetch(server.url+'/rooms/'+roomId+(kind==='claim'?'/claims':'/approve'),{method:'POST',headers:{...headers,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({...intent,operationId})});};
 assert.equal((await call('claim',claimant.localId,claimant.idToken,{inviteSecret:validSecret},0)).status,200,'live immutable claimant control');assert.equal((await call('approve',user.localId,identity.idToken,{inviteId:validId,confirmedSubject:claimant.localId},1)).status,200,'live immutable approval control');
 console.log(JSON.stringify({pass:true,roomId,actualAuth:true,actualHttp:true,actualFirestore:true,deferredBodiesCrossExpiry:results,noAdmissionEffects:true}));
}finally{await server.close();await db.terminate();await deleteApp(app);}
