import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {writeFile} from 'node:fs/promises';
if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Explicit local Auth emulator required');
const app=initializeApp({projectId:'demo-mot-rooms'},'browser-fixture-'+Date.now()),auth=getAuth(app),nonce=Date.now(),accounts={};
try{for(const role of ['owner','editor','respondent']){const email=`mot-${role}-${nonce}@example.test`,password='Synthetic-Browser-Only-123!';const user=await auth.createUser({email,password,emailVerified:true});accounts[role]={email,password,uid:user.uid};}const output=process.argv[2];if(!output)throw Error('Explicit evidence output path required');await writeFile(output,JSON.stringify({fixtureOnly:true,productionConfigured:false,projectId:'demo-mot-rooms',authOrigin:'http://127.0.0.1:9099',serviceOrigin:'http://127.0.0.1:48125',appOrigin:'http://127.0.0.1:5199',accounts},null,2));console.log(JSON.stringify({prepared:true,verifiedSyntheticAccounts:3,tokensStored:false,productionConfigured:false}));}finally{await deleteApp(app);}
