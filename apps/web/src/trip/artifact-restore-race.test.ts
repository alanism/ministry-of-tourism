import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const storage=vi.hoisted(()=>({read:vi.fn(),remove:vi.fn()}));
vi.mock('./artifact-store',()=>({readArtifact:storage.read,removeArtifact:storage.remove,artifactSha256:vi.fn(),keepArtifact:vi.fn()}));
const record={id:'race-artifact',boardId:'board',revision:7,filename:'trip.mot.zip',mime:'application/zip',byteCount:5,createdAt:'2026-10-29T00:00:00Z',sha256:'a'.repeat(64),scope:'stay',format:'zip',blob:new Blob(['bytes'])};
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
beforeEach(()=>{vi.resetModules();storage.read.mockReset();storage.remove.mockReset().mockResolvedValue(undefined);});
afterEach(()=>vi.restoreAllMocks());
it('a restore that finishes after removal cannot resurrect the file or allocate a URL',async()=>{
 const pending=deferred<typeof record>(),url=vi.spyOn(URL,'createObjectURL');storage.read.mockReturnValueOnce(pending.promise).mockResolvedValue(null);const artifacts=await import('./artifacts');
 const restoring=artifacts.restoreTripArtifact(record.id);await artifacts.forgetTripArtifact(record.id);pending.resolve(record);
 await expect(restoring).rejects.toThrow(/cancel|removed/i);expect(url).not.toHaveBeenCalled();await expect(artifacts.restoreTripArtifact(record.id)).rejects.toThrow(/no longer|fresh export/i);
});
it('does not restore or read a kept file while its removal is pending',async()=>{
 const pending=deferred<void>();storage.remove.mockReturnValue(pending.promise);storage.read.mockResolvedValue(record);const artifacts=await import('./artifacts'),removing=artifacts.forgetTripArtifact(record.id);
 await expect(artifacts.restoreTripArtifact(record.id)).rejects.toThrow(/remov/i);expect(storage.read).not.toHaveBeenCalled();pending.resolve();await removing;
});
it('concurrent restores share one verified file URL',async()=>{
 storage.read.mockResolvedValue(record);const url=vi.spyOn(URL,'createObjectURL'),artifacts=await import('./artifacts'),[a,b]=await Promise.all([artifacts.restoreTripArtifact(record.id),artifacts.restoreTripArtifact(record.id)]);
 expect(a.url).toBe(b.url);expect(url).toHaveBeenCalledTimes(1);
});
it('coalesces duplicate removals and revokes the live file URL once',async()=>{
 storage.read.mockResolvedValue(record);const pending=deferred<void>(),artifacts=await import('./artifacts'),file=await artifacts.restoreTripArtifact(record.id),revoke=vi.spyOn(URL,'revokeObjectURL');storage.remove.mockReturnValue(pending.promise);
 const a=artifacts.forgetTripArtifact(record.id),b=artifacts.forgetTripArtifact(record.id);expect(storage.remove).toHaveBeenCalledTimes(1);pending.resolve();await Promise.all([a,b]);expect(revoke).toHaveBeenCalledExactlyOnceWith(file.url);
});
it('a failed removal leaves the existing download and allows another removal attempt',async()=>{
 storage.read.mockResolvedValue(record);const artifacts=await import('./artifacts'),file=await artifacts.restoreTripArtifact(record.id),revoke=vi.spyOn(URL,'revokeObjectURL');storage.remove.mockRejectedValueOnce(Error('storage unavailable'));
 await expect(artifacts.forgetTripArtifact(record.id)).rejects.toThrow('storage unavailable');expect((await artifacts.restoreTripArtifact(record.id)).url).toBe(file.url);expect(revoke).not.toHaveBeenCalled();await artifacts.forgetTripArtifact(record.id);expect(revoke).toHaveBeenCalledExactlyOnceWith(file.url);
});
