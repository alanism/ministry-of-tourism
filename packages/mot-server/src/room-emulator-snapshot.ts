import type {Transaction,DocumentReference} from 'firebase-admin/firestore';
import {measureRoomSnapshot} from '../../core/src/trip/shared-room-limits.ts';
import {roomSnapshotSchema,type RoomCardRecord} from '../../core/src/trip/shared-room-domain.ts';
import {roomSharedMediaSchema} from '../../core/src/trip/shared-room-media.ts';
/** Fresh explicit public metadata only; admin maps/secrets/receipts are never export payload. */
export function roomPublicMetadata(meta:Record<string,unknown>){return{id:meta.id,title:meta.title,schemaMajor:meta.schemaMajor};}
export function initialRoomAccounting(meta:Record<string,unknown>,cards:RoomCardRecord[]){return measureRoomSnapshot({metadata:roomPublicMetadata(meta),cards,presentations:[],assets:[]},[]);}
/** Read authoritative accepted records in the same transaction; never trust the historical counter. */
export async function reconcileRoomAccounting(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,replacement?:{id:string;record:RoomCardRecord}){
 const[cards,presentations,media]=await Promise.all([tx.get(ref.collection('cards').limit(501)),tx.get(ref.collection('presentations').limit(501)),tx.get(ref.collection('media').limit(201))]);
 if(presentations.size)throw Error('Unsupported presentation projection; preserve local draft');
 const parsed=cards.docs.map(doc=>({id:doc.id,record:roomSnapshotSchema.shape.cards.element.parse(doc.data())}));
 if(replacement){const found=parsed.find(p=>p.id===replacement.id);if(!found)throw Error('Missing room entity');found.record=replacement.record;}
 const assets=media.docs.map(doc=>roomSharedMediaSchema.parse(doc.data()?.payload));
 return measureRoomSnapshot({metadata:roomPublicMetadata(meta),cards:parsed.map(p=>p.record),presentations:[],assets},assets.map(a=>({assetId:a.id,hash:a.hash,bytes:a.bytes})));
}
export const roomAccountingFields=(m:ReturnType<typeof measureRoomSnapshot>)=>({snapshotBytes:m.totalBytes,snapshotMetadataBytes:m.metadataBytes,snapshotMediaBytes:m.mediaBytes,snapshotObjects:m.objectCount,snapshotMediaObjects:m.mediaCount});
