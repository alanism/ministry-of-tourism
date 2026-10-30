import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,sha256Hex,TripSession,type MagazineDocument} from '@writers-board/core';
import {createTripArtifact,magazinePdf,prepareMagazine} from './artifacts';
import {getTripBlob} from './trip-assets';
vi.mock('./trip-assets',()=>({getTripBlob:vi.fn()}));
const magazine:MagazineDocument={title:'Error classification control',boardId:'test',revision:0,warnings:[],pictureDpi:[],spreads:[],unusedAssetIds:[],pages:[]};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('classifies an empty magazine without claiming a decoder or connection failure',async()=>{
 await expect(magazinePdf(magazine)).rejects.toMatchObject({code:'empty'});
});
it('classifies a page decoder rejection without keeping its raw private message',async()=>{
 vi.stubGlobal('Image',class{src='';decode(){return Promise.reject(Error('PRIVATE CODEC CANARY'));}});
 const page={id:'cover',pattern:'personal-cover' as const,folio:1,svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',assetIds:[],credits:[]};
 const error=await magazinePdf({...magazine,pages:[page]}).catch(error=>error);
 expect(error).toMatchObject({code:'decode'});expect(error.message).not.toContain('PRIVATE CODEC CANARY');
});
it('classifies a saved source-picture decoder error without disclosing its raw message',async()=>{
 const blob=new Blob(['synthetic source control'],{type:'image/png'}),hash=await sha256Hex(new Uint8Array(await blob.arrayBuffer())),session=new TripSession(createTrip({title:'Control',city:'Bilbao',timeZone:null})),actor={kind:'human' as const,id:'qa',name:'QA'};
 vi.mocked(getTripBlob).mockResolvedValue(blob);vi.stubGlobal('FileReader',class{result='data:image/png;base64,YQ==';onload:(()=>void)|null=null;readAsDataURL(){queueMicrotask(()=>this.onload?.());}});vi.stubGlobal('createImageBitmap',()=>Promise.reject(Error('PRIVATE SOURCE DECODER')));
 session.execute(actor,'trip_asset_register',{asset:{id:'source',hash,mime:'image/png',role:'original',rightsStatus:'approved'}});session.execute(actor,'trip_card_create',{kind:'note',title:'Source',assetIds:['source'],scope:'guide'});
 try{const error=await prepareMagazine(session,undefined,false).catch(error=>error);expect(error).toMatchObject({code:'decode'});expect(error.message).not.toContain('PRIVATE SOURCE DECODER');}finally{session.destroy();}
});
it('records missing saved media as storage at the actual package collection step',async()=>{
 const session=new TripSession(createTrip({title:'Control',city:'Bilbao',timeZone:null})),actor={kind:'human' as const,id:'qa',name:'QA'},diagnostics:unknown[]=[];vi.mocked(getTripBlob).mockResolvedValue(null);
 session.execute(actor,'trip_asset_register',{asset:{id:'missing',hash:'a'.repeat(64),mime:'image/png',role:'original',rightsStatus:'approved'}});session.execute(actor,'trip_card_create',{kind:'note',title:'Private missing media control',assetIds:['missing'],scope:'guide'});
 try{await expect(createTripArtifact(session,'zip',undefined,{onDiagnostic:r=>diagnostics.push(r)})).rejects.toThrow();expect(diagnostics).toEqual([expect.objectContaining({errorClass:'storage',step:'layout'})]);expect(JSON.stringify(diagnostics)).not.toContain('Private missing media control');}finally{session.destroy();}
});
