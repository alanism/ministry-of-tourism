import { z } from 'zod';
import { validateBoardClipboard, type Actor, type BoardClipboardGraph, type TripSession } from '@mot/core';
import { hashBlob } from '../state/blobs';
import { commitTripBlobs, getTripBlob } from './trip-assets';
import { prepareBoardImages } from './board-images';
export const CLIPBOARD_PREFIX = 'MOT-BOARD-CLIPBOARD/';
const MARKER = CLIPBOARD_PREFIX + '1\n', OUTER_BYTES = 72 * 1024 * 1024, FILE_BYTES = 10 * 1024 * 1024;
const envelopeSchema = z.object({graph:z.unknown(),media:z.array(z.object({id:z.string().min(1).max(200),base64:z.string().max(4*Math.ceil(FILE_BYTES/3))}).strict()).max(5)}).strict();
export interface ClipboardTransfer { graph:BoardClipboardGraph; media:Blob[]; text:string; }
// One ready frozen copy, explicitly replaced/cleared by a person. No source session reference.
let localCopy: ClipboardTransfer | null = null;
export const readLocalBoardCopy = () => localCopy;
export const keepLocalBoardCopy = (copy:ClipboardTransfer|null) => { localCopy=copy; };
function checkSize(text:string) { if(text.length>OUTER_BYTES || new TextEncoder().encode(text).byteLength>OUTER_BYTES) throw new Error('The board clipboard exceeds 72 MiB. Use a native trip package.'); }
function base64(blob:Blob):Promise<string> { return blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}); }
export function parseClipboardTransfer(text:string):ClipboardTransfer|null {
  if(!text.startsWith(CLIPBOARD_PREFIX))return null;
  checkSize(text);if(!text.startsWith(MARKER))throw new Error('Unsupported board clipboard version. Use a native trip package.');
  let parsed: z.infer<typeof envelopeSchema>;
  try { parsed=envelopeSchema.parse(JSON.parse(text.slice(MARKER.length))); } catch { throw new Error('Invalid board clipboard envelope. Nothing was added. Use a native trip package.'); }
  const graph=validateBoardClipboard(parsed.graph),byId=new Map(parsed.media.map(m=>[m.id,m]));
  if(byId.size!==parsed.media.length || byId.size!==graph.assets.length || parsed.media.some(m=>!graph.assets.some(a=>a.id===m.id)))throw new Error('Missing or unrelated clipboard original. Nothing was added.');
  let total=0;
  // Validate every base64 length before expanding any original.
  for(const m of parsed.media){if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.base64))throw new Error('Invalid clipboard original encoding.');const size=m.base64.length/4*3-(m.base64.endsWith('==')?2:m.base64.endsWith('=')?1:0);total+=size;if(!size||size>FILE_BYTES||total>50*1024*1024)throw new Error('Clipboard originals exceed the portable media limits.');}
  const media=graph.assets.map(a=>{const binary=atob(byId.get(a.id)!.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:a.mime});});
  return{graph,media,text};
}
async function verifiedMedia(graph:BoardClipboardGraph,media:readonly Blob[],signal:AbortSignal):Promise<Blob[]> {
  signal.throwIfAborted();if(media.length!==graph.assets.length)throw new Error('Missing clipboard originals.');
  if(media.some(b=>!b.size||b.size>FILE_BYTES)||media.reduce((n,b)=>n+b.size,0)>50*1024*1024)throw new Error('Clipboard originals exceed the portable media limits.');
  for(let i=0;i<media.length;i++){if(await hashBlob(media[i]!)!==graph.assets[i]!.hash)throw new Error('Clipboard original failed its checksum. Nothing was added.');signal.throwIfAborted();}
  const prepared=await prepareBoardImages(media.map((blob,i)=>new File([blob],graph.assets[i]!.id,{type:graph.assets[i]!.mime})),signal);
  for(let i=0;i<prepared.length;i++){const a=graph.assets[i]!,p=prepared[i]!;if(a.width!==undefined&&a.width!==p.width || a.height!==undefined&&a.height!==p.height)throw new Error('Clipboard original dimensions changed. Nothing was added.');}
  signal.throwIfAborted();return prepared.map(p=>p.blob);
}
export async function captureClipboardTransfer(raw:BoardClipboardGraph,signal:AbortSignal):Promise<ClipboardTransfer> {
  const graph=validateBoardClipboard(raw),media:Blob[]=[];
  for(const a of graph.assets){signal.throwIfAborted();const blob=await getTripBlob(a.hash);signal.throwIfAborted();if(!blob)throw new Error('A selected original is missing. Restore it or use a native trip package.');media.push(blob);}
  await verifiedMedia(graph,media,signal);
  const encoded=[];for(let i=0;i<media.length;i++){encoded.push({id:graph.assets[i]!.id,base64:await base64(media[i]!)});signal.throwIfAborted();}
  const text=MARKER+JSON.stringify({graph,media:encoded});checkSize(text);return{graph,media,text};
}
const flights=new WeakMap<TripSession,{signal:AbortSignal}>();
export async function pasteClipboardTransfer(session:TripSession,actor:Actor,transfer:ClipboardTransfer,signal:AbortSignal,options:{x:number;y:number;expectedRevision:number;isCurrent?:()=>boolean;onCommitted?:()=>void}):Promise<{persisted:boolean}> {
  const earlier=flights.get(session);if(earlier&&!earlier.signal.aborted)throw new Error('A board copy is already being added.');
  const flight={signal};flights.set(session,flight);const boardId=session.boardId;
  const current=()=>{signal.throwIfAborted();if(flights.get(session)!==flight||options.isCurrent?.()===false||session.boardId!==boardId||session.boardRev!==options.expectedRevision)throw new Error('The target trip changed. Preview the copy again; nothing was added.');};
  try{
    current();const graph=validateBoardClipboard(transfer.graph),media=await verifiedMedia(graph,transfer.media,signal);current();let applied=false;
    return await commitTripBlobs(media,hashes=>{
      if(applied)return;current();if(hashes.some((hash,i)=>hash!==graph.assets[i]?.hash)||hashes.length!==graph.assets.length)throw new Error('Clipboard original checksum changed.');
      session.execute(actor,'trip_board_paste',{graph,targetBoardId:boardId,expectedRevision:options.expectedRevision,x:options.x,y:options.y});applied=true;
      try{options.onCommitted?.();}catch{/* Observers cannot invalidate the committed graph/staged originals. */}
    },signal);
  }finally{if(flights.get(session)===flight)flights.delete(session);}
}
