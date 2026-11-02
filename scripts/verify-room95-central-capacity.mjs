import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
import {readRoomPublicSnapshot} from '../packages/mot-server/src/room-emulator-snapshot.ts';
if(process.env.GCLOUD_PROJECT!=='demo-mot-rooms'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Explicit local demo emulators required');
const roomId='root-capacity-'+Date.now(),app=initializeApp({projectId:'demo-mot-rooms'},roomId),db=getFirestore(app),auth=getAuth(app),ref=db.doc('rooms/'+roomId),server=await startRoomEmulatorHttp({port:0,appOrigin:'http://127.0.0.1:5199'});let user;
try{
 const email=roomId+'@example.test',password=randomBytes(24).toString('hex');user=await auth.createUser({email,password,emailVerified:true});
 const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert.equal(login.status,200);const token=(await login.json()).idToken,sessionId=randomBytes(32).toString('hex'),member={role:'owner',epoch:1,active:true};
 await ref.set({id:roomId,title:'Synthetic capacity proof',schemaMajor:1,closed:false,ownerUid:user.uid,members:{[user.uid]:member},receiptCount:0});await ref.collection('members').doc(user.uid).set(member);await ref.collection('sessions').doc(sessionId).set({record:{id:sessionId,roomId,uid:user.uid,membershipEpoch:1,active:true,createdAt:Date.now()}});
 // Trusted metadata-only fixture for accounting/error classification, not an uploaded-image claim.
 const assets=Array.from({length:5},(_,i)=>({id:'asset-'+i,hash:'a'.repeat(64),mime:'image/png',width:1,height:1,bytes:i<4?10*1024*1024:1})),payload={id:'card',kind:'note',title:'Capacity card',body:'',stage:'plan',provenance:'traveler',assetIds:assets.map(a=>a.id),x:0,y:0};
 await ref.collection('cards').doc('card').set({version:1,authorUid:user.uid,updatedAt:Date.now(),payload});for(const asset of assets)await ref.collection('media').doc(asset.id).set({payload:asset});
 const measure=()=>db.runTransaction(async tx=>(await readRoomPublicSnapshot(tx,ref,(await tx.get(ref)).data())).measurement),first=await measure();assets[4].bytes+=50*1024*1024-first.totalBytes-64;await ref.collection('media').doc(assets[4].id).set({payload:assets[4]});const near=await measure();assert(near.totalBytes<=50*1024*1024&&50*1024*1024-near.totalBytes<64);
 const headers={authorization:'Bearer '+token,'x-room-session':sessionId,'x-room-membership-epoch':'1'},operation={roomId,schemaMajor:1,capability:'room-cards/1',operationId:'over-budget-edit',membershipEpoch:1,kind:'edit',cardId:'card',baseVersion:1,payload:{...payload,body:'Over budget but retained locally. '.repeat(50)}};
 const rejected=await fetch(server.url+'/rooms/'+roomId+'/operations',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(operation)}),body=await rejected.json();assert.equal(rejected.status,413,JSON.stringify(body));assert.equal(body.error.code,'limit');assert.deepEqual((await ref.collection('cards').doc('card').get()).get('payload'),payload);assert.equal((await ref.collection('receipts').doc(operation.operationId).get()).exists,false);assert.equal((await fetch(server.url+'/rooms/'+roomId,{headers})).status,200);
 console.log(JSON.stringify({pass:true,actualVerifiedAuth:true,actualCentralHTTP:true,actualFirestore:true,metadataOnlyCapacityFixture:true,snapshotHeadroom:50*1024*1024-near.totalBytes,normalOverBudgetEditStatus:rejected.status,recoveryCode:body.error.code,acceptedStateUnchanged:true,currentAuthorizedReadStillWorks:true}));
}finally{await db.recursiveDelete(ref);if(user)await auth.deleteUser(user.uid);await server.close();await db.terminate();await deleteApp(app);}
