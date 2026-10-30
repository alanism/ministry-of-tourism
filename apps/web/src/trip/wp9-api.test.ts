import {expect,it} from 'vitest';
import {encodeTrip,GUIDE_VERSION} from '@writers-board/core';
import {wp9Trip} from '../../../../packages/core/src/trip/wp9-test-fixtures';
import {createTripApi} from './agentApi';
it('routes against the native WP8 ledger without exposing household/private content or writing',async()=>{
 const {session}=wp9Trip(),before=encodeTrip(session.doc),api=createTripApi(session);
 expect((await api.routeGroup({text:'Plan our trip'})).group_coverage).toMatchObject({pending:2,responding:0});
 for(const request of [{text:'Rename this card'},{text:'Add a photo'},{workflow:'keepsake'}]){const route=await api.route(request);expect(route.questions).toEqual([]);expect(route.group).toBeUndefined();}
 expect(JSON.stringify([api.context(),await api.route({text:'Plan our trip'}),api.memories()])).not.toMatch(/PRIVATE|Original source/);
 expect(api.guidance(GUIDE_VERSION)).toMatchObject({version:GUIDE_VERSION,unchanged:true});expect(api.capabilities().guidance).toMatchObject({version:GUIDE_VERSION});expect(encodeTrip(session.doc)).toEqual(before);
});
it('validates adaptation and routing boundaries and requires explicitly shared planning context',async()=>{
 const {session,configuration,planning}=wp9Trip(),before=encodeTrip(session.doc),api=createTripApi(session);
 expect((await api.proposeAdaptation({kind:'delay',day:'2026-11-01',until:'13:00'})).proposal).toBeNull();
 expect((await api.proposeAdaptation({kind:'delay',day:'2026-11-01',until:'13:00'},{configuration,planning})).changes).toHaveLength(2);
 await expect(api.proposeAdaptation({kind:'delay',day:'2026-02-30',until:'25:00'})).rejects.toThrow();
 expect(()=>api.route({text:'Plan'},{includePrivate:true})).toThrow();
 expect(()=>api.memories({'x':'approved'})).toThrow();expect(encodeTrip(session.doc)).toEqual(before);
 const receipt=api.execute({boardId:session.boardId,revision:session.boardRev,ops:[{command:'trip_card_create',input:{kind:'note',title:'A note'}}]});expect(receipt.guide).toEqual({guide_id:'mot-trip-best-practices',version:GUIDE_VERSION});
 expect(()=>session.execute({kind:'agent',id:'bad',name:'Agent'},'trip_memory_react',{cardId:api.read().cards[0]!.id,reaction:'keep'})).toThrow();
 session.destroy();
});
