# MOT-120 actual independent Astra contract review record

2026-11-01, Asia/Bangkok. Actual gpt-6-astra under explicit owner delegation. These are bounded definition reviews, not implementation or production acceptance. Full task remains Doing; physical Safari remains pending.


---

Evidence file: `CLIPBOARD-CONTRACT-REVIEW.md`; SHA-256 `5cc4eb8067309f12398da94cbbf0ab7f5101a6079e82aee9c27e750f2483ff30`. Verbatim report follows.

# Astra independent cross-board clipboard contract review

**Disposition: REQUEST CHANGES.** Three concrete definition corrections are needed before dependent feature implementation. They can be resolved within the owner's bounded G4/G5 authorization; none requires inventing broader task, agent, room or release approval. This is a contract review, not implementation acceptance and not an extension of R24.

Reviewer: **gpt-6-astra**. Date: **2026-11-01**, Asia/Bangkok.
Source baseline: `7344563bf6772d5b20c280c941a1d8f16f252dc9`, clean.
Reviewed proposal: `implementation-contract.txt`, SHA-256 `c05727cb24b279034dea1a1f8530791cb7722d9be43a32db4f3854958a0aa814`.
Normative sources: `docs/MOT131-BOARD-GEOMETRY-PROPOSAL.md` §§5, 15/G4–G5 and `docs/MOT131-CONTRACT-DISPOSITION.md`.

## Definition blockers

### C1 — P1: Specify an evidence representation that cannot become confirmed facts

Proposal items 1 and 4 preserve observations and state that imported evidence is not authority, but do not specify how that survives storage and subsequent readers. `packages/core/src/trip/schema.ts:48` defines `currentFactSchema` with no untrusted/imported discriminator. `packages/core/src/trip/agent-context.ts:26` converts every stored `currentFacts` entry into a fact with `status: 'confirmed'`. Its routing callers can include private cards when explicitly requested. A private scope and a paste-preview label do not prevent an untrusted clipboard claim from later becoming confirmed planning evidence.

**Required correction:** expressly prohibit copying imported observations into `currentFacts` or another confirmed-fact/booking channel. Preserve their complete values, dates and evidence URLs as clearly labelled, non-authoritative source text under the existing limits; reject without truncating when they do not fit. Preserve the original source text too. Do not silently discard the observations. A broader new evidence type and consumer migration would be a different scope; the existing bounded source-text path avoids that choice. Require an additive test that forged clipboard observations survive as readable data and contribute zero confirmed `currentFacts`, including after reload and private ZIP round-trip. `createdBy` must come from the current actor, not the envelope; source attribution remains a claim, not identity proof.

### C2 — P1: Make original-media disclosure explicit before writing the OS clipboard

The proposed action says Copy to another trip, while the text envelope contains complete originals and the `derivedFrom` ancestor closure. These can contain cropped-out pixels, source sheets and embedded metadata that were not visible in the selected board picture. “Selected notes/photos” plus “target will be private” does not sufficiently distinguish the private target from the system clipboard, which other applications can read. A notice after the bytes have been written is too late.

**Required correction:** define visible disclosure before the explicit OS-copy action: selected notes and full original/source images, including cropped-out content and embedded metadata, will be put on the system clipboard and can be read by other apps. A concise disclosure in the copy panel followed by an explicitly labelled Copy to system clipboard action is sufficient; this review does not require an extra permission loop after that informed action. Keep a clearly identified local in-app copy alternative/fallback. Ordinary same-board Copy/Ctrl+C must retain its existing title/nonce behavior. A failed system write must not report system-copy success. Require a UI assertion that no native clipboard write occurs before the informed action and that cancellation writes nothing.

### C3 — P2: Native ZIP does not currently preserve the promised ancestor closure

The proposal promises full copied ancestry and reload/native-ZIP retention while relying on existing staged/export paths. Current `apps/web/src/trip/trip-assets.ts:118` and `apps/web/src/trip/artifacts.ts:21` select direct card/presentation assets only. `packages/core/src/trip/package.ts:72` independently selects direct assets, then writes only those records/bytes into its filtered document. For a selected derivative D whose `derivedFrom` is original O, D can be pasted correctly but a subsequent ZIP can omit O and leave a dangling ancestry reference after import. This is an API mismatch, not a demonstrated new implementation bug.

