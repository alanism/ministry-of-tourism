// Trip commands (MOT-12): the only way to change a trip. Validate before writing.
import { z } from 'zod';
import {preferenceRoundSchema,tallyGroupPreferences} from './preference-tally.ts';
import {ballotKey,groupBallotKeySchema,groupBallotSchema,validateLocalBallot} from './group-ballot.ts';
import { groupPreferencesSchema, validateGroupUpdate } from './group-preferences.ts';
import * as Y from 'yjs';
import { CommandError, type CommandContext, type CommandDef } from '../commands/define.ts';
import { presentationScope, readAllCards, readAsset, readCard, readPresentation, readPresentations, readTripMeta, writeAsset, writeCard, writePresentation, type TripParts } from './model.ts';
import { tripMetaSchema, assetSchema, CARD_KINDS, currentFactSchema, datesSchema, presentationFieldsSchema, PROVENANCES, SCOPES, sourceRefSchema, STAGES, TASK_STATUSES, timeZoneSchema, tripCardSchema, type DestinationRecord, type TripCard } from './schema.ts';

/** Trip commands run against the trip doc's own parts, typed as such (#10: no BoardParts stand-in). */
export interface TripCommandContext { doc: Y.Doc; parts: TripParts; actor: CommandContext['actor']; newId: () => string; destinations?: readonly DestinationRecord[]; }
export type TripCommandDef<I, O> = Omit<CommandDef<I, O>, 'run'> & { run: (ctx: TripCommandContext, input: I) => O };
// Commands are stored together, so their input types are erased here.
export type TripCommand = TripCommandDef<any, unknown>;
export function defineTripCommand<I, O>(def: TripCommandDef<I, O>): TripCommandDef<I, O> {
  return def;
}

const id = z.string().min(1).max(200);
const opt = <T extends z.ZodType>(s: T) => s.optional();
function find(parts: TripParts, cardId: string): TripCard {
  const c = readCard(parts, cardId);
  if (!c) throw new CommandError('not_found', `No trip card ${cardId}`);
  return c;
}
const now = () => new Date().toISOString();

/** Referencing media is a read/sharing operation even when no existing card is being edited. */
export function assertAgentMediaAccess(parts:TripParts,assetIds:readonly string[]):void {
  const wanted=new Set(assetIds);
  if(readAllCards(parts).some(card=>card.scope==='private'&&card.assetIds.some(id=>wanted.has(id))) || readPresentations(parts).some(p=>p.assetId&&wanted.has(p.assetId)&&presentationScope(parts,p)==='private'))throw new CommandError('scope','Agents cannot reference private media');
}

export const tripCardCreate = defineTripCommand({
  name: 'trip_card_create', title: 'Create a trip card', description: 'Creates a trip card in a stage.',
  access: 'write',
  input: z.object({
    kind: z.enum(CARD_KINDS), title: z.string().max(500).default(''), body: z.string().max(20000).default(''),
    stage: z.enum(STAGES).default('plan'), status: opt(z.enum(TASK_STATUSES)), day: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    time: opt(z.string().regex(/^\d{2}:\d{2}$/)), placeId: opt(id),
    location: opt(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), source: z.enum(['catalog', 'traveler']) })),
    scope: opt(z.enum(SCOPES)), provenance: z.enum(PROVENANCES).default('traveler'),
    source: opt(sourceRefSchema), sourceText: opt(z.string().max(100000)), travelerNote: opt(z.string().max(20000)), currentFacts: opt(z.array(currentFactSchema).max(100)),
    assetIds: z.array(id).max(100).default([]), x: z.number().finite().default(0), y: z.number().finite().default(0),
  }).strict(),
  run: (ctx, input) => {
    if (input.status !== undefined && input.kind !== 'task') throw new CommandError('invalid_input', 'status is only for kind task');
    if(ctx.actor.kind==='agent')assertAgentMediaAccess(ctx.parts,input.assetIds);
    const cardId = ctx.newId();
    // A host publishes deliberately, so host cards start private. A traveler's own cards are their trip.
    const scope = input.scope ?? (ctx.parts.meta.get('kind') === 'host_guide' ? 'private' : 'stay');
    writeCard(ctx.parts, { ...input, scope, id: cardId, title: input.title, body: input.body, createdBy: ctx.actor.id, updatedAt: now(), assetIds: [...input.assetIds] });
    return { id: cardId };
  },
});

