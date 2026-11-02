import{afterEach,expect,it,vi}from'vitest';import{prepareSharedRoomPng}from'./shared-room-media-prepare';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('refuses unsupported or oversized originals before reading or allocating a decoder',async()=>{
 const read=vi.fn(),decode=vi.fn();vi.stubGlobal('createImageBitmap',decode);for(const file of[{size:10*1024*1024+1,type:'image/png',arrayBuffer:read},{size:70,type:'image/jpeg',arrayBuffer:read}])await expect(prepareSharedRoomPng(file as unknown as File,new AbortController().signal)).rejects.toThrow();expect(read).not.toHaveBeenCalled();expect(decode).not.toHaveBeenCalled();
});
