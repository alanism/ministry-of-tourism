import type {z} from 'zod';
import type {GroupPreferences} from './group-preferences.ts';
import {mergeResponseLedger,type ResponseLedger} from './response-ledger.ts';
import {tallyGroupPreferences,type PreferenceTally} from './preference-tally.ts';
import {TRIP_PACKAGE_LIMITS} from './package-limits.ts';
import {sha256Hex} from './sha256.ts';
import {votingSealSchema,votingSealKey,sameVotingRound,type ManagedVotingRound} from './voting-contract.ts';

export type VotingSeal=Omit<z.infer<typeof votingSealSchema>,'tally'> & {tally:PreferenceTally;trip_id:string;proposal_version:number;round_id:string};
export const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
export const encoded=(value:unknown)=>new TextEncoder().encode(stable(value));
export function bounded(value:unknown){if(encoded(value).length>TRIP_PACKAGE_LIMITS.fileBytes)throw new Error('Voting history exceeds the existing portable file limit; keep a backup and start a separate trip');}
export function purpose(configuration:GroupPreferences){return configuration.rounds[0]!.kind==='destination'?'advisory_destination_comparison' as const:'advisory_activity_shortlist' as const;}
export function eligibleLedger(d:Pick<ManagedVotingRound,'ignoredResponseIds'>,ledger:ResponseLedger):ResponseLedger{return{...ledger,entries:ledger.entries.filter(e=>!d.ignoredResponseIds.includes(e.response.response_id))};}
function sealAliases(seal:z.infer<typeof votingSealSchema>):VotingSeal{return{...seal,tally:seal.tally as PreferenceTally,trip_id:seal.configuration.trip_id,proposal_version:seal.configuration.rounds[0]!.proposal_version,round_id:seal.configuration.rounds[0]!.round_id};}
export async function validateVotingSeal(key:string,raw:unknown){const seal=votingSealSchema.parse(raw),round=seal.configuration.rounds[0]!;bounded(seal);if(key!==votingSealKey(seal.configuration.trip_id,round)||seal.ledger.trip_id!==seal.configuration.trip_id||seal.ledger.entries.some(e=>!sameVotingRound(e.response,round)))throw new Error('Closed voting identity does not match its snapshot');if(seal.purpose!==purpose(seal.configuration))throw new Error('Closed voting purpose does not match the declared round');await mergeResponseLedger(seal.configuration,seal.ledger,[]);const accepted=(await mergeResponseLedger(seal.configuration,eligibleLedger(seal,seal.ledger),[])).current.map(r=>r.response_id);if(stable(accepted)!==stable(seal.acceptedResponseIds))throw new Error('Closed voting counted identities do not match the canonical snapshot');const tally=await tallyGroupPreferences(seal.configuration,eligibleLedger(seal,seal.ledger),{proposal_version:round.proposal_version,round_id:round.round_id});if(stable(tally)!==stable(seal.tally))throw new Error('Closed voting tally does not match its canonical response snapshot');const{digest,...body}=seal;if(await sha256Hex(encoded(body))!==digest)throw new Error('Closed voting snapshot digest does not match');return sealAliases(seal);}