export const tripCardUpdate = defineTripCommand({
  name: 'trip_card_update', title: 'Update a trip card', description: 'Changes title, body, day, time or scope after validating. null clears day or time.',
  access: 'write',
  input: z.object({ id, title: opt(z.string().max(500)), body: opt(z.string().max(20000)), day: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()), time: opt(z.string().regex(/^\d{2}:\d{2}$/).nullable()), scope: opt(z.enum(SCOPES)), source: opt(sourceRefSchema), sourceText: opt(z.string().max(100000)), travelerNote: opt(z.string().max(20000)), currentFacts: opt(z.array(currentFactSchema).max(100)) }).strict(),
  run: (ctx, input) => {
    const card = find(ctx.parts, input.id);
    const day = input.day === null ? undefined : input.day ?? card.day;
    const time = input.time === null ? undefined : input.time ?? card.time;
    writeCard(ctx.parts, { ...card, title: input.title ?? card.title, body: input.body ?? card.body, day, time, scope: input.scope ?? card.scope, source: input.source ?? card.source, sourceText: input.sourceText ?? card.sourceText, travelerNote: input.travelerNote ?? card.travelerNote, currentFacts: input.currentFacts ?? card.currentFacts, updatedAt: now() });
    return { id: input.id };
  },
});

export const tripCardMove = defineTripCommand({
  name: 'trip_card_move', title: 'Move a trip card', description: 'Moves a card between stages and/or to x,y.',
  access: 'write',
  input: z.object({ id, stage: opt(z.enum(STAGES)), x: opt(z.number().finite()), y: opt(z.number().finite()) }).strict(),
  run: (ctx, input) => {
    const card = find(ctx.parts, input.id);
    writeCard(ctx.parts, { ...card, stage: input.stage ?? card.stage, x: input.x ?? card.x, y: input.y ?? card.y, updatedAt: now() });
    return { id: input.id };
  },
});

export const tripTaskSetStatus = defineTripCommand({
  name: 'trip_task_set_status', title: 'Set task status', description: 'Marks a task card open or done. Stage is unchanged.',
  access: 'write',
  input: z.object({ id, status: z.enum(TASK_STATUSES) }).strict(),
  run: (ctx, input) => {
    const card = find(ctx.parts, input.id);
    if (card.kind !== 'task') throw new CommandError('invalid_input', 'Only task cards have a status');
    writeCard(ctx.parts, { ...card, status: input.status, updatedAt: now() });
    return { id: input.id };
  },
});

export const tripAssetAttach = defineTripCommand({
  name: 'trip_asset_attach', title: 'Attach an asset', description: 'Registers an asset (bytes live outside the doc) and attaches it to a card.',
  access: 'write',
  input: z.object({ cardId: id, asset: assetSchema }).strict(),
  run: (ctx, input) => {
    const card = find(ctx.parts, input.cardId);
    if(ctx.actor.kind==='agent')assertAgentMediaAccess(ctx.parts,[input.asset.id]);
    writeAsset(ctx.parts, input.asset);
    if (!card.assetIds.includes(input.asset.id)) writeCard(ctx.parts, { ...card, assetIds: [...card.assetIds, input.asset.id], updatedAt: now() });
    return { id: input.asset.id };
  },
});

export const tripCardDelete = defineTripCommand({
  name: 'trip_card_delete', title: 'Delete a trip card', description: 'Removes a trip card.',
  access: 'sensitive',
  input: z.object({ id }).strict(),
  run: (ctx, input) => { find(ctx.parts, input.id); ctx.parts.cards.delete(input.id); for (const p of readPresentations(ctx.parts)) if (p.cardId === input.id) ctx.parts.presentations.delete(p.id); return { id: input.id }; },
});

