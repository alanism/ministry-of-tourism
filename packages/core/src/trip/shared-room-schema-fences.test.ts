import {expect,it} from 'vitest';
import {sharedRoomCardSchema} from './shared-room-domain.ts';
it('rejects unknown nested room location fields instead of normalizing away private input',()=>{const card={id:'card',kind:'note',title:'Shared',body:'Visible',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0,location:{lat:1,lng:2,source:'traveler'}};expect(sharedRoomCardSchema.parse(card)).toEqual(card);expect(()=>sharedRoomCardSchema.parse({...card,location:{...card.location,privateCanary:'UNKNOWN'}})).toThrow();});
