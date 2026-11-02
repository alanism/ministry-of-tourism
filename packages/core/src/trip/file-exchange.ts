// Durable local identity/journal around the existing native proposal engine. No network access.
import { z } from 'zod';
import contract from '../../../../docs/mcp-public-file.schema.json' with { type: 'json' };
import type { Actor } from '../doc/model.ts';
import { assertAgentMediaAccess } from './commands.ts';
import { readAsset, readCard, readTripMeta } from './model.ts';
import { encodeTrip, loadTrip } from './persist.ts';
import { applyProposal, prevalidateProposal, undoProposal, type Proposal } from './proposals.ts';
import { sha256Hex } from './sha256.ts';
import { TripSession } from './session.ts';
import { canonicalFileJson, FILE_BYTES, parseFileJson } from './file-exchange-json.ts';
import type { ContextRequest, ProposalEnvelope, FileContextRecord, FileProposalRecord, FileExchangeStore, FileExchangeOptions, IssueContextInput, FileReview, FileReceipt } from './file-exchange-types.ts';
export * from './file-exchange-types.ts';
const schemaFor = (name: string) => z.fromJSONSchema({ $schema: contract.$schema, $defs: contract.$defs, $ref: '#/$defs/' + name } as unknown as Parameters<typeof z.fromJSONSchema>[0]);
const contextSchema = schemaFor('contextRequest'), proposalSchema = schemaFor('proposalArtifact');
const encoder = new TextEncoder();
const digest = (value: unknown) => sha256Hex(encoder.encode(canonicalFileJson(value)));
const equal = (a: unknown, b: unknown) => canonicalFileJson(a) === canonicalFileJson(b);
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
function fail(message: string): never { throw new Error(message); }
const states = new Set(['review', 'applying', 'applied-in-memory', 'persisted', 'rejected', 'expired', 'undoing', 'undone']);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
const safeUrl = (value: string) => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !/[\u0000-\u0020\u007f]/.test(value); } catch { return false; } };