/** Human-only lineage sync: sets synced fields + base from a planned guide update. */
export const tripLineageSync = defineTripCommand({
  name: 'trip_lineage_sync', title: 'Apply a guide update', description: 'Applies selected host guide fields to this guest card.',
  access: 'write', humanOnly: true,
  input: z.object({ id, card: tripCardSchema }).strict(),
  run: (ctx, input) => {
    const existing = find(ctx.parts, input.id);
    writeCard(ctx.parts, { ...input.card, id: existing.id, x: existing.x, y: existing.y, status: existing.status, travelerNote: existing.travelerNote, scope: 'guide', lineage: input.card.lineage, updatedAt: now() });
    return { id: input.id };
  },
});

export const tripRead = defineTripCommand({
  name: 'trip_read', title: 'Read the trip', description: 'Returns meta and cards as plain data. Agents never see private cards.',
  access: 'read', input: z.object({}).strict(),
  run: (ctx) => {
    const meta: Record<string, unknown> = {};
    for (const k of ['schemaVersion', 'boardId', 'kind', 'title', 'city', 'cityId', 'countryCode', 'timeZone', 'dates', 'party', 'agentMode']) meta[k] = ctx.parts.meta.get(k);
    const cards = readAllCards(ctx.parts).filter(card=>ctx.actor.kind!=='agent'||card.scope!=='private');
    const visible=new Set(cards.map(card=>card.id));
    const presentations=readPresentations(ctx.parts).filter(object=>(ctx.actor.kind!=='agent'||presentationScope(ctx.parts,object)!=='private')&&(!object.cardId||visible.has(object.cardId)));
    const assetIds=new Set([...cards.flatMap(card=>card.assetIds),...presentations.flatMap(object=>object.assetId?[object.assetId]:[])]);
    const assets=[...assetIds].map(id=>readAsset(ctx.parts,id)).filter(asset=>asset!==undefined);
    return { meta, cards, presentations, assets };
  },
});

export const tripMetaUpdate = defineTripCommand({
  name: 'trip_meta_update', title: 'Set destination', description: 'Changes validated trip destination and dates without altering cards.', access: 'write',
  input: z.object({city:tripMetaSchema.shape.city,cityId:opt(id),countryCode:tripMetaSchema.shape.countryCode,timeZone:timeZoneSchema,dates:opt(datesSchema)}).strict(),
  run: (ctx,input) => {
    if (input.cityId) {
      const destination = ctx.destinations?.find(d => d.id === input.cityId);
      if (!destination) throw new CommandError('invalid_input','Destination registry unavailable or unknown city ID');
      if (input.countryCode !== destination.countryCode || input.timeZone !== destination.timeZone || input.city !== destination.name) throw new CommandError('invalid_input','Destination country, timezone or name does not match its registry');
    } else if (!input.countryCode) throw new CommandError('invalid_input','Choose a country for an unlisted city');
    ctx.parts.meta.set('city',input.city);ctx.parts.meta.set('timeZone',input.timeZone);
    for (const key of ['cityId','countryCode'] as const) if (input[key] === undefined) ctx.parts.meta.delete(key); else ctx.parts.meta.set(key,input[key]);
    if (input.dates) ctx.parts.meta.set('dates',input.dates);
    const {groupPreferences,groupBallots,...publicMeta}=readTripMeta(ctx.doc);
    return ctx.actor.kind==='agent'?publicMeta:{...publicMeta,...(groupPreferences?{groupPreferences}:{}),...(groupBallots?{groupBallots}:{})};
  },
});

export const tripAssetRegister = defineTripCommand({
  name:'trip_asset_register',title:'Register trip media',description:'Registers media for a native decoration.',access:'write',input:z.object({asset:assetSchema}).strict(),
  run:(ctx,input)=>{if(ctx.actor.kind==='agent')assertAgentMediaAccess(ctx.parts,[input.asset.id]);writeAsset(ctx.parts,input.asset);return{id:input.asset.id};},
});