**Required correction:** explicitly include the minimal selected-closure collection/export work needed to retain every copied ancestor's metadata and verified bytes through the actual personal ZIP route, with cycle/missing-reference refusal and unchanged per-file/package caps. Do not include unrelated private records, widen shared export or start PDF work. Test a derivative→original chain via the real export/import route and compare references and bytes after remapping. Honest refusal remains necessary for over-budget or missing media; a 50 MiB media gesture does not guarantee an entire populated trip plus ZIP metadata fits the 50 MiB package bound. Do not advertise a guaranteed ZIP backup where that limit prevents one.

## Binding implementation constraints once corrected

The following specify how the existing APIs must satisfy the proposed contract. They do not add new product features or change harness constraints.

1. **One preflighted synchronous graph command.** `TripSession.execute` runs the command inside a Yjs transaction; Yjs does not undo earlier writes if a later write throws. `executeAll` preflights with independently generated random IDs, so it cannot prove the live injected `ctx.newId` sequence is collision-free. Generate and validate every ID first, reserve it against all target card/asset/presentation IDs, all earlier generated IDs and source IDs, then build and schema-check every remapped record and reference before the first write. Reject invalid/duplicate generated IDs; do not overwrite or retry into a partial graph. Validate target board identity and expected revision in the command. Keep both `humanOnly` and an explicit human check in the command implementation, as in the duplicate command. A nested graph must not depend on generic top-level agent checks.
2. **Strict graph and copy projection.** No foreign source-board reads from serialized claims. Keep `parseSameBoardClipboard` rejection and same-session nonce/reference rules intact. The new marker identifies only untrusted import data. Admit only selected card roots and asset-only board presentations; no card-linked or magazine placements. Reject unrelated graph records, duplicate IDs, missing bytes/references, cycles and unsupported metadata. Force copied card/presentation scope private; exclude booking, bookingAttention, lineage, actor/group/room/workspace/vote authority and board metadata. Validate equivalent card restrictions, including status only on task cards, and retain zero board rotation. Locked board-image copying must respect the existing duplicate refusal rather than silently bypass it. Embedded identity-bearing metadata such as `asset.apparel.assetId` must either be correctly remapped and validated without magazine-selection authority or rejected visibly as unsupported; copying it unchanged under a new asset ID violates `assetSchema`.
3. **Bytes and rollback are separate from document validation.** Hash/header/native decode validation belongs in the cancellable media preparation before the synchronous command. Call the one graph command synchronously inside `commitTripBlobs`' apply callback. That helper stages RAM and restores the previous RAM values if apply throws; it does not roll back document writes. Thus command preflight is mandatory. Recheck signal/context/revision immediately inside apply, with no await before commit. Mark committed exactly once and catch progress/notification callback errors so a successful document commit is not misreported as precommit failure or stripped of staged bytes. After commit, finish persistence or keep truthful tab-only recovery; do not roll back committed objects because the UI closes.
4. **Complete caps before native decode.** `board-images.ts:170` currently checks pixels per image, not the gesture total. Add bounded aggregate header preflight before any image decode, without changing the approved 16,777,216 total-pixel cap or R23 shared-slot lifetime. Count the complete accepted ancestor closure and all original payload bytes. Do not let hash deduplication evade the five-record closure bound. Define envelope/metadata limits by encoded bytes, check the recognizable envelope's outer size before JSON/base64 expansion, and reject unsupported version/fields visibly rather than falling back to a giant note. There is no increase to existing package caps: 72 MiB is only the proposed base64 text transport ceiling.
5. **Frozen source and stale target are different.** Freeze selected permitted metadata before asynchronous byte reads and never follow a later live source pointer. Pending copy/paste preparation must cancel on departure/context change, even after return. A successfully completed frozen in-app copy must survive normal trip navigation so permission-denied copy from A can actually paste into B; keep only one bounded copy and make replacement/clearing explicit. Paste's target/session/actor/view/revision and operation token must remain pinned through its async work. A stale target rejects without silently rebasing the accepted preview. Source changes after a completed snapshot do not silently update that snapshot.
6. **Recoverable and reviewable UI.** Before Add private copy, show root label, actual root/image counts including ancestors and private-copy status; do not automatically fetch source URLs. Preserve geometry relative to the requested origin, crop/aspect and permissible stack semantics without clamping or rearranging unrelated objects. The empty-target Paste action must reach the same envelope preview as a clipboard event, and editable inputs retain native shortcuts. No first write until final acceptance. Tests need empty/populated target, permission denial, explicit cancellation, leave/return, stale revision, repeated callback, deliberate retry, source unchanged, one Undo/Redo, quota recovery, reload and native ZIP closure. Fresh desktop/narrow raster evidence is required for implementation acceptance.

