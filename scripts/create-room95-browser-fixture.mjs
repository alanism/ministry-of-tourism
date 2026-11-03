import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createTrip,tripParts,writeCard,readTripMeta} from '../packages/core/src/trip/model.ts';
import {exportTripPackage,sha256Hex} from '../packages/core/src/trip/package.ts';
import {importTripPackage} from '../packages/core/src/trip/import.ts';
const output=process.argv[2];if(!output)throw Error('Explicit local evidence directory required');
const configuration={version:1,trip_id:'room95-synthetic-trip',households:[{household_id:'riverside-family',display_name:'Riverside family'},{household_id:'mountain-family',display_name:'Mountain family'}],rounds:[{round_id:'day-out',proposal_version:1,kind:'destination',option_ids:['riverside-walk','mountain-picnic','oldtown-gallery'],rank_limit:3,household_weighting:'one_household_one_vote'}]};
const doc=createTrip({title:'Room95 synthetic holiday and recovery',city:'Aspen',cityId:'aspen',countryCode:'US',timeZone:'America/Denver',dates:{start:'2026-11-05',end:'2026-11-08'},groupPreferences:configuration});
try{
 const parts=tripParts(doc),cards=[['riverside-walk','Riverside walk','A proposed riverside walk.'],['mountain-picnic','Mountain picnic','A proposed mountain picnic.'],['oldtown-gallery','Old town gallery','A proposed gallery visit.'],['recovery-note','Shared recovery note','Original shared note. RECOVERY-ORIGINAL-TAIL'],['private-room95-canary','Synthetic private boundary check','PRIVATE-ROOM95-CANARY']];
 doc.transact(()=>{for(const[id,title,body]of cards)writeCard(parts,{id,kind:'note',title,body,scope:id==='private-room95-canary'?'private':'guide',provenance:'traveler',stage:'plan',assetIds:[],x:0,y:0,createdBy:'synthetic-fixture',updatedAt:new Date().toISOString()});});
 const zip=await exportTripPackage(doc,new Map(),{includePrivate:true}),restored=await importTripPackage(zip);
 try{assert.deepEqual(readTripMeta(restored.doc).groupPreferences,configuration);assert.notEqual(readTripMeta(restored.doc).boardId,readTripMeta(doc).boardId);}finally{restored.doc.destroy();}
 await mkdir(output,{recursive:true});const path=join(output,'room95-synthetic-holiday.mot.zip');await writeFile(path,zip);await writeFile(join(output,'room95-fixture.json'),JSON.stringify({path,bytes:zip.length,sha256:await sha256Hex(zip),configuration,publicCards:cards.slice(0,4).map(row=>row[0]),privateCanary:cards[4][0],syntheticOnly:true,normalImporterValidated:true},null,2)+'\n');
 console.log(JSON.stringify({path,bytes:zip.length,sha256:await sha256Hex(zip),syntheticOnly:true,normalImporterValidated:true}));
}finally{doc.destroy();}