export const tripMagazineTeeSelect=defineTripCommand({
  name:'trip_magazine_tee_select',title:'Choose the worn tee',description:'Caches explicitly classified FCC apparel and selects the actual magazine tee.',access:'write',humanOnly:true,
  input:z.object({assetId:id,assets:z.array(assetSchema).min(1).max(3)}).strict(),
  run:(ctx,input)=>{
    const meta=readTripMeta(ctx.doc),ids=input.assets.map(asset=>asset.id);
    if(!meta.cityId||!ids.includes(input.assetId)||new Set(ids).size!==ids.length)throw new CommandError('invalid_input','Choose a cached tee for the current FCC city');
    for(const asset of input.assets){
      const art=asset.apparel;
      if(!art||art.originCityId!==meta.cityId||(art.source.cityId&&art.source.cityId!==meta.cityId))throw new CommandError('invalid_input','Only explicitly classified apparel from this city is eligible');
      if(asset.rightsStatus!=='approved'&&!asset.credit?.trim())throw new CommandError('invalid_input','The actual FCC credit is required');
      if(readAllCards(ctx.parts).some(card=>card.scope==='private'&&card.assetIds.includes(asset.id))||readPresentations(ctx.parts).some(p=>p.assetId===asset.id&&presentationScope(ctx.parts,p)==='private'))throw new CommandError('scope','Private media cannot become public issue apparel');
      const previous=readAsset(ctx.parts,asset.id);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(asset))throw new CommandError('invalid_input',`Asset ${asset.id} is immutable; register changed media with a new ID`);
    }
    for(const asset of input.assets)writeAsset(ctx.parts,asset);
    ctx.parts.meta.set('magazine',{wornTeeAssetId:input.assetId,apparelAssetIds:ids});return{assetId:input.assetId};
  },
});

export const tripPresentationCreate = defineTripCommand({
  name:'trip_presentation_create',title:'Place trip art',description:'Places media in this trip without creating a venue.',access:'write',
  input:presentationFieldsSchema.omit({id:true,boardId:true}).extend({x:z.number().min(0).max(1).default(0),y:z.number().min(0).max(1).default(0),width:z.number().positive().max(1).default(.3),height:z.number().positive().max(1).default(.3),crop:presentationFieldsSchema.shape.crop.default([0,0,1,1]),rotation:z.number().finite().default(0),zIndex:z.number().int().default(0),locked:z.boolean().default(false),scope:z.enum(SCOPES).optional()}).strict(),
  run:(ctx,input)=>{
    if(ctx.actor.kind==='agent'&&input.assetId)assertAgentMediaAccess(ctx.parts,[input.assetId]);
    const owner=input.cardId?find(ctx.parts,input.cardId):undefined;
    const p={...input,id:ctx.newId(),boardId:readTripMeta(ctx.doc).boardId,scope:input.scope??owner?.scope??'private'};
    writePresentation(ctx.parts,p);return{id:p.id};
  },
});
export const tripPresentationUpdate = defineTripCommand({
  name:'trip_presentation_update',title:'Arrange trip art',description:'Updates normalized crop, placement, rotation or lock.',access:'write',
  input:presentationFieldsSchema.omit({boardId:true}).partial().required({id:true}).strict(),
  run:(ctx,input)=>{const p=readPresentation(ctx.parts,input.id);if(!p)throw new CommandError('not_found','No such presentation');if(ctx.actor.kind==='agent'&&input.assetId)assertAgentMediaAccess(ctx.parts,[input.assetId]);writePresentation(ctx.parts,{...p,...input});return{id:p.id};},
});
export const tripPresentationDelete = defineTripCommand({
  name:'trip_presentation_delete',title:'Remove trip art',description:'Removes a placement without deleting its media.',access:'write',input:z.object({id}).strict(),
  run:(ctx,input)=>{if(!readPresentation(ctx.parts,input.id))throw new CommandError('not_found','No such presentation');ctx.parts.presentations.delete(input.id);return{id:input.id};},
});
export const tripPreferenceTally=defineTripCommand({name:'trip_preference_tally',title:'Tally supplied household responses',description:'Read-only deterministic K3/K5 points and response coverage from explicitly supplied configuration and ledger. Never reads private board ballots, changes the board or books anything.',access:'read',input:z.object({configuration:groupPreferencesSchema,ledger:z.unknown().optional(),round:preferenceRoundSchema}).strict(),run:async(_ctx,input)=>tallyGroupPreferences(input.configuration,input.ledger,input.round)});

