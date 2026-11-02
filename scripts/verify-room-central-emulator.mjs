import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
const app=initializeApp({projectId:'demo-mot-rooms'},'central-proof-'+Date.now()),db=getFirestore(app),auth=getAuth(app),server=await startRoomEmulatorHttp({port:0,appOrigin:'http://127.0.0.1:5199'});
try{
 const stamp=Date.now(),email=`central-${stamp}@example.test`,password='Synthetic-Only-123!';
 const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert(signup.ok);const user=await signup.json();await auth.updateUser(user.localId,{emailVerified:true});
 const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const identity=await login.json(),roomId=`central-${stamp}`,sessionId=randomBytes(32).toString('hex'),member={role:'owner',epoch:1,active:true},ref=db.doc('rooms/'+roomId);
 await ref.set({id:roomId,title:'Synthetic central proof',schemaMajor:1,closed:false,ownerUid:user.localId,members:{[user.localId]:member},receiptCount:0});await ref.collection('members').doc(user.localId).set(member);await ref.collection('sessions').doc(sessionId).set({record:{id:sessionId,roomId,uid:user.localId,membershipEpoch:1,active:true,createdAt:stamp}});
 const headers={authorization:'Bearer '+identity.idToken,'x-room-session':sessionId,'x-room-membership-epoch':'1'};
 const snapshot=await fetch(server.url+'/rooms/'+roomId,{headers});assert.equal(snapshot.status,200);const feed=await snapshot.json();assert(feed.capabilities.includes('room-media/1'),'central feed must expose enforced media capability');assert.deepEqual(feed.assets,[]);
 for(const path of ['/lifecycle','/transfers']){const response=await fetch(server.url+'/rooms/'+roomId+path,{headers});assert.equal(response.status,200,path);}
 const denial=[];for(let n=0;n<11;n++){const response=await fetch(server.url+'/rooms/'+roomId+'/operations',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'});denial.push(response.status);}assert.equal(denial.at(-1),429,'semantic failures must retain attempt budgets');
 console.log(JSON.stringify({pass:true,roomId,actualAuth:true,actualHttp:true,actualFirestore:true,protectedFeed:true,lifecycleAndTransferDispatch:true,deniedAttemptsPersisted:true}));
}finally{await server.close();await db.terminate();await deleteApp(app);}
