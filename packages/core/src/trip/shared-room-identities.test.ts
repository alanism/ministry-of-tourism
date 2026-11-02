import {expect,it} from 'vitest';
import {sharedRoomCardSchema} from './shared-room-domain.ts';
import {roomCreateRequestSchema} from './shared-room-admission.ts';
const card={id:'valid-card',kind:'note',title:'Shared',body:'Visible',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0};
it('rejects path and prototype-like native IDs instead of publishing unreachable room entities',()=>{for(const id of ['nested/path/card','__proto__','../card','']){expect(()=>sharedRoomCardSchema.parse({...card,id})).toThrow();expect(()=>roomCreateRequestSchema.parse({schemaMajor:1,capability:'room-admission/1',operationId:'a'.repeat(64),baseVersion:0,roomId:'room',title:'Room',cards:[{...card,id}]})).toThrow();}expect(sharedRoomCardSchema.parse(card).id).toBe('valid-card');});
