import {afterEach,expect,it,vi} from 'vitest';
import {signInSharedRoomEmulator} from './shared-room-auth';
afterEach(()=>vi.unstubAllEnvs());
const config={authBaseUrl:'http://127.0.0.1:9099',projectId:'demo-mot-rooms'};
it('keeps production/unconfigured auth unavailable without fetching or storing credentials',async()=>{
 vi.stubEnv('DEV',false);const fetcher=vi.fn();await expect(signInSharedRoomEmulator(config,'synthetic@example.test','synthetic-password',undefined,fetcher)).rejects.toThrow(/unavailable/i);expect(fetcher).not.toHaveBeenCalled();
});
it('uses actual emulator password exchange and retains its issued token only in the live session',async()=>{
 vi.stubEnv('DEV',true);const fetcher=vi.fn<typeof fetch>(async()=>Response.json({localId:'actual-issued-uid',email:'synthetic@example.test',idToken:'actual-emulator-issued-token',expiresIn:'3600',refreshToken:'NEVER-RETAIN-THIS'}));
 const session=await signInSharedRoomEmulator(config,'synthetic@example.test','synthetic-password',undefined,fetcher);expect(String(fetcher.mock.calls[0]![0])).toBe('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-emulator-key');expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({email:'synthetic@example.test',password:'synthetic-password',returnSecureToken:true});
 expect(session.uid).toBe('actual-issued-uid');expect(await session.getIdToken()).toBe('actual-emulator-issued-token');expect(JSON.stringify(session)).not.toContain('actual-emulator-issued-token');expect(JSON.stringify(session)).not.toContain('NEVER-RETAIN-THIS');session.signOut();await expect(session.getIdToken()).rejects.toThrow();
});
