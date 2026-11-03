import {expect,it} from 'vitest';
import {validateRoomMediaInverse} from './shared-room-media-undo.ts';
import {canonicalFileJson} from './file-exchange-json.ts';
import {sha256Hex} from './sha256.ts';
const digest=(v:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(v)));
async function fixture(add=false){
 const before={id:'card',kind:'note' as const,title:'Shared',body:'Unchanged text',stage:'plan' as const,provenance:'traveler' as const,assetIds:add?[]:['old'],x:1,y:2};
 const asset={id:'old',hash:'a'.repeat(64),bytes:100,mime:'image/png' as const,width:1,height:1,caption:'',credit:'Exact credit'};
 const after={...before,assetIds:['current']},card={version:4,authorUid:'owner',updatedAt:1,payload:after};
 const receipt={operationId:'forward',uid:'owner',kind:'media' as const,cardId:'card',assetId:'current',version:4,requestDigest:'b'.repeat(64),beforeDigest:await digest(before),afterDigest:await digest(after),...(!add?{previousAssetDigest:await digest(asset)}:{}),acceptedAt:1};
 return{before,asset,card,receipt};
}
it('restores exact prior content/caption through a fresh asset reference only',async()=>{const f=await fixture();expect(await validateRoomMediaInverse('owner',f.card,f.receipt,f.before,{...f.asset,id:'fresh'})).toEqual({...f.before,assetIds:['fresh']});});
it('refuses other initiators, changed target versions and forged before-card text',async()=>{const f=await fixture();for(const [uid,card,before]of[['other',f.card,f.before],['owner',{...f.card,version:5},f.before],['owner',f.card,{...f.before,body:'Injected'}]]as const)await expect(validateRoomMediaInverse(uid,card,f.receipt,before,{...f.asset,id:'fresh'})).rejects.toThrow();});
it('authenticates caption credit bytes and dimensions instead of accepting a matching card hash alone',async()=>{const f=await fixture();for(const patch of[{caption:'Changed'},{credit:'Changed'},{bytes:101},{width:2},{hash:'c'.repeat(64)}])await expect(validateRoomMediaInverse('owner',f.card,f.receipt,f.before,{...f.asset,id:'fresh',...patch})).rejects.toThrow();});
it('does not reactivate old identifiers or infer missing prior descriptor evidence',async()=>{const f=await fixture();for(const id of['old','current'])await expect(validateRoomMediaInverse('owner',f.card,f.receipt,f.before,{...f.asset,id})).rejects.toThrow();const{previousAssetDigest,...legacy}=f.receipt;await expect(validateRoomMediaInverse('owner',f.card,legacy,f.before,{...f.asset,id:'fresh'})).rejects.toThrow();});
it('removes an exact prior Add and refuses to treat replacement as reference-removal Undo',async()=>{const added=await fixture(true);expect(await validateRoomMediaInverse('owner',added.card,added.receipt,added.before)).toEqual(added.before);const replaced=await fixture();await expect(validateRoomMediaInverse('owner',replaced.card,replaced.receipt,replaced.before)).rejects.toThrow();});
it('rejects using an inverse receipt as a newly advertised forward Undo target',async()=>{const f=await fixture();await expect(validateRoomMediaInverse('owner',f.card,{...f.receipt,undoOf:'earlier'},f.before,{...f.asset,id:'fresh'})).rejects.toThrow();});
