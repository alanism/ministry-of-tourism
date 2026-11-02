import {expect,it} from 'vitest';
import {readRoomVotingSnapshot} from './room-emulator-voting-state';
import {roomVotingRoundId} from '../../core/src/trip/shared-room-voting-wire';
import {POSITIONAL_VOTING_METHOD,votingSealKey} from '../../core/src/trip/voting-contract';
import {tallyGroupPreferences} from '../../core/src/trip/preference-tally';
import {canonicalFileJson} from '../../core/src/trip/file-exchange-json';
import {sha256Hex} from '../../core/src/trip/sha256';
const config=(proposal:number)=>({version:1 as const,trip_id:'trip',households:[{household_id:'h1',display_name:'H1'},{household_id:'h2',display_name:'H2'}],rounds:[{round_id:'round',proposal_version:proposal,kind:'destination' as const,option_ids:['a','b'],rank_limit:3 as const,household_weighting:'one_household_one_vote' as const}]});
async function fixture(){const configuration=config(1),id=await roomVotingRoundId(configuration);return{state:{version:1,currentRoundId:id,proposalFloor:1,tripId:'trip',roundEpoch:1},rounds:[{id,version:1,epoch:1,configuration,method:POSITIONAL_VOTING_METHOD,status:'open' as const}],assignments:[],responses:[],history:[]};}
it('refuses ambiguous household authority and historical current-pointer rollback',async()=>{
 const s=await fixture();await expect(readRoomVotingSnapshot(null as never,null as never,{...s,assignments:[{householdId:'h1',memberUid:'same',epoch:1,version:1},{householdId:'h2',memberUid:'same',epoch:1,version:1}]})).rejects.toThrow();
 const configuration=config(2),id=await roomVotingRoundId(configuration);await expect(readRoomVotingSnapshot(null as never,null as never,{...s,state:{...s.state,proposalFloor:2,roundEpoch:2},rounds:[...s.rounds,{...s.rounds[0]!,id,epoch:2,configuration}]})).rejects.toThrow();
});
it('requires a self-validating seal to match the exact frozen declaration on its round record',async()=>{
 const s=await fixture(),configuration={...config(1),rounds:[{...config(1).rounds[0]!,option_ids:['a']}]},ledger={version:1 as const,trip_id:'trip',entries:[]},body={version:1 as const,configuration,method:POSITIONAL_VOTING_METHOD,purpose:'advisory_destination_comparison' as const,status:'closed' as const,ignoredResponseIds:[],ledger,acceptedResponseIds:[],tally:await tallyGroupPreferences(configuration,ledger,{proposal_version:1,round_id:'round'}),closedAt:'2026-11-03T00:00:00Z',closedBy:'owner',eventId:'12345678-1234-4234-8234-123456789012'},seal={...body,digest:await sha256Hex(new TextEncoder().encode(canonicalFileJson(body)))};
 expect(votingSealKey('trip',configuration.rounds[0]!)).toContain('round');await expect(readRoomVotingSnapshot(null as never,null as never,{...s,rounds:[{...s.rounds[0]!,status:'closed',seal}]})).rejects.toThrow();
});
