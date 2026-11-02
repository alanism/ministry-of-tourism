import {expect,it} from 'vitest';
import {withRoomVotingBytes} from './room-emulator-snapshot';

it('counts protected voting bytes against the same snapshot cap used by ordinary edits and media',()=>{
 const publicSnapshot={metadataBytes:1000,mediaBytes:500,totalBytes:1500,objectCount:1,mediaCount:1};
 const remaining=50*1024*1024-publicSnapshot.totalBytes;
 expect(withRoomVotingBytes(publicSnapshot,remaining)).toEqual({...publicSnapshot,metadataBytes:1000+remaining,totalBytes:50*1024*1024});
 expect(()=>withRoomVotingBytes(publicSnapshot,remaining+1)).toThrow(/50MiB/);
 expect(publicSnapshot).toEqual({metadataBytes:1000,mediaBytes:500,totalBytes:1500,objectCount:1,mediaCount:1});
});

it('refuses invalid voting measurements instead of reducing the room budget',()=>{
 const publicSnapshot={metadataBytes:1000,mediaBytes:500,totalBytes:1500,objectCount:1,mediaCount:1};
 for(const bytes of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])expect(()=>withRoomVotingBytes(publicSnapshot,bytes)).toThrow();
 expect(withRoomVotingBytes(publicSnapshot,0)).toEqual(publicSnapshot);
});
