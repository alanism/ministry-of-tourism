import {expect,it} from 'vitest';
import {validateVotingSeal} from './voting-lifecycle';
import {votingSealKey,POSITIONAL_VOTING_METHOD} from './voting-contract';
import {tallyGroupPreferences} from './preference-tally';
import {canonicalFileJson} from './file-exchange-json';
import {sha256Hex} from './sha256';
it('reuses the existing123 sealed result validator and rejects a forged frozen tally',async()=>{
 const configuration={version:1,trip_id:'trip',households:[{household_id:'h',display_name:'Household'}],rounds:[{round_id:'round',proposal_version:1,kind:'destination',option_ids:['a','b'],rank_limit:3,household_weighting:'one_household_one_vote'}]},ledger={version:1,trip_id:'trip',entries:[]},key={proposal_version:1,round_id:'round'},tally=await tallyGroupPreferences(configuration,ledger,key),body={version:1,configuration,method:POSITIONAL_VOTING_METHOD,purpose:'advisory_destination_comparison',status:'closed',ignoredResponseIds:[],ledger,acceptedResponseIds:[],tally,closedAt:'2026-11-03T00:00:00.000Z',closedBy:'owner',eventId:'12345678-1234-4234-8234-123456789012'},seal={...body,digest:await sha256Hex(new TextEncoder().encode(canonicalFileJson(body)))};
 expect((await validateVotingSeal(votingSealKey('trip',key),seal)).tally.total_points).toBe(0);
 await expect(validateVotingSeal(votingSealKey('trip',key),{...seal,tally:{...tally,total_points:99}})).rejects.toThrow('tally');
});
