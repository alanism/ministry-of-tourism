// Trip schema v1 (MOT-10). Validated at every boundary: commands, import, copy.
import { z } from 'zod';
import { apparelArtRefSchema } from './merch.ts';

export const TRIP_SCHEMA_VERSION = 2;
export const STAGES = ['plan', 'prepare', 'arrive', 'explore', 'remember'] as const;
export type Stage = (typeof STAGES)[number];
export const CARD_KINDS = ['place', 'note', 'stay_fact', 'policy', 'task', 'offer', 'photo', 'brief'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const SCOPES = ['guide', 'stay', 'private'] as const;
export type Scope = (typeof SCOPES)[number];
export const PROVENANCES = ['host', 'traveler', 'fcc', 'agent', 'provider'] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const BOARD_KINDS = ['host_guide', 'guest', 'traveler'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const id = z.string().min(1).max(200);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD').refine(value=>{
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
},'Invalid calendar date');
const localTime = z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM');
export const timeZoneSchema = z.string().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Unknown IANA timezone').nullable();
export const datesSchema = z.object({ start: localDate, end: localDate }).strict().refine((dates) => dates.start <= dates.end, 'End date precedes start date');
const safeUrl = z.string().max(2000).url().refine((value) => /^https?:\/\//i.test(value), 'Source URL must use HTTP or HTTPS');
export const sourceRefSchema = z.object({
  id, url: safeUrl.optional(), retrievedAt: z.string().min(1),
  provider: z.literal('fcc').optional(), sourceId: id.optional(), canonicalUrl: safeUrl.optional(),
  cityId: id.optional(), countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  kind: z.enum(['article','venue','almanac','artwork']).optional(),
  publishedAt: z.string().optional(), updatedAt: z.string().optional(), version: z.string().optional(),
  contentHash: z.string().optional(), origin: z.enum(['editorial','catalogue','observation','artwork']).optional(),
}).strict();
export type TripSourceRef = z.infer<typeof sourceRefSchema>;
export const currentFactSchema = z.object({
  field: z.string().min(1).max(120), value: z.string().max(2000), evidenceUrl: safeUrl,
  observedAt: z.string().min(1), validUntil: z.string().optional(),
}).strict();
export interface DestinationRecord { id: string; name: string; countryCode: string; timeZone: string | null; }

export const tripMetaSchema = z.object({
  schemaVersion: z.literal(TRIP_SCHEMA_VERSION),
  boardId: id,
  kind: z.enum(BOARD_KINDS),
  title: z.string().min(1).max(300),
  city: z.string().min(1).max(120),
  cityId: id.optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  timeZone: timeZoneSchema,
  dates: datesSchema.optional(),
  party: z.enum(['solo', 'couple', 'family', 'business']).optional(),
  agentMode: z.enum(['solo', 'together', 'autopilot']),
  lineage: z.object({ guideBoardId: id, copiedAt: z.string().min(1) }).optional(),
  magazine: z.object({wornTeeAssetId:id,apparelAssetIds:z.array(id).min(1).max(3).refine(ids=>new Set(ids).size===ids.length)}).strict()
    .refine(value=>value.apparelAssetIds.includes(value.wornTeeAssetId),'The chosen tee must be cached').optional(),
}).strict();
export type TripMeta = z.infer<typeof tripMetaSchema>;

export const tripCardSchema = z.object({
  id,
  kind: z.enum(CARD_KINDS),
  title: z.string().max(500),
  body: z.string().max(20000),
  stage: z.enum(STAGES),
  status: z.enum(TASK_STATUSES).optional(),
  day: localDate.optional(),
  time: localTime.optional(),
  placeId: id.optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    source: z.enum(['catalog', 'traveler']),
  }).optional(),
  scope: z.enum(SCOPES),
  provenance: z.enum(PROVENANCES),
  source: sourceRefSchema.optional(),
  sourceText: z.string().max(100000).optional(),
  travelerNote: z.string().max(20000).optional(),
  currentFacts: z.array(currentFactSchema).max(100).optional(),
  assetIds: z.array(id).max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  createdBy: z.string().min(1).max(200),
  updatedAt: z.string().min(1),
  lineage: z.object({ guideCardId: id, guideRev: z.number().int().nonnegative(), base: z.string().max(50000) }).optional(),
}).strict();
export type TripCard = z.infer<typeof tripCardSchema>;

export const assetSchema = z.object({
  id,
  hash: z.string().regex(/^[a-f0-9]{64}$/, 'hash must be sha-256 hex'),
  mime: z.string().min(1).max(120),
  role: z.enum(['original', 'derivative']),
  derivedFrom: id.optional(),
  caption: z.string().max(1000).optional(),
  credit: z.string().max(1000).optional(),
  rightsStatus: z.enum(['approved','unknown','restricted']).optional(),
  source: sourceRefSchema.optional(),
  width: z.number().positive().optional(), height: z.number().positive().optional(),
  apparel: apparelArtRefSchema.optional(),
}).strict().refine(asset=>!asset.apparel||(asset.apparel.assetId===asset.id&&asset.apparel.hash===asset.hash&&asset.apparel.mimeType===asset.mime&&asset.apparel.credit===asset.credit&&asset.apparel.rightsStatus===asset.rightsStatus),'Cached apparel must match its registered image, hash and credit');
export type Asset = z.infer<typeof assetSchema>;

export const cropSchema = z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().positive().max(1),z.number().positive().max(1)])
  .refine(([x,y,w,h]) => x+w <= 1.000001 && y+h <= 1.000001, 'Crop must fit the original');
export const PRESENTATION_PATTERNS = ['personal-cover','city-feature','food-culture','map','correspondence'] as const;
/** Owner-selected editorial intent, independent of producer ArtRef classification. */
export const MAGAZINE_ART_ROLES = ['backdrop','foreground','city-ink','specimen','facade','interior','postcard','portrait','tag','stamp','vehicle','vignette','map'] as const;
export type MagazineArtRole = (typeof MAGAZINE_ART_ROLES)[number];
export const presentationFieldsSchema = z.object({
  id, boardId: id, cardId: id.optional(), assetId: id.optional(),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  crop: cropSchema, rotation: z.number().finite(), zIndex: z.number().int(), locked: z.boolean(), scope: z.enum(SCOPES),
  pattern:z.enum(PRESENTATION_PATTERNS).optional(),
  magazineRole:z.enum(MAGAZINE_ART_ROLES).optional(),
}).strict();
export const presentationSchema = presentationFieldsSchema.refine(p=>!!(p.cardId || p.assetId),'A presentation needs a card or asset');
export type Presentation = z.infer<typeof presentationSchema>;

/** Synced fields snapshot used for guest-copy lineage base. Layout/status excluded. */
export function syncedSnapshot(card: TripCard): string {
  return JSON.stringify({
    kind: card.kind, title: card.title, body: card.body, stage: card.stage,
    placeId: card.placeId ?? null, location: card.location ?? null,
    source: card.source ?? null, sourceText: card.sourceText ?? null,
    currentFacts: card.currentFacts ?? null, assetIds: card.assetIds,
  });
}

/** Deterministic local date (YYYY-MM-DD) for an instant in an IANA time zone. */
export function localDateFor(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