## Scope and evidence limits

I read the complete proposed contract and normative sections, then inspected the current schemas, command registration/session behavior, same-board duplicate/clipboard code, FreeBoard copy/paste/context handlers, blob staging, board-image limits, revision bookkeeping, agent evidence projection, native package export/import and actual artifact collection. No source, existing tests, configuration, constraints, harness or git state was changed. No feature code exists for this review to validate. No tests/build/browser execution were run because this task is a read-only definition review; their future acceptance requirements remain intact.

Correcting C1–C3 within the stated narrow options needs no new owner privacy/authority decision: it makes the already proposed untrusted-data, explicit-copy and full-original-retention promises concrete. A desire to preserve imported observations as confirmed facts, silently copy full originals to the system clipboard, widen sharing/agent authority, omit required ancestry, or raise package/harness limits would require a separate owner decision and is not approved here.

Physical Safari, broader MOT-120/MOT-130 definition and privacy/authority work, device performance, production/deployment and PDF holds remain pending. The owner's authorization covers this bounded review and subsequent local implementation only after this definition review is resolved.


---

Evidence file: `CLIPBOARD-CONTRACT-REVIEW-V2.md`; SHA-256 `e99c03b25a72f600ca5fd7363979b0331ded7f3be3ef0a725b7e19bd53b0b95a`. Verbatim report follows.

# Astra independent cross-board clipboard contract re-review

**Disposition: APPROVE BOUNDED CONTRACT.** Revision 2 resolves C1, C2 and C3 from the initial definition review. The owner-authorized local implementation may proceed within this exact corrected contract. This is not implementation acceptance, full MOT-120 completion, physical Safari approval or release approval.

Reviewer: **gpt-6-astra**, independent definition reviewer. Date: **2026-11-01**, Asia/Bangkok.

- Source baseline: `7344563bf6772d5b20c280c941a1d8f16f252dc9`.
- Reviewed input: complete `implementation-contract.txt`, revision 2.
- Exact SHA-256: `42db8992198c2417585465f8f329acbe14dc6858cb814cd0430d5a263dcd52c1`.
- Repository remained clean; no dependent implementation was present at review.
- Normative authority remains approved MOT131 §§5, 15/G4–G5 and `docs/MOT131-CONTRACT-DISPOSITION.md`, with the owner's newly authorized bounded review then local implementation.

## Resolution of the initial blockers

**C1 — Resolved.** Item 1 now explicitly excludes `currentFacts` and all confirmed-fact/booking channels. It preserves complete observation values, dates and evidence URLs as labelled unverified JSON within `sourceText`, alongside the original source text. Existing field and encoded metadata limits cause whole-operation refusal without truncation. The command supplies the current human's attribution and private/traveler defaults; incoming authority fields are rejected. The required reload/private-ZIP test must establish that imported observations never become confirmed facts. This directly addresses `agent-context.ts:26`, which would otherwise elevate every `currentFacts` entry to confirmed. No new evidence schema or broader authority decision is needed.

**C2 — Resolved.** Item 2 requires the disclosure panel before any system clipboard write. It names full original/source images, cropped-out content, embedded metadata and other applications' access. Only the explicit Copy to system clipboard action invokes the native write. Keep in this app is separate, bounded and usable across ordinary navigation. Cancel writes nothing; denial reports local fallback honestly. Same-board Copy/Ctrl+C and serialized-reference refusal stay intact. This supplies informed consent for this transport without treating private target scope as system-clipboard privacy.

