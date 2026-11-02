import type {Transaction,DocumentReference} from 'firebase-admin/firestore';
import {roomVotingSnapshotSchema,roomVotingRoundId,roomVotingResponseId,type RoomVotingSnapshot} from '../../core/src/trip/shared-room-voting-wire.ts';
import {validateGroupResponse} from '../../core/src/trip/group-preferences.ts';
import {validateVotingSeal} from '../../core/src/trip/voting-seal.ts';
import {votingSealKey} from '../../core/src/trip/voting-contract.ts';
import {canonicalFileJson} from '../../core/src/trip/file-exchange-json.ts';
/** No public snapshot dependency: ordinary accounting may safely import this protected reader. */
export async function readRoomVotingSnapshot(tx:Transaction,ref:DocumentReference,change?:RoomVotingSnapshot):Promise<RoomVotingSnapshot>{
 let raw:unknown=change;
 if(!raw){const[index,assignments,rounds,responses,history]=await Promise.all([tx.get(ref.collection('voting').doc('state')),tx.get(ref.collection('votingAssignments').limit(9)),tx.get(ref.collection('votingRounds').limit(101)),tx.get(ref.collection('votingResponses').limit(801)),tx.get(ref.collection('votingHistory').limit(1001))]);
  if(!index.exists&&assignments.size+rounds.size+responses.size+history.size)throw Error('Missing protected voting index');
  for(const doc of assignments.docs)if(doc.id!==doc.data().householdId)throw Error('Household assignment document identity mismatch');
  for(const doc of [...rounds.docs,...responses.docs])if(doc.id!==doc.data().id)throw Error('Voting record document identity mismatch');
  for(const doc of history.docs)if(doc.id!==doc.data().response?.response_id)throw Error('Voting history document identity mismatch');
  raw={state:index.exists?index.data():{version:0,currentRoundId:null,proposalFloor:0,tripId:null,roundEpoch:0},assignments:assignments.docs.map(d=>d.data()),rounds:rounds.docs.map(d=>d.data()),responses:responses.docs.map(d=>d.data()),history:history.docs.map(d=>d.data())};
 }
 const s=roomVotingSnapshotSchema.parse(raw),rounds=new Map(s.rounds.map(r=>[r.id,r]));
 if(rounds.size!==s.rounds.length||new Set(s.assignments.map(a=>a.householdId)).size!==s.assignments.length||new Set(s.responses.map(r=>r.id)).size!==s.responses.length||new Set(s.history.map(r=>r.response.response_id)).size!==s.history.length)throw Error('Duplicate protected voting identity');
 if(s.state.currentRoundId!==null&&!rounds.has(s.state.currentRoundId))throw Error('Missing current voting round');
 const current=s.state.currentRoundId?rounds.get(s.state.currentRoundId):undefined,uids=s.assignments.flatMap(a=>a.memberUid?[a.memberUid]:[]);if(new Set(uids).size!==uids.length)throw Error('Ambiguous household assignment authority');
 if(current){if(current.epoch!==s.state.roundEpoch||current.configuration.rounds[0]!.proposal_version!==s.state.proposalFloor||Math.max(...s.rounds.map(r=>r.configuration.rounds[0]!.proposal_version))!==s.state.proposalFloor||s.assignments.some(a=>!current.configuration.households.some(h=>h.household_id===a.householdId)))throw Error('Current voting declaration pointer mismatch');}else if(s.rounds.length+s.assignments.length+s.responses.length+s.history.length||s.state.version!==0||s.state.tripId!==null||s.state.proposalFloor!==0||s.state.roundEpoch!==0)throw Error('Missing protected voting index');
 for(const round of s.rounds){if(round.id!==await roomVotingRoundId(round.configuration)||round.configuration.trip_id!==s.state.tripId)throw Error('Voting declaration identity mismatch');if(round.seal){if(canonicalFileJson(round.seal.configuration)!==canonicalFileJson(round.configuration))throw Error('Sealed snapshot differs from frozen voting declaration');await validateVotingSeal(votingSealKey(round.configuration.trip_id,round.configuration.rounds[0]!),round.seal);}}
 const validated=new Set<string>();for(const row of [...s.responses,...s.history]){const round=rounds.get(row.roundId);if(!round||row.id!==await roomVotingResponseId(row.roundId,row.householdId)||row.receipt.kind!=='respond'||row.receipt.entityId!==row.id||row.receipt.uid!==row.uid)throw Error('Household response identity mismatch');const declared=round.configuration.rounds[0]!;if(row.response.trip_id!==round.configuration.trip_id||row.response.proposal_version!==declared.proposal_version||row.response.round_id!==declared.round_id||row.response.household_id!==row.householdId||!round.configuration.households.some(h=>h.household_id===row.householdId))throw Error('Response belongs to another voting declaration');if(!validated.has(row.response.response_id)){await validateGroupResponse(row.response,round.configuration);validated.add(row.response.response_id);}}
 return s;
}
