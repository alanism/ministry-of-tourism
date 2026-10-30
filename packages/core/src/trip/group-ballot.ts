// Person-edited local responses. File envelopes, revision merging and tallying are separate.
import {z} from 'zod';
import {groupRoundSchema,groupResponseSchema,type GroupPreferences} from './group-preferences.ts';

export const groupBallotKeySchema=z.object({proposal_version:groupRoundSchema.shape.proposal_version,round_id:groupRoundSchema.shape.round_id,household_id:groupResponseSchema.shape.household_id}).strict();
export const groupBallotSchema=groupBallotKeySchema.extend({rankings:groupResponseSchema.shape.rankings,stamps:groupResponseSchema.shape.stamps,shared_note:groupResponseSchema.shape.shared_note}).refine(ballot=>
 new Set(ballot.rankings.map(r=>r.option_id)).size===ballot.rankings.length&&new Set(ballot.rankings.map(r=>r.rank)).size===ballot.rankings.length&&ballot.rankings.every(r=>r.rank<=ballot.rankings.length)&&new Set(ballot.stamps.map(s=>s.option_id)).size===ballot.stamps.length,
 'Ranks must be unique and contiguous; stamps must be unique');
export type GroupBallot=z.infer<typeof groupBallotSchema>;
export const ballotKey=(ballot:z.infer<typeof groupBallotKeySchema>)=>JSON.stringify([ballot.proposal_version,ballot.round_id,ballot.household_id]);
export const groupBallotsSchema=z.array(groupBallotSchema).max(10000).refine(ballots=>new Set(ballots.map(ballotKey)).size===ballots.length,'One local response per household and round');

export function validateLocalBallot(ballot:GroupBallot,group:GroupPreferences|undefined):void{
 const round=group?.rounds.find(r=>r.round_id===ballot.round_id&&r.proposal_version===ballot.proposal_version);
 if(!round||!group?.households.some(h=>h.household_id===ballot.household_id))throw new Error('Choose a declared household and round');
 if(ballot.rankings.length>round.rank_limit)throw new Error('Response exceeds the declared rank limit');
 if([...ballot.rankings,...ballot.stamps].some(item=>!round.option_ids.includes(item.option_id)))throw new Error('Response contains an option outside this round');
}
