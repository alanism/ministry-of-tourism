import {expect,it} from 'vitest';
import {roomMediaDiscardResultSchema} from './shared-room-media-wire';
it('accepts only an acknowledged service stage discard, without private or authority fields',()=>{
 expect(roomMediaDiscardResultSchema.parse({discarded:true})).toEqual({discarded:true});
 expect(roomMediaDiscardResultSchema.safeParse({discarded:false}).success).toBe(false);
 expect(roomMediaDiscardResultSchema.safeParse({discarded:true,inviteSecret:'private'}).success).toBe(false);
});
