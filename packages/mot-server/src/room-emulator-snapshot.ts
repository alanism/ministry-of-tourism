import type {Transaction,DocumentReference} from 'firebase-admin/firestore';
import {measureRoomSnapshot} from '../../core/src/trip/shared-room-limits.ts';
import {roomSnapshotSchema,type RoomCardRecord} from '../../core/src/trip/shared-room-domain.ts';
import {roomSharedMediaSchema,type RoomSharedMedia} from '../../core/src/trip/shared-room-media.ts';
import {measureRoomVotingState,type RoomVotingSnapshot} from '../../core/src/trip/shared-room-voting-wire.ts';
import {readRoomVotingSnapshot} from './room-emulator-voting-state.ts';
/** Fresh explicit public metadata only; admin maps/secrets/receipts never enter export payload. */
export function roomPublicMetadata(meta:Record<string,unknown>){return{id:meta.id,title:meta.title,schemaMajor:meta.schemaMajor};}
export function initialRoomAccounting(meta:Record<string,unknown>,cards:RoomCardRecord[]){return measureRoomSnapshot({metadata:roomPublicMetadata(meta),cards,presentations:[],assets:[]},[]);}
/** Protected household data shares the existing room ceiling without entering the ordinary feed. */
export function withRoomVotingBytes(measurement:ReturnType<typeof measureRoomSnapshot>,bytes:number){
 if(!Number.isSafeInteger(bytes)||bytes<0||measurement.totalBytes+bytes>50*1024*1024)throw Error('Room snapshot exceeds50MiB; preserve local draft');
 return{...measurement,metadataBytes:measurement.metadataBytes+bytes,totalBytes:measurement.totalBytes+bytes};
}
export interface RoomSnapshotChange {card?:{id:string;record:RoomCardRecord};asset?:RoomSharedMedia;replaceAssetId?:string;votingState?:RoomVotingSnapshot;}
/** Exact current reference closure. Private/unreferenced media tombstones are not public assets. */
export async function readRoomPublicSnapshot(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,change:RoomSnapshotChange={}){
 const[cards,presentations]=await Promise.all([tx.get(ref.collection('cards').limit(501)),tx.get(ref.collection('presentations').limit(501))]);
 if(presentations.size)throw Error('Unsupported presentation projection; preserve local draft');
 const parsed=cards.docs.map(doc=>({id:doc.id,record:roomSnapshotSchema.shape.cards.element.parse(doc.data())}));
 if(change.card){const found=parsed.find(p=>p.id===change.card!.id);if(!found)throw Error('Missing room entity');found.record=change.card.record;}
 const referenced=[...new Set(parsed.flatMap(p=>p.record.payload.assetIds))];if(referenced.length>200)throw Error('Room referenced media capacity');
 const assets=await Promise.all(referenced.map(async id=>{if(change.asset?.id===id)return roomSharedMediaSchema.parse(change.asset);const doc=await tx.get(ref.collection('media').doc(id));if(!doc.exists||doc.get('withdrawn'))throw Error('Referenced room media unavailable');const asset=roomSharedMediaSchema.parse(doc.get('payload'));if(asset.id!==id)throw Error('Room media identity mismatch');return asset;}));
 const snapshot={metadata:roomPublicMetadata(meta),cards:parsed.map(p=>p.record),presentations:[],assets};
 const voting=await readRoomVotingSnapshot(tx,ref,change.votingState),measurement=withRoomVotingBytes(measureRoomSnapshot(snapshot,assets.map(a=>({assetId:a.id,hash:a.hash,bytes:a.bytes}))),measureRoomVotingState(voting));
 return{snapshot,measurement};
}
/** Reconcile accepted records in the same transaction; never trust historical counters. */
export async function reconcileRoomAccounting(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,replacement?:{id:string;record:RoomCardRecord}){return(await readRoomPublicSnapshot(tx,ref,meta,replacement?{card:replacement}:{})).measurement;}
export async function mediaRoomAccounting(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,change:RoomSnapshotChange){return(await readRoomPublicSnapshot(tx,ref,meta,change)).measurement;}
export const roomAccountingFields=(m:ReturnType<typeof measureRoomSnapshot>)=>({snapshotBytes:m.totalBytes,snapshotMetadataBytes:m.metadataBytes,snapshotMediaBytes:m.mediaBytes,snapshotObjects:m.objectCount,snapshotMediaObjects:m.mediaCount});
export async function votingRoomAccounting(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,next:RoomVotingSnapshot){return roomAccountingFields((await readRoomPublicSnapshot(tx,ref,meta,{votingState:next})).measurement);}