**C3 — Resolved.** Item 8 explicitly includes minimal ancestor closure handling in the actual personal ZIP collection and core package-filtering paths, with metadata and verified bytes retained through export/import. It requires missing/cyclic ancestry refusal, excludes unrelated records, does not widen shared export, and preserves all package limits. It also withdraws any guarantee that a full populated trip or ceiling-size gesture will fit a ZIP. The required real native round-trip is stronger than a clipboard-helper-only test and addresses the existing direct-reference-only collection APIs.

## API and scope assessment

The revised contract incorporates the prior binding constraints: a separately versioned untrusted graph envelope; no foreign-board access by serialized identity; strict complete-graph closure and field checks; explicit rejection of locked/magazine/card-linked presentations and apparel metadata; force-private records; fresh IDs and all references remapped; source/target/intra-batch collision reservation; target identity/revision checks; an independently human-only graph command; and all candidate validation before any Yjs write.

Items 5 and 7 correctly avoid treating `executeAll`'s trial IDs or `commitTripBlobs`' RAM restoration as document rollback. The synchronous graph command must remain fully preflighted. The immediate apply-boundary cancellation/context check, caught postcommit observers, and honest postcommit tab-only state are appropriate for the existing separate document/blob stores. An implementation that can throw an ordinary validation error after its first graph write would not satisfy this contract.

Item 6 expressly covers the current per-image-only pixel check with aggregate header preflight before any native decode, preserves the R23 lifetime gate and all existing caps, and bounds text before JSON/base64 expansion. The five-asset bound includes ancestors and cannot be bypassed by hash deduplication. The 72 MiB text transport ceiling does not change the native package's 50 MiB limit.

The source snapshot is frozen before asynchronous media access. Pending operations cancel on context departure; a completed local clipboard snapshot survives normal trip navigation. The target session/actor/view/revision/origin/token is pinned from preview through commit, with no stale rebase or duplicate completion. This resolves the tension between useful cross-board fallback and cancellation of an unfinished operation.

The contract retains a reachable empty-target paste flow, an explicit Add private copy preview, ordinary editable shortcuts, complete refusal instead of partial insertion, source preservation and no automatic sharing or scheduling reinterpretation. Apparel is rejected visibly rather than silently attempting an incomplete embedded-ID/authority migration. No new owner choice is required to implement these agreed constraints.

## Evidence and remaining gates

I read the complete corrected text and checked it against each initial blocker, the prior source/API inspection, the preserved binding constraints and the unchanged canonical revision. The packet transparently records the intervening evidence-file write failure/restoration; this approval applies only to the complete revision 2 hash above. The initial REQUEST CHANGES report remains historical evidence and is superseded only for its three corrected definition blockers.

No source, test, configuration, harness, cap or git-state change was made by this reviewer. No test/build/browser execution was run for this documentation-only re-review. The specified additive RED/GREEN cases, unchanged full check/build, native clipboard/fallback flows, real ancestor ZIP round-trip and desktop/narrow raster evidence remain implementation obligations. Approval of a definition does not establish that any of those behaviors work yet.

Physical Safari, broader MOT-120/MOT-130 task and privacy/authority work, device performance, production/deployment and PDF holds remain pending. Keep MOT-120 Doing. No agent, room, membership or remote authority is granted; no push or deployment is authorized by this review.


---

Evidence file: `CLIPBOARD-CONTRACT-ANCESTRY-CLARIFICATION.md`; SHA-256 `c321c791892e607ce46721ab653f32026324581a5d37b069b7eed585d9df12fd`. Verbatim report follows.

# Astra contract clarification — private copied media ancestry

**Disposition: APPROVE BOUNDED CLARIFICATION. This protection is required by the approved contract.** Extending the existing agent-media reference guard to the ancestors of private roots is within the owner's authorized local clipboard implementation. It adds no new actor authority, remote membership policy or general privacy redesign. No additional owner choice is needed to preserve the already approved force-private/full-original promise.