export class FileExchange {
  private alive = true;
  private busy = false;
  private readonly liveSessionId = crypto.randomUUID();
  private readonly actor: Actor;
  private readonly reviews = new WeakMap<FileReview, { proposalId: string; envelopeHash: string }>();
  private readonly recoverable = new Map<string, FileProposalRecord>();
  private readonly session: TripSession;
  private readonly store: FileExchangeStore;
  private readonly options: FileExchangeOptions;
  constructor(session: TripSession, actor: Actor, store: FileExchangeStore, options: FileExchangeOptions) {
    this.actor = { ...actor }; this.session = session; this.store = store; this.options = options;
    if (!options.documentIdentity || typeof options.hasPendingNativeProposalId !== 'function') fail('A native document identity and pending-proposal guard are required.');
  }
  private now() { const value = (this.options.now ?? Date.now)(); if (!Number.isSafeInteger(value)) fail('The local clock is unavailable.'); return value; }
  private check(signal?: AbortSignal) { if (!this.alive) fail('This file session was cancelled; reissue context.'); if (this.actor.kind !== 'human') fail('Only a person can review or apply a local proposal.'); signal?.throwIfAborted(); }
  private async identity(signal?: AbortSignal) { this.check(signal); const id = await this.options.readDocumentIdentity(); this.check(signal); if (id !== this.options.documentIdentity) fail('The native document identity changed; reissue context.'); }
  // Native Yjs GC can change update bytes after reopen without changing state. Bind durable receipts
  // to complete sorted logical document state; retain raw bytes for same-session async fences.
  private capture() { return { bytes: encodeTrip(this.session.doc), fingerprintBytes: encoder.encode(JSON.stringify(this.session.doc.toJSON(), (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value)), revision: this.session.boardRev }; }
  private unchanged(capture: ReturnType<FileExchange['capture']>, signal?: AbortSignal) { this.check(signal); if (this.session.boardRev !== capture.revision || !sameBytes(capture.bytes, encodeTrip(this.session.doc))) fail('The trip changed; reissue context.'); }
  private encoded(value: unknown) { const bytes = encoder.encode(canonicalFileJson(value)); if (bytes.length > FILE_BYTES) fail('File exceeds the 512 KiB limit.'); return bytes; }
  private async grant(contextId: string): Promise<FileContextRecord> {
    const record = await this.store.getContext(this.session.boardId, contextId); this.check();
    if (!record || record.boardId !== this.session.boardId || record.contextRequestId !== contextId || record.documentIdentity !== this.options.documentIdentity || record.actorId !== this.actor.id || !Number.isSafeInteger(record.version)) fail('No matching locally issued context exists for this native document.');
    contextSchema.parse(record.context);
    const { contextDigest, ...body } = record.context;
    if (await digest(body) !== contextDigest || record.context.boardId !== record.boardId || record.context.nativeToken.boardId !== record.boardId || !equal(Object.keys(record.context.nativeToken.cardRevs).sort(), [...record.context.selectedCardIds].sort()) || !equal(record.context.context.cards.map(card => card.id).sort(), [...record.context.selectedCardIds].sort())) fail('The local context receipt is corrupt; reissue context.');
    this.check(); return record;
  }
  private active(grant: FileContextRecord, envelope?: ProposalEnvelope) {
    if (grant.revoked) fail('This context was revoked; reissue context.');
    const now = this.now(), created = Date.parse(grant.context.createdAt), expiry = Date.parse(grant.context.expiresAt);
    if (!Number.isFinite(created) || !Number.isFinite(expiry) || created > now || expiry <= now || expiry - created > 86400000 || expiry <= created) fail('This context expired or its clock is invalid; reissue context.');
    if (envelope) { const start = Date.parse(envelope.createdAt), end = Date.parse(envelope.expiresAt); if (!Number.isFinite(start) || !Number.isFinite(end) || start < created || start > now || end > expiry || end <= now || end <= start) fail('The proposal expiry is outside its locally issued context.'); }
  }
  private async record(id: string): Promise<FileProposalRecord | null> {
    const record = await this.store.getProposal(this.session.boardId, id); this.check();
    if (!record) return null;
    if (record.boardId !== this.session.boardId || record.proposalId !== id || !Number.isSafeInteger(record.version) || !states.has(record.state)) fail('The proposal journal is corrupt; inspect and reissue.');
    proposalSchema.parse(record.envelope);
    if (record.contextRequestId !== record.envelope.contextRequestId || record.envelope.proposal.id !== id || record.envelopeHash !== await digest(record.envelope) || !unique(record.applied) || record.applied.some(i => !Number.isInteger(i) || !record.envelope.proposal.ops[i])) fail('The proposal journal identity is corrupt; inspect and reissue.');
    this.check(); return record;
  }
  private nativeLedger(id: string) { return this.session.parts.applied.get(id) ?? null; }
  private collision(id: string) { if (this.session.parts.applied.has(id) || this.session.canUndo(`proposal:${id}`) || this.options.hasPendingNativeProposalId(id)) fail('A native proposal identity already exists without this trusted file reservation. Reissue with a fresh ID.'); }
  private binding(envelope: ProposalEnvelope, grant: FileContextRecord) {
    const context = grant.context;
    if (envelope.boardId !== context.boardId || envelope.proposal.boardId !== context.boardId || envelope.contextRequestId !== context.contextRequestId || envelope.contextDigest !== context.contextDigest || envelope.baseBoardRevision !== context.baseBoardRevision || !equal(envelope.proposal.token, context.nativeToken)) fail('Proposal board, context, digest, revision or token does not match local issuance.');
  }
  private async references(envelope: ProposalEnvelope, grant: FileContextRecord) {
    const selected = new Set(grant.context.selectedCardIds), assets = new Map(grant.assets.map(asset => [asset.id, asset]));
    for (const op of envelope.proposal.ops) {
      if (!grant.context.allowedCommands.includes(op.command as ContextRequest['allowedCommands'][number])) fail('This operation is outside the locally selected capabilities.');
      const id = op.command === 'trip_card_create' ? undefined : op.input.id ?? op.input.cardId;
      if (id !== undefined && (typeof id !== 'string' || !selected.has(id) || readCard(this.session.parts, id)?.scope === 'private')) fail('An existing-card operation escapes the selected public context.');
      if (op.command === 'trip_card_update' && typeof id === 'string' && readCard(this.session.parts, id)?.source && op.input.body !== undefined) fail('Source text cannot be replaced; propose a traveler note instead.');
      const ids = op.command === 'trip_card_create' ? op.input.assetIds as string[] | undefined : op.command === 'trip_asset_attach' ? [(op.input.asset as { id: string }).id] : [];
      for (const assetId of ids ?? []) {
        const asset = assets.get(assetId), current = readAsset(this.session.parts, assetId);
        if (!asset || !current || !equal(asset, current)) fail('This media reference is not locally authorized.');
        assertAgentMediaAccess(this.session.parts, [assetId]);
        if (op.command === 'trip_asset_attach' && !equal(op.input.asset, asset)) fail('A file cannot replace authorized media metadata.');
        if (!await this.options.hasAssetBytes(assetId)) fail('Authorized media bytes are unavailable locally; no fetch was attempted.'); this.check();
      }
    }
    for (const source of envelope.proposal.sources) if (source.url && !safeUrl(source.url)) fail('An unsafe source reference was refused.');
  }
  private native(envelope: ProposalEnvelope): Proposal { return { ...envelope.proposal, author: 'local-file:untrusted' }; }
  private preflight(envelope: ProposalEnvelope, selected: number[], ledger: unknown) {
    const proposal = this.native(envelope), chosen = { ...proposal, ops: selected.map(i => proposal.ops[i]!) };
    const revs = ledger && typeof ledger === 'object' && 'revs' in ledger ? (ledger as { revs: Record<string, number> }).revs : {};
    prevalidateProposal(this.session, chosen, revs);
    const trial = new TripSession(loadTrip(encodeTrip(this.session.doc)));
    try { trial.executeAll(this.actor, chosen.ops); } finally { trial.destroy(); trial.doc.destroy(); }
  }
  private async current(record: FileProposalRecord, grant: FileContextRecord, signal?: AbortSignal) {
    if (Date.parse(grant.context.expiresAt) <= this.now() || Date.parse(record.envelope.expiresAt) <= this.now()) { await this.put(record, { state: 'expired' }); fail('This proposal expired; reissue context.'); }
    await this.identity(signal); this.active(grant, record.envelope);
    if (!record.applied.length) this.collision(record.proposalId);
    const capture = this.capture(), expectedRevision = record.applied.length ? record.revision : grant.context.baseBoardRevision, fingerprint = record.applied.length ? record.fingerprint : grant.fingerprint;
    if (capture.revision !== expectedRevision || await sha256Hex(capture.fingerprintBytes) !== fingerprint || !equal(this.nativeLedger(record.proposalId), record.nativeLedger)) fail('The trip or native receipt changed; reissue context.');
    this.unchanged(capture, signal); return capture;
  }
  private async put(record: FileProposalRecord, patch: Partial<FileProposalRecord>) { const next = { ...record, ...patch, version: record.version + 1 }; await this.store.putProposal(next, record.version); return next; }
  private trusted(review: FileReview) { this.check(); const trusted = this.reviews.get(review); if (!trusted) fail('Only a trusted local review can authorize this action.'); return trusted; }
  private review(record: FileProposalRecord): FileReview { const result = freeze({ proposalId: record.proposalId, envelopeHash: record.envelopeHash, envelope: structuredClone(record.envelope), state: record.state, applied: [...record.applied] }); this.reviews.set(result, { proposalId: record.proposalId, envelopeHash: record.envelopeHash }); return result; }
  async issue(input: IssueContextInput): Promise<{ context: ContextRequest; bytes: Uint8Array }> {
    this.check(); await this.identity(); const capture = this.capture(), meta = readTripMeta(this.session.doc), assetIds = input.assetIds ?? [];
    if (input.selectedCardIds.length + assetIds.length > 100 || !unique(input.selectedCardIds) || !unique(assetIds)) fail('Choose at most 100 unique selected references.');
    if (!meta.cityId) fail('A registered trip city is required before sharing context.');
    const assets = [];
    for (const id of assetIds) { const asset = readAsset(this.session.parts, id); if (!asset || asset.source?.provider !== 'fcc' || !asset.source.version || !safeUrl(asset.source.canonicalUrl ?? asset.source.url ?? '')) fail('Only locally available public FCC asset references can be selected.'); assertAgentMediaAccess(this.session.parts, [id]); if (!await this.options.hasAssetBytes(id)) fail('Selected media bytes are unavailable locally.'); assets.push(asset); }
    const cards = input.selectedCardIds.map(id => { const card = readCard(this.session.parts, id); if (!card || card.scope === 'private') fail('Private or missing cards cannot be shared.'); return { id: card.id, kind: card.kind, title: card.title, body: card.body, scope: card.scope, assetIds: card.assetIds.filter(assetId => assetIds.includes(assetId)) }; });
    const created = this.now();
    const body = { format: 'mot.context' as const, version: 1 as const, contextRequestId: (this.options.randomId ?? (() => crypto.randomUUID()))(), boardId: this.session.boardId, baseBoardRevision: capture.revision, nativeToken: this.session.token(input.selectedCardIds), createdAt: new Date(created).toISOString(), expiresAt: input.expiresAt ?? new Date(created + 86400000).toISOString(), capabilitiesVersion: 'mot.public-file/1' as const, guideVersion: input.guideVersion, catalogSnapshot: input.catalogSnapshot, privacy: 'shared-selected' as const, purpose: 'trip-ideas' as const, allowedCommands: input.allowedCommands ?? ['trip_card_create', 'trip_card_update', 'trip_card_move', 'trip_task_set_status', 'trip_asset_attach'], selectedCardIds: [...input.selectedCardIds], context: { trip: { title: meta.title, cityId: meta.cityId, timeZone: meta.timeZone }, cards, assetRefs: assets.map(asset => ({ id: asset.id, catalogSnapshot: input.catalogSnapshot, sourceVersion: asset.source!.version! })), constraints: input.constraints ?? [] } };
    const context = { ...body, contextDigest: await digest(body) } as ContextRequest;
    contextSchema.parse(context); this.active({ context, revoked: false } as FileContextRecord); const bytes = this.encoded(context);
    await this.options.whenSaved(); await this.identity(); this.unchanged(capture);
    const record: FileContextRecord = { version: 0, boardId: this.session.boardId, contextRequestId: context.contextRequestId, documentIdentity: this.options.documentIdentity, actorId: this.actor.id, fingerprint: await sha256Hex(capture.fingerprintBytes), context, assets, revoked: false };
    this.unchanged(capture); await this.store.putContext(record, null); this.unchanged(capture); return { context: freeze(structuredClone(context)), bytes };
  }
  async importProposal(bytes: Uint8Array): Promise<FileReview> {
    this.check(); const raw = parseFileJson(bytes); proposalSchema.parse(raw);
    // JSON Schema defaults validate native shape but must never change the bytes-bound envelope.
    const envelope = raw as ProposalEnvelope, hash = await digest(envelope); await this.identity();
    const grant = await this.grant(envelope.contextRequestId); this.binding(envelope, grant); let record = await this.record(envelope.proposal.id);
    if (record && (record.contextRequestId !== envelope.contextRequestId || record.envelopeHash !== hash)) fail('IDEMPOTENCY_CONFLICT: the proposal ID is already reserved for a different context or envelope.');
    if (!record) {
      this.collision(envelope.proposal.id); this.active(grant, envelope); const capture = this.capture();
      if (capture.revision !== grant.context.baseBoardRevision || await sha256Hex(capture.fingerprintBytes) !== grant.fingerprint) fail('The issued context is stale; reissue it.');
      await this.references(envelope, grant); this.unchanged(capture); this.preflight(envelope, envelope.proposal.ops.map((_, i) => i), null);
      record = { version: 0, boardId: this.session.boardId, proposalId: envelope.proposal.id, contextRequestId: envelope.contextRequestId, envelopeHash: hash, envelope: structuredClone(envelope), state: 'review', selected: [], applied: [], revision: capture.revision, fingerprint: grant.fingerprint, nativeLedger: null, liveSessionId: this.liveSessionId };
      await this.store.putProposal(record, null); this.unchanged(capture);
    } else {
      if (record.state === 'applying' || record.state === 'undoing' || record.state === 'applied-in-memory' || record.applied.length && record.liveSessionId !== this.liveSessionId) fail('The journal requires inspection or reissue; uncertain or reloaded partial work cannot run again.');
      if (record.state === 'review' || record.state === 'persisted') await this.current(record, grant);
    }
    return this.review(record);
  }
  async apply(review: FileReview, selected: number[] | null = null, signal?: AbortSignal): Promise<FileReceipt> {
    const trusted = this.trusted(review); if (this.busy) fail('Another file action is pending.'); this.busy = true;
    try { return await this.store.withBoardLock(this.session.boardId, async () => {
      const record = await this.record(trusted.proposalId); if (!record || record.envelopeHash !== trusted.envelopeHash || !['review', 'persisted'].includes(record.state)) fail('This reservation cannot be applied; inspect or reissue.');
      if (record.applied.length && record.liveSessionId !== this.liveSessionId) fail('Partial continuation after reload requires reissue.');
      const grant = await this.grant(record.contextRequestId), capture = await this.current(record, grant, signal), wanted = selected ?? record.envelope.proposal.ops.map((_, i) => i);
      if (!wanted.length || !unique(wanted) || wanted.some(i => !Number.isInteger(i) || !record.envelope.proposal.ops[i])) fail('Choose valid unique operation indices.');
      const indices = wanted.filter(i => !record.applied.includes(i)).sort((a, b) => a - b); if (!indices.length) return this.receipt(record, 0, true);
      await this.references(record.envelope, grant); this.unchanged(capture, signal); this.preflight(record.envelope, indices, record.nativeLedger);
      const intent = await this.put(record, { state: 'applying', selected: indices, liveSessionId: this.liveSessionId });
      await this.identity(signal); this.active(await this.grant(record.contextRequestId), record.envelope); this.unchanged(capture, signal);
      if (!record.applied.length) this.collision(record.proposalId);
      // No await between the last fence and native Apply. Native executeAll preflights its full batch.
      const result = applyProposal(this.session, this.actor, this.native(record.envelope), indices), after = this.capture();
      const next: FileProposalRecord = { ...intent, state: 'applied-in-memory', applied: [...new Set([...record.applied, ...indices])].sort((a, b) => a - b), revision: after.revision, fingerprint: await sha256Hex(after.fingerprintBytes), nativeLedger: structuredClone(this.nativeLedger(record.proposalId)) };
      this.recoverable.set(record.proposalId, next);
      try { const journalled = await this.put(intent, next); this.recoverable.set(record.proposalId, journalled); return await this.save(journalled, result.appliedOps); }
      catch { return { ...this.receipt(next, result.appliedOps, false), state: 'recovery-required', message: 'Applied in this tab, but the journal could not confirm it. Keep a native backup; do not apply again.' }; }
    }); } finally { this.busy = false; }
  }
  private receipt(record: FileProposalRecord, appliedOps: number, persisted: boolean): FileReceipt { return { proposalId: record.proposalId, appliedOps, remainingOps: record.envelope.proposal.ops.length - record.applied.length, boardRev: record.revision, state: record.state, persisted }; }
  private async save(record: FileProposalRecord, appliedOps: number): Promise<FileReceipt> { try { await this.options.whenSaved(); const next = await this.put(record, { state: record.state === 'undone' ? 'undone' : 'persisted' }); this.recoverable.delete(record.proposalId); return this.receipt(next, appliedOps, true); } catch { return { ...this.receipt(record, appliedOps, false), message: 'Changes remain in this tab. Check persistence again or download a personal native backup; never apply again to save.' }; } }
  async retryPersistence(review: FileReview): Promise<FileReceipt> {
    const trusted = this.trusted(review); if (this.busy) fail('Another file action is pending.'); this.busy = true;
    try { const record = await this.record(trusted.proposalId), live = this.recoverable.get(trusted.proposalId); if (!record || !live || record.envelopeHash !== trusted.envelopeHash || record.state !== 'applied-in-memory' || live.liveSessionId !== this.liveSessionId) fail('No trusted live persistence receipt can be retried. Reissue or recover a native backup.'); await this.identity(); return await this.save(record, 0); } finally { this.busy = false; }
  }
  async reject(review: FileReview): Promise<void> { const trusted = this.trusted(review), record = await this.record(trusted.proposalId); if (!record || record.envelopeHash !== trusted.envelopeHash || record.state !== 'review') fail('Only an unapplied review can be rejected.'); await this.put(record, { state: 'rejected' }); }
  async revoke(contextRequestId: string): Promise<void> { this.check(); await this.store.withBoardLock(this.session.boardId, async () => { await this.identity(); const grant = await this.grant(contextRequestId); await this.store.putContext({ ...grant, revoked: true, version: grant.version + 1 }, grant.version); }); }
  async undo(review: FileReview): Promise<FileReceipt> {
    const trusted = this.trusted(review); if (this.busy) fail('Another file action is pending.'); this.busy = true;
    try { return await this.store.withBoardLock(this.session.boardId, async () => {
      const record = await this.record(trusted.proposalId);
      if (!record || record.envelopeHash !== trusted.envelopeHash || !record.applied.length || record.liveSessionId !== this.liveSessionId || !['persisted', 'applied-in-memory'].includes(record.state) || !equal(this.nativeLedger(record.proposalId), record.nativeLedger) || !this.session.canUndo(`proposal:${record.proposalId}`)) fail('Trusted proposal Undo is unavailable in this session.');
      await this.identity(); const intent = await this.put(record, { state: 'undoing' }); this.check();
      if (!equal(this.nativeLedger(record.proposalId), record.nativeLedger) || !undoProposal(this.session, record.proposalId)) fail('The trusted Undo receipt changed; inspect this journal.');
      const capture = this.capture(), next = await this.put(intent, { state: 'undone', revision: capture.revision, fingerprint: await sha256Hex(capture.fingerprintBytes) }); return await this.save(next, 0);
    }); } finally { this.busy = false; }
  }
  async inspect() { this.check(); return this.store.list(this.session.boardId); }
  cancel(): void { this.alive = false; }
}