export const tripBallotUpdate=defineTripCommand({
  name:'trip_ballot_update',title:'Save household shortlist',description:'Person-only local response. Rank, stamp and optional shared note stay independent; never books or shares anything.',access:'write',humanOnly:true,input:groupBallotSchema,
  run:(ctx,input)=>{
    const meta=readTripMeta(ctx.doc);
    try{validateLocalBallot(input,meta.groupPreferences);}catch(error){throw new CommandError('invalid_input',error instanceof Error?error.message:'Invalid ballot');}
    const ballots=meta.groupBallots??[],index=ballots.findIndex(b=>ballotKey(b)===ballotKey(input));
    if(index<0)ballots.push(input);else ballots[index]=input;
    ctx.parts.meta.set('groupBallots',ballots);return structuredClone(input);
  },
});
export const tripBallotRead=defineTripCommand({name:'trip_ballot_read',title:'Read local household responses',description:'Person-only local responses; no response is distinct from an empty shortlist.',access:'read',humanOnly:true,input:z.object({}).strict(),run:ctx=>readTripMeta(ctx.doc).groupBallots??[]});
export const tripBallotClear=defineTripCommand({name:'trip_ballot_clear',title:'Remove local household response',description:'Return a household and round to no response; Undo is available.',access:'write',humanOnly:true,input:groupBallotKeySchema,run:(ctx,input)=>{
  const meta=readTripMeta(ctx.doc);
  try{validateLocalBallot({...input,rankings:[],stamps:[],shared_note:''},meta.groupPreferences);}catch(error){throw new CommandError('invalid_input',error instanceof Error?error.message:'Invalid ballot');}
  ctx.parts.meta.set('groupBallots',(meta.groupBallots??[]).filter(b=>ballotKey(b)!==ballotKey(input)));return structuredClone(input);
}});

export const tripGroupConfigure = defineTripCommand({
  name:'trip_group_configure',title:'Declare group preference rounds',description:'Person-only: declare stable household labels and immutable K3/K5 rounds. This never records a vote or authenticates a household.',
  access:'write',humanOnly:true,input:groupPreferencesSchema,
  run:(ctx,input)=>{
    const meta=readTripMeta(ctx.doc);
    try{validateGroupUpdate(meta.groupPreferences,input,meta.boardId);}catch(error){throw new CommandError('invalid_input',error instanceof Error?error.message:'Invalid group declaration');}
    ctx.parts.meta.set('groupPreferences',input);return structuredClone(input);
  },
});
export const tripGroupRead = defineTripCommand({
  name:'trip_group_read',title:'Read group preference rounds',description:'Person-only roster and declared rounds. Household IDs are labels, not authentication.',
  access:'read',humanOnly:true,input:z.object({}).strict(),run:ctx=>readTripMeta(ctx.doc).groupPreferences??null,
});

export const TRIP_COMMANDS: TripCommand[] = [tripPreferenceTally,tripBallotUpdate,tripBallotRead,tripBallotClear,tripGroupConfigure, tripGroupRead, tripCardCreate, tripCardUpdate, tripCardMove, tripTaskSetStatus, tripAssetAttach, tripCardDelete, tripLineageSync, tripRead, tripMetaUpdate, tripAssetRegister,tripPresentationCreate,tripPresentationUpdate,tripPresentationDelete,tripMagazineTeeSelect];