Reviewer: **gpt-6-astra**. Date: **2026-11-01**, Asia/Bangkok. Read-only assessment of the in-progress clipboard worktree based on `7344563bf6772d5b20c280c941a1d8f16f252dc9`. The worktree now contains feature changes; this report is not a pinned implementation approval.

## Why it is required

The approved clipboard graph contains the selected original media and its complete `derivedFrom` ancestry. Assets have no independent `scope` field; their visibility restrictions derive from card/presentation ownership. A private pasted derivative D can therefore reference a remapped original O without O appearing in a card's direct `assetIds` or a presentation's direct `assetId`.

At the inspected `packages/core/src/trip/commands.ts:38–41`, `assertAgentMediaAccess` protects only those direct private references. An agent requesting O can miss that check even though O is part of the explicitly private copied graph. The paste command's human-only check and fresh IDs do not solve later access to that graph. IDs are not access-control secrets.

The existing comment correctly treats media referencing as a read/sharing operation. Its implementation must apply that same rule to the source ancestry now deliberately retained by paste. This is an integration obligation of the clipboard slice, rather than permission to redesign the wider MOT-130 authority system.

## Bounded rule to implement

1. Collect directly owned media roots from private cards and presentations whose effective `presentationScope` is private. Resolve those roots with the existing new `selectedAssetClosure` helper. Every returned asset ID, including each `derivedFrom` ancestor, is protected by the same existing agent-media rule.
2. Reject an agent operation before writes if its requested media references intersect that protected set. Keep the existing `scope` rejection semantics for forbidden references. Missing/cyclic ancestry must not silently truncate protection; fail closed with an actionable error when the relevant access cannot be validated.
3. Check the actual references a candidate introduces, not only its new ID. The inspected `trip_asset_attach` and `trip_asset_register` callers supply only `input.asset.id`; a fresh candidate E with `derivedFrom: O` would otherwise bypass a protected-ID intersection. Include candidate `derivedFrom` references in these existing checks. Apply the same rule to `trip_asset_attach` proposal prevalidation in `packages/core/src/trip/proposals.ts:42`, because approved proposals later execute as a human. Direct agent and agent-proposal paths must not disagree about the same media read.
4. Preserve valid agent operations with no requested media and ordinary authorized public media. Do not make unrelated text creation fail simply because an older document has an incomplete media graph. Keep human access under the current rules. Do not add hash-wide privacy taint, remote reads, new membership permissions, shared export expansion, or arbitrary ownership inference. The rule concerns explicit graph IDs/references and their private source closure.

The source graph helper inspected in `packages/core/src/trip/asset-closure.ts` is iterative and rejects cycles/missing ancestors. It provides a suitable traversal primitive; using it does not by itself prove every caller passes all relevant references. The paste implementation inspected in `board-clipboard.ts` already remaps `derivedFrom` and forces card/presentation scope private, so the missing protection belongs at these existing reference checks rather than by dropping the originals or weakening closure retention.

## Required additive evidence

Create a real pasted private derivative→original graph and obtain the newly remapped IDs from the destination. Show that an agent cannot attach/reference the ancestor on a visible card, create a card referencing it, or introduce a fresh derivative whose `derivedFrom` points to it. Exercise both a private-card root and a private board-image root, and the applicable proposal path. Assert no target writes/history changes on refusal. Include a multi-hop/shared-ancestor case so traversal is not merely a direct-parent special case.

Also retain positive controls for an agent using unrelated public media and creating a text-only card, and for the human's permitted private-copy/Undo/Redo/native-ZIP flow. A malformed ancestry case must not grant access. Add new tests; do not alter existing tests, harness rules, limits or timeouts to satisfy the correction.

## Limits

I inspected the concrete guard, its command/proposal callers, the new closure helper and the clipboard graph/transfer paths sufficient to assess this clarification. I did not perform an exhaustive implementation review, run tests/build/browser checks, or edit source/harness. The requested regression and subsequent full implementation verification remain outstanding evidence, not results claimed here.

This clarification supplements the approved revision 2 contract without reversing its approval. Physical Safari, broader MOT-120/MOT-130 acceptance, device performance, release/deployment and PDF holds remain pending. No push or deployment is authorized by this review.
