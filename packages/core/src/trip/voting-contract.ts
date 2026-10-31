import {z} from 'zod';
import {groupPreferencesSchema,responseLedgerSchema} from './group-preferences.ts';
export const votingMethodSchema=z.object({id:z.literal('mot-household-sticker-points'),version:z.literal(1)}).strict();
export const POSITIONAL_VOTING_METHOD=votingMethodSchema.parse({id:'mot-household-sticker-points',version:1});
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const managedVotingRoundSchema=z.object({version:z.literal(1),configuration:groupPreferencesSchema.refine(g=>g.rounds.length===1,'A managed declaration binds one round'),method:votingMethodSchema,purpose:z.enum(['advisory_destination_comparison','advisory_activity_shortlist']),status:z.enum(['draft','open']),ignoredResponseIds:z.array(hash).max(1000).refine(a=>new Set(a).size===a.length)}).strict();
export const votingSealSchema=managedVotingRoundSchema.extend({status:z.literal('closed'),ledger:responseLedgerSchema,acceptedResponseIds:z.array(hash).max(100).refine(a=>new Set(a).size===a.length),tally:z.unknown(),digest:hash,closedAt:z.iso.datetime({offset:true}),closedBy:z.string().min(1).max(200),eventId:z.string().uuid()}).strict();
export type ManagedVotingRound=z.infer<typeof managedVotingRoundSchema>;
export type VotingRoundKey={proposal_version:number;round_id:string};
export const VOTING_SEAL_PREFIX='votingSeal:';
export function votingSealKey(trip_id:string,key:VotingRoundKey){return VOTING_SEAL_PREFIX+JSON.stringify([trip_id,key.proposal_version,key.round_id]);}
export function sameVotingRound(a:VotingRoundKey,b:VotingRoundKey){return a.proposal_version===b.proposal_version&&a.round_id===b.round_id;}
