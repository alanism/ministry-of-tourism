import { z } from 'zod';
import { CommandError } from '../commands/define.ts';
import type { TripCommandDef } from './commands.ts';
import { readCard, readPresentation, readTripMeta, writeAsset, writeCard, writePresentation, type TripParts } from './model.ts';
import { assetSchema, presentationFieldsSchema, presentationSchema, tripCardSchema } from './schema.ts';
import { boardRev } from './revisions.ts';
import { selectedAssetClosure } from './asset-closure.ts';
import type { SameBoardCopyRef } from './board-duplicate.ts';

export const BOARD_CLIPBOARD_METADATA_BYTES = 1024 * 1024;
const id = z.string().min(1).max(200);
// Wire data has no authority fields. Observations are readable source text, never currentFacts.
const cardData = z.object(tripCardSchema.shape).omit({scope:true,provenance:true,createdBy:true,updatedAt:true,currentFacts:true,booking:true,bookingAttention:true,lineage:true}).strict();
const placementData = presentationFieldsSchema.omit({boardId:true,scope:true}).strict();
const graphSchema = z.object({version:z.literal(1),sourceBoardId:id,label:z.string().max(1000),cards:z.array(cardData).max(5),presentations:z.array(placementData).max(5),assets:z.array(assetSchema).max(5)}).strict();
export type BoardClipboardGraph = z.infer<typeof graphSchema>;
export function validateBoardClipboard(raw: unknown): BoardClipboardGraph {
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > BOARD_CLIPBOARD_METADATA_BYTES) throw new Error('Copied metadata exceeds 1 MiB. Use a native trip package instead.');
  const graph = graphSchema.parse(raw);
  if (!graph.cards.length && !graph.presentations.length || graph.cards.length + graph.presentations.length > 5) throw new Error('Copy between one and five board items.');
  const all = [...graph.cards,...graph.presentations,...graph.assets], ids = new Set(all.map(v=>v.id));
  if (ids.size !== all.length) throw new Error('Duplicate clipboard IDs; nothing was copied.');
  for (const c of graph.cards) {
    if (c.status !== undefined && c.kind !== 'task') throw new Error('Status is only for task cards.');
    tripCardSchema.parse({...c,scope:'private',provenance:'traveler',createdBy:'clipboard',updatedAt:'clipboard'});
  }
  for (const p of graph.presentations) {
    if (p.surface !== 'board' || p.cardId || !p.assetId || p.locked || p.magazineLayout || p.pattern || p.magazineRole) throw new Error('Only unlocked board images can be copied here. Use a native trip package for other media.');
    presentationSchema.parse({...p,boardId:graph.sourceBoardId,scope:'private'});
  }
  const assets = new Map(graph.assets.map(a=>[a.id,a])), used = new Set<string>(), active = new Set<string>();
  const visit = (id:string) => {
    if (active.has(id)) throw new Error('Media ancestry cycle; nothing was copied.');
    if (used.has(id)) return;
    const a = assets.get(id);if (!a) throw new Error(`Missing media ancestor ${id}. Use a native trip package.`);
    if (a.apparel || !/^image\/(png|jpeg|webp)$/.test(a.mime)) throw new Error('Unsupported clipboard media metadata. Use a native trip package.');
    active.add(id);if(a.derivedFrom)visit(a.derivedFrom);active.delete(id);used.add(id);
  };
  for (const c of graph.cards) for (const id of c.assetIds) visit(id);
  for (const p of graph.presentations) visit(p.assetId!);
  if (used.size !== assets.size) throw new Error('Clipboard contains unrelated media. Nothing was copied.');
  return graph;
}
/** Metadata is frozen before the caller begins asynchronous original-byte reads. */
export function captureBoardClipboard(source:{boardId:string;parts:TripParts}, ref:SameBoardCopyRef):BoardClipboardGraph {
  const cards: BoardClipboardGraph['cards'] = [], presentations: BoardClipboardGraph['presentations'] = [];
  if ('sourceCardId' in ref) {
    const c = readCard(source.parts,ref.sourceCardId);if(!c)throw new Error('That card is no longer on this board.');
    const {scope:_scope,provenance:_provenance,createdBy:_creator,updatedAt:_updated,currentFacts,booking:_booking,bookingAttention:_attention,lineage:_lineage,...data} = c;
    cards.push({...data,...(currentFacts?.length?{sourceText:[c.sourceText??'','Imported observations - unverified clipboard data',JSON.stringify(currentFacts,null,2)].join('\n\n')}:{})});
  } else {
    const p = readPresentation(source.parts,ref.sourcePresentationId);if(!p)throw new Error('That image is no longer on this board.');
    const {boardId:_board,scope:_scope,...data}=p;presentations.push(data);
  }
  const assets=selectedAssetClosure(source.parts,[...cards.flatMap(c=>c.assetIds),...presentations.flatMap(p=>p.assetId?[p.assetId]:[])]);
  return validateBoardClipboard({version:1,sourceBoardId:source.boardId,label:cards[0]?.title||assets.find(a=>a.id===presentations[0]?.assetId)?.caption||'Board image',cards,presentations,assets});
}
const pasteInput=z.object({graph:z.unknown(),targetBoardId:id,expectedRevision:z.number().int().nonnegative(),x:z.number().finite(),y:z.number().finite()}).strict();
export const tripBoardPaste: TripCommandDef<z.infer<typeof pasteInput>,{cardIds:string[];presentationIds:string[]}> = {
  name:'trip_board_paste',title:'Add a private board copy',description:'Imports a bounded frozen graph as private human-owned copies, without booking or confirmed-fact authority.',access:'write',humanOnly:true,input:pasteInput,
  run:(ctx,input)=>{
    if(ctx.actor.kind!=='human')throw new CommandError('human_only','trip_board_paste can only be run by a person');
    if(readTripMeta(ctx.doc).boardId!==input.targetBoardId || boardRev(ctx.parts)!==input.expectedRevision)throw new CommandError('invalid_input','The target trip changed. Preview the copy again; nothing was added.');
    const graph=validateBoardClipboard(input.graph);
    const reserved=new Set([...ctx.parts.cards.keys(),...ctx.parts.presentations.keys(),...ctx.parts.assets.keys(),...graph.cards.map(v=>v.id),...graph.presentations.map(v=>v.id),...graph.assets.map(v=>v.id)]);
    const remap=new Map<string,string>();
    for(const record of [...graph.assets,...graph.cards,...graph.presentations]){
      const next=ctx.newId();if(!id.safeParse(next).success || reserved.has(next))throw new CommandError('invalid_input','Generated ID collision; nothing was copied.');reserved.add(next);remap.set(record.id,next);
    }
    const minX=Math.min(...graph.cards.map(c=>c.x),...graph.presentations.map(p=>p.x*10000)),minY=Math.min(...graph.cards.map(c=>c.y),...graph.presentations.map(p=>p.y*10000));
    const assets=graph.assets.map(a=>assetSchema.parse({...a,id:remap.get(a.id)!,...(a.derivedFrom?{derivedFrom:remap.get(a.derivedFrom)!}:{})}));
    const cards=graph.cards.map(c=>tripCardSchema.parse({...c,id:remap.get(c.id)!,assetIds:c.assetIds.map(id=>remap.get(id)!),scope:'private',provenance:'traveler',createdBy:ctx.actor.id,updatedAt:new Date().toISOString(),x:c.x-minX+input.x,y:c.y-minY+input.y}));
    const presentations=graph.presentations.map(p=>presentationSchema.parse({...p,id:remap.get(p.id)!,assetId:remap.get(p.assetId!)!,boardId:input.targetBoardId,scope:'private',x:(p.x*10000-minX+input.x)/10000,y:(p.y*10000-minY+input.y)/10000}));
    // All IDs, complete records, references and geometry passed before the first Yjs write.
    for(const a of assets)writeAsset(ctx.parts,a);for(const c of cards)writeCard(ctx.parts,c);for(const p of presentations)writePresentation(ctx.parts,p);
    return {cardIds:cards.map(c=>c.id),presentationIds:presentations.map(p=>p.id)};
  },
};
