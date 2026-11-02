import{expect,it,vi}from'vitest';
import{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import{SharedRoomMediaUndoPanel}from'./shared-room-media-undo-panel';
import{createSharedRoomClient}from'./shared-room-client';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
const session={id:'a'.repeat(64),roomId:'room',uid:'owner',membershipEpoch:2,active:true,createdAt:1};
function fixture(){
 const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:async()=>{throw Error('Rendering grants no authority');}},session}),card={id:'card',kind:'note' as const,title:'Selected note',body:'Keep note',stage:'plan' as const,provenance:'traveler' as const,assetIds:['new'],x:0,y:0},room:RoomSnapshot={serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1','room-media/1','room-media-undo/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:2,householdId:null,householdEpoch:null},cards:[{version:2,authorUid:'owner',updatedAt:1,payload:card}],assets:[{id:'new',mime:'image/png',hash:'b'.repeat(64),width:1,height:1,bytes:70}],sync:'accepted'};
 const target={capture:{client,uid:'owner',roomId:'room',sessionId:session.id,membershipEpoch:2,beforeCard:{...card,assetIds:[]}},receipt:{operationId:'forward',uid:'owner',kind:'media' as const,cardId:'card',assetId:'new',version:2,requestDigest:'c'.repeat(64),beforeDigest:'d'.repeat(64),afterDigest:'e'.repeat(64),acceptedAt:1}};
 return{active:true,client,room,session,target,onChanged:vi.fn(),onAccessUnavailable:vi.fn()};
}
it('offers a reviewable inverse only on a currently advertised and matching writer context',()=>{
 const props=fixture(),html=renderToStaticMarkup(createElement(SharedRoomMediaUndoPanel,props));expect(html).toContain('Review photo Undo');expect(html).toContain('session');expect(html).not.toContain('<img');
});
it('withholds inverse controls and previews for hidden or legacy contexts',()=>{
 const props=fixture();expect(renderToStaticMarkup(createElement(SharedRoomMediaUndoPanel,{...props,active:false}))).toBe('');
 const html=renderToStaticMarkup(createElement(SharedRoomMediaUndoPanel,{...props,room:{...props.room,capabilities:['room-cards/1','room-media/1']}}));expect(html).not.toContain('Review photo Undo');expect(html).not.toContain('<img');
});
