import {expect,it} from 'vitest';
import {attemptRoomRedemption,attemptRoomWrite,type RoomAttemptWindow,type RoomWriteBucket} from './shared-room-limits.ts';

it('retains the latest denied redemption attempts in both bounded windows',()=>{
 let account:RoomAttemptWindow|undefined,network:RoomAttemptWindow|undefined;
 for(const now of [...Array<number>(10).fill(0),...Array<number>(10).fill(59000)]){
  const result=attemptRoomRedemption(account,network,now);account=result.account;network=result.network;
  if(now===59000)expect(result.allowed).toBe(false);
 }
 const result=attemptRoomRedemption(account,network,60001);
 expect(result.allowed).toBe(false);
 expect(result.account.attempts).toEqual([...Array<number>(9).fill(59000),60001]);
 expect(result.network.attempts).toEqual(result.account.attempts);
 expect(result.retryAfterMs).toBe(58999);
 expect(attemptRoomRedemption(result.account,result.network,120001).allowed).toBe(true);
});

it('retains rolling write denials even after the original capped attempts expire',()=>{
 let state:RoomWriteBucket|undefined;
 for(const now of [...Array<number>(60).fill(0),...Array<number>(60).fill(59000)]){
  const result=attemptRoomWrite(state,now);state=result.state;
  if(now===59000)expect(result.allowed).toBe(false);
 }
 const result=attemptRoomWrite(state,60001);
 expect(result.allowed).toBe(false);
 expect(result.state.attempts).toEqual([...Array<number>(59).fill(59000),60001]);
 expect(result.retryAfterMs).toBe(58999);
 expect(attemptRoomWrite(result.state,120001).allowed).toBe(true);
});
