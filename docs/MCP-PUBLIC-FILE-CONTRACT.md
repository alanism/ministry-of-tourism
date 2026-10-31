# MoT public discovery and local proposal-file contract

Contract `mot.public-file/1` · MOT-138 · 1 November 2026, Asia/Bangkok

**Status: contract scope; runtime compatibility is not accepted.**
The target is Meta's Muse personal agent and Connector Platform, identified by
Alan at <https://platform.muse.ai/docs>. Muse operates in its own **cloud computer**;
the web/mobile interface is a way to communicate with that agent. A local Muse
Code installation is not required for the proposed connector.

No independent contract review had run at the original `9ebccc4` authoring
snapshot. Actual Astra round1 requested AS138-001–003; the corrections below
address those findings. The current independent disposition must come from a
review receipt pinned to this exact corrected commit, not from this statement.
Owner contract disposition, actual Muse-to-MoT calls and exact JSON-file delivery
remain pending. `NOT EXECUTED`
means no cloud-agent observation exists, not that Muse lacks the capability.
The schema and examples below are proposed contracts, not installed tools,
issued grants or an implemented file importer.

## 1. Target and verified evidence

Meta describes a dedicated cloud VM with a filesystem, terminal and browser,
artifact creation, and custom connectors built against APIs or CLIs. Network
and connector actions remain subject to **Sentinel**. These are documented
capabilities; this pass did not execute the user's cloud agent.
[Product design](https://introducing.muse.ai/),
[technical architecture](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse).

The platform accepts API/MCP tool documentation and reviews connector submissions
before directory discovery. Its guidelines require a useful completed outcome;
a read-only information result can qualify, while public-page/link wrapping
alone is insufficient. This does not establish an arbitrary-server configuration
UI, protocol version, acceptance of MoT, or a tested artifact MIME type.
[Connector guidelines](https://platform.muse.ai/docs),
[connector help](https://www.meta.com/help/superintelligence/1687253048996149/).

Machine-readable evidence: [capability matrix](mcp-muse-capability-matrix.json).
Prepared execution task: [synthetic cloud-agent probe](mcp-muse-cloud-probe.md).

| Question | Evidence and disposition |
| --- | --- |
| Where does Muse execute? | Official documentation: its cloud computer. Confirmed as the intended architecture, not a local browser process/CLI. |
| Can a provider submit MCP/API documentation? | Documented by the identified platform. No submission or MoT approval occurred. |
| Can it create files/artifacts? | General filesystem/code/artifact creation is documented. Exact `.mot.proposal.json` delivery, user-file input and mobile handling are NOT EXECUTED. |
| Does it reach this MoT endpoint? | NOT EXECUTED: no MoT MCP endpoint exists yet; MOT-140 owns that implementation. |
| Which MCP revision/resources does its connector use? | NOT OBSERVED; capture actual cloud-agent/server negotiation and tool discovery. |
| What exact Muse VM build/account/region is tested? | None. The public platform page does not expose these values. Do not substitute a CLI or model version. |
| Does connecting expose a local trip? | The proposed service has no local-trip path. Actual zero-exposure probe remains MOT-140/142 evidence, not a result of this document. |

The installed `muse --version` reports Muse Code `1.4.14 (1.4.14-R7309.1)`.
Only version/help were read. That separate coding product and prior Meta Model
API calls do not certify the consumer cloud agent. An unnecessary consumer
sign-in approach was stopped after Alan corrected the execution model; no
credentials, private trip data or cloud-provider task was submitted.

## 2. Route and completed user outcome

Select **Route A for the proposed first implementation**:

```text
FCC approved public snapshots -> shared catalogue boundary -> public MCP/HTTP
                                                              ^
                                               Muse in its own cloud VM
                                                              ^
                                      deliberately shared context/proposal files
                                                              v
MoT browser-local TripSession -> validate -> human review/Apply -> Undo/save
```

The public connector's finished outcome is a bounded, source-backed discovery
result: suitable FCC ideas and asset identities, publication/snapshot evidence,
eligibility and explicit gaps. Show how the structured cross-collection result
improves on browsing: stable identity, provenance, category separation and
operation eligibility that an ordinary list of links does not provide.
Measure that difference with the actual cloud agent. Platform acceptance remains
an external result, not a consequence of implementing this contract.

Optional local proposal exchange is advertised separately. Do not advertise
"Muse updated your trip" when it only produced a file, or invent booking,
purchase, live inventory, shared-room or trip-write tools to broaden the
connector's claim. A shop reference is a truthful handoff to the existing shop,
not a transaction performed by MoT. Declared discovery tasks finish in Muse;
human adoption of a proposal remains a deliberate MoT operation.

The public service needs no **MoT** account or hosted inference call. Muse's own
account, permissions and platform availability are separate. Local trips remain
in browser-origin/profile storage. Muse's cloud filesystem is neither that
IndexedDB database nor a synchronized copy of it. Only selected context shared
by the person reaches the Muse VM; the public discovery service never receives
that file by default.

## 3. Source reconciliation and reuse

Public `origin/main` was resolved locally and remotely to **0355bb6**
(`0355bb66ba3499a330c713d4cd36de6e8006c193`). The current local integrated candidate
is **7d3865e** (`7d3865ea4077599b0a9ce9c17d667a7d8aa34eba`), board save238 at intake.
This documentation branch starts from public origin/main, as the Git workflow
requires. It does not merge, reset or publish the local candidate.

| Current file/symbol | Reuse and missing boundary |
| --- | --- |
| `packages/core/src/trip/session.ts`: `TripSession.executeAll` | Reuse validated commands, trial execution and proposal Undo units. This is domain-batch atomicity, not an implemented document/blob/receipt durability journal. |
| `packages/core/src/trip/proposals.ts`: `PROPOSABLE_COMMANDS`, `prevalidateProposal`, `applyProposal`, `undoProposal` | Reuse the five allowed operations and human approval. The current applied ledger is keyed by proposal ID; it does not bind that ID to immutable payload bytes. MOT-141 must add the exchange identity check before this path, without replacing the engine. |
| `packages/core/src/trip/revisions.ts`: `ComparisonToken`, `tokenFor`, `tokenMatches` | Native token is `{boardId, cardRevs}`. Board/meta/assets/presentation changes need the separate strict base-snapshot precondition below; no invented `@meta` card in the native token. |
| `apps/web/src/trip/agentApi.ts`: `createTripApi`, `installTripApi` | In-page capabilities/read/execute/persist/artifact hooks are browser APIs. Never publish its direct execute/Undo surface as remote MCP tools. Current local artifact formats are HTML/ZIP; no new proposal-file importer is installed. |
| `apps/web/src/trip/trip-store.ts` | Reuse local trip/media/recovery boundaries. No server can infer a grant from a board ID or browser-local persistence. |
| `packages/core/src/trip/city-source.ts`, `apps/web/src/artwork/catalog.ts` | Reuse validated feeds, records, source/rendition identity, origin and eligibility. MOT-139 shares the catalogue contract with MOT-122/127; preserve MOT-121/137 audit gaps. Public multi-city discovery is a new consumer, not permission to relax the active-trip gateway guard. |
| `packages/bridge/src/bridge.ts`: `AGENT_TOOLS`, `createMcpServer` | Existing relay exposes inherited writer-board commands and forwards to an open browser; it is not the public FCC service or a scoped MoT permission service. Do not reuse its tool registry or pairing token as public permissions. Evaluate relay internals only in the later route decision. |
| `scripts/build-trip-guidance.ts`, generated `guides/trip-best-practices.md` | Extend one maintained guide/capability source as actual features land. Do not announce this draft as callable or create another instruction source. |

The 7d3865e candidate includes later private-media ancestry, geometry, voting and
HTML artifact changes absent from public 0355bb6. The exact file hashes are in
the MOT-138 evidence `source-manifest.json`; imported operation schemas were
exported from that candidate's current Zod inputs, with proposal-forbidden fields
removed. Native semantic and authorization validation is still required.

## 4. Protocol/runtime decision record

| Item | Pinned observation / proposed choice |
| --- | --- |
| Repository SDK and lock | `@modelcontextprotocol/sdk` **1.32.1**, package-lock entry and installed package agree. |
| Existing SDK revisions | Installed `LATEST_PROTOCOL_VERSION` = **2025-11-25**; default negotiated revision = **2025-03-26**. |
| Current specification inspected | `latest` resolves to **2026-07-28**, with transport/metadata/lifecycle differences. |
| Local inspection runtime | Node **v24.14.0**, npm **11.9.0**. This is not a Muse VM runtime observation. |
| First candidate implementation profile | Streamable HTTP with existing SDK / 2025-11-25 **only if an actual Muse cloud exchange proves compatibility**. No SDK upgrade or new deployed runtime is selected in MOT-138. |
| Actual cloud negotiation/client build | **NOT OBSERVED**; keep the compatibility gate pending. Capture the real request/response revision, capabilities, framing and cancellation behaviour in MOT-140/142. |

Do not combine examples from the 2026-07-28 specification with the installed
legacy SDK and call the combination tested. If Muse requires a newer profile,
propose a scoped SDK/lockfile implementation change with its own verification;
do not alter the existing harness to force compatibility. Neither the platform
guidelines nor a local SDK probe proves Muse uses a particular revision.
[Transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports),
[legacy transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

No public endpoint hostname is invented. Local loopback tests cannot prove
reachability from Muse's cloud VM. A public TLS endpoint and connector testing
environment require the separately authorized MOT-140 deployment work.
MOT-138 can establish the cloud agent's general transport/file capabilities
against an already authorized read-only reference service and synthetic files;
that is client-capability evidence, not a MoT integration pass. This avoids
requiring MOT-140 to exist before its own MOT-138 prerequisite can be met.

## 5. Versioned public tool/data contract

[Schema bundle](mcp-public-file.schema.json), ID `urn:mot:public-file:1`.
The default schema validates a context/proposal envelope; tool payloads use the
named `$defs` below. [Examples](mcp-public-file-fixtures.json) are labelled
synthetic data, not FCC inventory, valid locally issued requests or Muse output.

| Proposed tool | Input definition | Result / permissions |
| --- | --- | --- |
| `mot_get_capabilities` | `capabilityRequest`; optional `document` = capabilities, guide or proposal-contract | `publicInfoResponse` selects the named capabilities/document/unavailable result below; `failure` for domain failures. **Read**; no trip state. |
| `fcc_search_catalog` | `catalogSearch` | `catalogPage` of normalized `catalogItem` records and snapshot-bound cursor/coverage. **Read**. |
| `fcc_get_city` | `cityRequest` | A bounded published city record and coverage/source references, or explicit unavailable. **Read**. |
| `fcc_get_item` | `itemRequest` | Bounded normalized record/excerpt with explicit continuation and provenance. **Read**. |
| `fcc_get_asset` | `assetRequest` | Eligible public asset/rendition metadata, dimensions/crop/hash/credit and permitted reference; not bulk bytes or arbitrary fetch. **Read**. |

Logical resources `mot://guide/current`, `mot://contracts/proposal/1`,
`fcc://catalog/<snapshot>/cities` and `fcc://item/<id>` share the tool validators.
They are resolver IDs, never user-supplied network destinations. The schema
bundle is a bounded field-level contract; runtime response types for city/asset
specializations must be reconciled with the exact catalogue records in MOT-139.
Do not claim those specializations or resource support are implemented here.

`mot_get_capabilities` has the following versioned result mapping (AS138-002):

| Request selection | Complete result / unavailable result |
| --- | --- |
| Omitted `document`, or `capabilities` | `capabilitiesResponse`: explicit versions, catalogue snapshot (or null), observed protocol (or null), route statuses, per-tool availability and named input/output validators, and actual declared limits. Metadata being readable does not mean every route is available. |
| `guide` / `mot://guide/current` | `guideResponse`: guide ID/version, `text/markdown`, complete UTF-8 text and its SHA-256; or `documentUnavailableResponse` with document, reason and safe message. |
| `proposal-contract` / `mot://contracts/proposal/1` | `proposalContractResponse`: schema ID, `application/schema+json`, complete `schemaJson` text and its SHA-256; or `documentUnavailableResponse`. Parse the text as JSON data, never as executable instructions. |
| Invalid selection, unsupported version, oversized complete result, retrieval/limit failure | Existing `failure` result with the actual safe code. An oversized document is a limit failure, never a truncated success. |

All alternatives are discriminated by `document` and `status`, require
`contractVersion:1`, reject unknown fields and have bounded content. SHA-256
binds the unescaped UTF-8 bytes of `text` or `schemaJson`; it does not hash the
outer JSON encoding. Resources and tool fallback return the same document bytes
and validators. The complete encoded response must fit `limits.responseBytes`
(at most512 KiB), as well as the relevant guide/schema UTF-8 byte cap; string
length checks alone are insufficient. Guide text is capped at128 KiB, schema
text at512 KiB, with outer-envelope overhead accounted before success. A result
that cannot fit fails explicitly; no pagination is introduced for these small
maintained documents.

Tool names must be unique and correspond to actual installed tools. An
available tool must reference existing reviewed input/output definitions in
the advertised schema version; reject dangling validator references. Current
city/asset response specializations remain MOT-139 work and cannot be advertised
available until reconciled. The fixtures advertise every route/tool unavailable
and an unobserved protocol as null; their available document bodies are labelled
synthetic examples, not runtime observations. Private-trip access is fixed to
deferred and agent Apply to unavailable in this version.

Retain six item types: city, place, article, art, sticker and shirt. A normalized
item binds stable identity, source version, catalogue snapshot, origin,
freshness, rights evidence and operation eligibility. Discover, preview, insert,
share, embed and shop permissions are separate. Preserve existing credited-art
policy, frozen coverage denominator and unresolved source/apparel mappings.
Unknown availability, coordinates or rights stay unknown. No silent truncation,
foreign-city relabelling, invented checkout or sample-as-full-coverage claim.

Public tools reject private trip/context fields and arbitrary URL/callback/path
inputs. IDs resolve through audited publisher records. Bound network/redirect,
DNS destination, response/decompression, SVG/media and egress behaviour before
any retrieval. Tool annotations and catalogue text confer no authority; model
output, articles and captions are untrusted data. No public tool accepts or
stores a context/proposal file, lists trips, executes commands or applies work.

## 6. Selected context and returned proposal

The first file contract uses a **shared-selected** projection: explicitly
selected guide/stay cards and permitted public asset references. Private cards,
credentials/access codes, raw document/history, media binaries and unrelated
household records are excluded. Do not infer permission from a source hash,
model author, uploaded file or repeated JSON scope. Any later private-context
extension needs its own reviewed policy; this version grants none.

1. **Issue locally.** MoT records random `contextRequestId`, board ID, strict base
   board revision, native token, selected IDs/projection, allowed commands,
   catalogue/guide/capability versions, creation/maximum expiry and revocation
   state. This local record is authoritative. A file alone cannot issue a grant.
2. **Digest the exact request.** `contextDigest` is SHA-256 of RFC 8785 canonical
   UTF-8 JSON for the whole context request with only `contextDigest` omitted.
   Reject duplicate object keys, non-finite numbers, invalid Unicode and unsafe
   integers before hashing. No implicit Unicode normalization. An implementation
   must use a conforming canonicalizer; the tiny fixture check is not one.
   [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
3. **Deliberate handoff.** The person supplies selected context to Muse's cloud
   filesystem through an actually supported route. Muse prepares the proposal
   artifact there. This is a transfer to Muse, distinct from querying public FCC
   tools. The exact upload/paste/download interaction and MIME acceptance remain
   unverified; no local-client installation is required by this architecture.
4. **Return a file.** Proposed filename suffix `.mot.proposal.json`, MIME
   `application/json`, UTF-8, no executable/binary payload. It repeats the request
   ID, board/base/digest/expiry and carries native `Proposal` operations, sources,
   reason and an untrusted author label. Imported status must be `proposed`.
5. **Validate before review or writes.** Check bytes/depth/string/array limits,
   duplicate keys, strict schema, all references and exact local issuance record.
   Outer/inner/token board IDs must agree; repeated token and allowed commands
   must match local state. Existing-card operations require their native card
   preconditions and visible permitted cards/media. Validate current native
   semantic rules after the JSON schema; schemas alone do not provide authority.
6. **Use conservative staleness.** Base revision and context/projection digest
   must still match; expiry is capped by the local issuance record. Unknown,
   revoked, rejected or stale requests offer inspection/reissue, never mutation.
   A copied native package on another profile must deliberately recover/reissue
   context; imported grants and coincident revision numbers do not authorize it.

The five native operations remain `trip_card_create`, `trip_card_update`,
`trip_card_move`, `trip_task_set_status`, `trip_asset_attach`. Reject `scope`,
`booking`, `currentFacts`, and existing-card source/sourceText replacement.
Asset attachment is metadata referencing authorized existing/bounded package
media, not permission for a fetch-any-URL or private media reference. No new
votes, proxy household approvals or permission changes are introduced.

## 7. Human Apply, idempotency and durability

Reserve **`(boardId, proposal.id)` board-wide**, matching the existing native
ledger and `proposal:<id>` Undo namespace (AS138-001). Bind that ID immutably to
the locally issued `contextRequestId` and SHA-256 of the **entire proposalArtifact
envelope**, canonicalized with the same RFC8785 rules as the context digest.
Reserve and durably journal it before any native Apply; an uncertain reservation
must not reach Apply. A different context or different canonical envelope under
that ID fails `IDEMPOTENCY_CONFLICT` before native Apply or Undo, including across
partial/full approval, rejection, cancellation, expiry and Undo. Retain the
reservation through those states; expiry/rejection/Undo cannot free an ID for
another context. The same context and canonical envelope can retry harmlessly;
whitespace or key-order changes preserving canonical bytes are equivalent.

Reconcile existing native proposal/applied/Undo identities before reserving.
If an ID already exists in the full/partial native ledger, a known pending
proposal or active Undo/proposal identity and lacks a matching trusted local
reservation, refuse and reissue with a fresh ID; do not infer Already applied
or adopt legacy work. Missing/corrupt local identity evidence fails closed.
Any proposal-specific Undo request must resolve the same local identity receipt,
not merely an untrusted external ID. Selected operation indices and native
receipts belong to that reserved identity; a second context cannot inherit them.
A separate ID-mapping engine is unnecessary. This is an importer/journal
obligation for MOT-141, not a change to the native engine in this contract task.

The MoT human UI reviews the exact payload/selection and invokes existing
`applyProposal`; there is no remote Apply, raw execute or Undo-as-user endpoint.
The same command/native validator must preflight the whole chosen batch before
any change. A failed final operation must leave earlier selected operations
unapplied. Approval is bound to payload hash and current preconditions; imported
`human`, `approved`, actor or owner fields cannot impersonate it.

The strict base precondition applies at the first mutation. Subsequent selected
parts may advance only through locally journalled native receipts produced by
that same immutable proposal. After unrelated intervening edits, or if that
continuation receipt cannot be recovered, reissue context. Do not disable native
per-card checks or silently rebase to support partial selection.

The local exchange store must journal identity, selected/applied indices,
revision receipts and rejected/expired state consistently with document/blob
save. If a crash leaves journal/document agreement uncertain, lock further
Apply and offer recovery/reissue rather than rerun. MOT-141 must specify/prove
this boundary; current `executeAll` is not a persistence transaction. Saving
again must not execute again. Distinguish imported-for-review, partly-applied,
applied-in-memory and persisted; never call in-memory-only state Saved.

Use proposal-specific Undo and preserve unrelated later edits. Undo limitations
across reload/same-object interleaving need actual evidence, not a promise of
persistent cross-device Undo. Nothing here changes voting, bookings, original
FCC source records, private scope or the native JSON/ZIP format.

## 8. Limits, errors and operational boundaries

Initial proposed caps, pending review and measurement: public query 512
characters; page default20/max50; search metadata256 KiB; item/result512 KiB;
article excerpt16 KiB UTF-8 with continuation; context/proposal512 KiB each;
maximum50 proposal operations,100 selected cards/asset references and JSON
depth16. Existing stricter native limits win. Reject oversized UTF-8 bytes before
parsing and at every retrieval boundary; character count is not a byte budget.
No media bytes/base64 in these envelopes. Expiry defaults to at most24 hours
locally, with clock uncertainty reported rather than fabricated server consent.

Catalogue deadline10s and any rate/latency/cost/SLO values from the PRD are review
targets, not tested capacity, provider quotas or a budget authorization. Tool
results use stable versioned safe errors (`failure` definition); preserve actual
MCP/auth errors separately. No stack traces, raw user query, trip/context body,
credentials, tokens or private bearer URLs in logs/errors. Runtime/transport,
source snapshot and sanitized correlation IDs belong on diagnostic receipts.

Submission/business verification, developer terms, support/privacy information,
test accounts, endpoint publication, spending and credentials are separate
owner actions. A platform submission has not been made. Do not invent a test
account or accept terms as a side effect of a compatibility probe.

## 9. Evidence gates and concrete next tests

The proposal/schema checks in this task prove shape and example consistency
only. Fresh unchanged `npm run check` at 7d3865e passed **1,246 tests/188 files and
four TypeScript projects in43.17s**. It is baseline regression evidence, not a
connector, importer, cloud-agent or physical-device result.

| Probe / owner | Required observed result |
| --- | --- |
| M138-C0; MOT-138 | Actual Muse cloud-agent call to an authorized read-only reference MCP service, with server identity and sanitized negotiated transport/revision evidence. This proves only that tested client/service combination. No MoT endpoint or new deployment is required for this baseline probe. |
| M138-C1/C2; MOT-140 then MOT-142 | Muse's cloud agent reaches the actual authorized public endpoint, discovers/calls tools, and supplies a real protocol/capability/resource-fallback transcript. Record VM/client surface/build if observable and limitations if not. |
| M138-F1/F2; MOT-141/142 | Send only the labelled synthetic context to the Muse VM; receive an actual downloadable JSON proposal. Compare bytes/schema/request digest, record allowed/denied network/file actions and manual recovery. No API/CLI surrogate result. |
| M138-F3; MOT-141/142 | Actual local import/diff/select/Apply/Undo/save/reopen and supported mobile file handling. Unknown context on another profile refuses Apply. |
| MCP01–07,17,20; public service | Zero local-trip exposure, frozen coverage/snapshot/rights, pagination, injection/egress defences, real Muse discovery, sanitized diagnostics and measured cancellation/limits/load. |
| MCP08–14,18 and local portions of19; files | Wrong board/future schema, stale context/token/expiry, replay/changed-body, invalid final op, human-boundary bypass, unrelated-edit Undo, save/quota/crash/retry, offline recovery and no agent household vote. |
| Independent review / owner disposition | Review this actual contract and exact source/schema/fixture hashes before dependent feature blockers are resolved. This author is not that reviewer. |

Applicable public/file evidence joins at **MOT-142**, feeds the existing
MOT-128/129 integration, and retains MOT-101 as the sole release gate. Completed
work, shared-room launch scope, human/device/security/production holds and PDF
closure stay unchanged. The source-authority, native privacy and harness rules
are not weakened by this document.

Private-trip remote reads, grant storage, OAuth identity, private media,
pending server proposals and bridge/cloud selection remain **MOT-143–145**,
deferred. Reuse MOT-130/125/126 if that later route is selected. No local Y.Doc
upload/migration, new approval engine or private-trip endpoint is included.
