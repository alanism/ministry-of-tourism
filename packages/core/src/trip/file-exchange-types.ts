import type { Actor } from '../doc/model.ts';
import type { Asset, TripCard } from './schema.ts';
import type { ComparisonToken } from './revisions.ts';
import type { Proposal } from './proposals.ts';

export type FileCommand = 'trip_card_create' | 'trip_card_update' | 'trip_card_move' | 'trip_task_set_status' | 'trip_asset_attach';
export interface ContextRequest {
  format: 'mot.context'; version: 1; contextRequestId: string; boardId: string;
  baseBoardRevision: number; nativeToken: ComparisonToken; contextDigest: string;
  createdAt: string; expiresAt: string; capabilitiesVersion: 'mot.public-file/1';
  guideVersion: string; catalogSnapshot: string; privacy: 'shared-selected'; purpose: 'trip-ideas';
  allowedCommands: FileCommand[]; selectedCardIds: string[];
  context: { trip: { title: string; cityId: string; timeZone: string | null };
    cards: (Pick<TripCard, 'id' | 'kind' | 'title' | 'body' | 'assetIds'> & { scope: 'guide' | 'stay' })[];
    assetRefs: { id: string; catalogSnapshot: string; sourceVersion: string }[]; constraints: string[] };
}
export interface ProposalEnvelope {
  format: 'mot.proposal'; version: 1; contextRequestId: string; boardId: string; baseBoardRevision: number;
  contextDigest: string; createdAt: string; expiresAt: string; proposal: Proposal & { status: 'proposed' };
}
export interface FileContextRecord { version: number; boardId: string; contextRequestId: string; documentIdentity: string;
  actorId: string; fingerprint: string; context: ContextRequest; assets: Asset[]; revoked: boolean }
export type FileProposalState = 'review' | 'applying' | 'applied-in-memory' | 'persisted' | 'rejected' | 'expired' | 'undoing' | 'undone';
export interface FileProposalRecord { version: number; boardId: string; proposalId: string; contextRequestId: string;
  envelopeHash: string; envelope: ProposalEnvelope; state: FileProposalState; selected: number[]; applied: number[];
  revision: number; fingerprint: string; nativeLedger: unknown; liveSessionId: string; }
export interface FileExchangeStore {
  withBoardLock<T>(boardId: string, work: () => Promise<T>): Promise<T>;
  getContext(boardId: string, contextRequestId: string): Promise<FileContextRecord | null>;
  putContext(record: FileContextRecord, expectedVersion: number | null): Promise<void>;
  getProposal(boardId: string, proposalId: string): Promise<FileProposalRecord | null>;
  putProposal(record: FileProposalRecord, expectedVersion: number | null): Promise<void>;
  list(boardId: string): Promise<FileProposalRecord[]>;
}
export interface FileExchangeOptions {
  documentIdentity: string; readDocumentIdentity: () => Promise<string>; whenSaved: () => Promise<void>;
  hasAssetBytes: (id: string) => Promise<boolean>; hasPendingNativeProposalId: (id: string) => boolean;
  now?: () => number; randomId?: () => string;
}
export interface IssueContextInput { selectedCardIds: string[]; assetIds?: string[]; allowedCommands?: FileCommand[];
  guideVersion: string; catalogSnapshot: string; constraints?: string[]; expiresAt?: string; }
export interface FileReview { readonly proposalId: string; readonly envelopeHash: string; readonly envelope: ProposalEnvelope;
  readonly state: FileProposalState; readonly applied: readonly number[]; }
export interface FileReceipt { proposalId: string; appliedOps: number; remainingOps: number; boardRev: number;
  persisted: boolean; state: FileProposalState | 'recovery-required'; message?: string }
export type FileHuman = Actor & { kind: 'human' };
