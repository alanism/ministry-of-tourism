import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
const app=initializeApp({projectId:'demo-mot-rooms'},'admission-proof-'+Date.now()),auth=getAuth(app),server=await startRoomEmulatorHttp({port:0,appOrigin:'http://127.0.0.1:5173'});
async function signup(prefix){const email=prefix+'-'+Date.now()+'@example.test',body={email,password:'Synthetic-Only-123!',returnSecureToken:true};const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-emulator-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert(r.ok);const user=await r.json();await auth.updateUser(user.localId,{emailVerified:true});return(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-emulator-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();}
const owner=await signup('owner'),guest=await signup('guest'),other=await signup('other');
const call=(user,path,body)=>fetch(server.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.idToken,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const roomId='admission-'+Date.now(),card={id:'card',kind:'note',title:'Explicitly shared',body:'Visible',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0};
const created=await call(owner,'/rooms',{schemaMajor:1,capability:'room-admission/1',roomId,title:'Synthetic room',cards:[card]});assert.equal(created.status,200);
const invited=await call(owner,`/rooms/${roomId}/invites`,{schemaMajor:1,capability:'room-admission/1',role:'editor'});assert.equal(invited.status,200);const invite=await invited.json();assert.equal(invite.inviteSecret.length,64);
const claimed=await call(guest,`/rooms/${roomId}/claims`,{schemaMajor:1,capability:'room-admission/1',inviteSecret:invite.inviteSecret});assert.equal(claimed.status,200);assert.equal((await claimed.json()).state,'pending');assert.equal((await call(guest,`/rooms/${roomId}`)).status,403);
assert.equal((await call(other,`/rooms/${roomId}/claims`,{schemaMajor:1,capability:'room-admission/1',inviteSecret:invite.inviteSecret})).status,403);
assert.equal((await call(owner,`/rooms/${roomId}/approve`,{schemaMajor:1,capability:'room-admission/1',inviteId:invite.inviteId,confirmedSubject:other.localId})).status,403);
const approved=await call(owner,`/rooms/${roomId}/approve`,{schemaMajor:1,capability:'room-admission/1',inviteId:invite.inviteId,confirmedSubject:guest.localId});assert.equal(approved.status,200);
const joined=await call(guest,`/rooms/${roomId}`);assert.equal(joined.status,200);assert.equal((await joined.json()).principal.uid,guest.localId);
const revoked=await call(owner,`/rooms/${roomId}/revoke`,{schemaMajor:1,capability:'room-admission/1',uid:guest.localId});assert.equal(revoked.status,200);assert.equal((await call(guest,`/rooms/${roomId}`)).status,403);
await server.close();await deleteApp(app);console.log(JSON.stringify({pass:true,actualAuthSubjects:3,createdRoom:true,pendingClaimNoAccess:true,singleUseReplayDenied:true,exactSubjectApproval:true,revocation:true,secretLogged:false}));
