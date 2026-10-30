# Muse runtime (MOT-95)

The server implements the documented Meta Chat Completions protocol. It is disabled until the owner configures the key, model, and privacy acknowledgement. Unit tests use transport fixtures; a fixture response is not a live-service result. The first live round trip is recorded under "Live evidence" below.

## Source contract checked 28 October 2026, rechecked 31 October 2026

- [Meta Chat Completions documentation](https://dev.meta.ai/docs/protocols/chat-completions): fixed `POST https://api.meta.ai/v1/chat/completions`, bearer authentication, structured messages, `max_completion_tokens`, and `choices[0].message.content` for output.
- [Meta model documentation](https://dev.meta.ai/docs/models): the supported Standard-mode IDs are `muse-spark-1.3` and `muse-wonder-1.0`. Contributor model IDs are intentionally excluded from this private-board runtime. Rechecked 31 October 2026: the models page lists `muse-wonder-1.0` (Standard only on the Model API) and `muse-spark-1.3` as Standard with Responses, Chat Completions and Messages endpoints; `muse-spark-1.3-contributor` is Contributor mode, where content may be used to train Meta models, so it stays excluded even though the endpoint accepts it.

The model documentation says Standard-mode content is not used for model training. That is not a guarantee of zero provider retention. Provider storage, abuse monitoring, contractual retention, and account settings must be checked by the owner before enabling production requests. This implementation makes no zero-retention claim.

## Run locally

Use a supported Node version with TypeScript type stripping. From the repository, start `npm run start --workspace @mot/server`. The process binds **127.0.0.1:8788**, never a public interface. Set these values in the owner's server environment; do not put credentials in chat, source control, the browser, or a `VITE_` variable:

| Setting | Meaning |
|---|---|
| `META_API_KEY` | Server-held provider credential |
| `META_MODEL_ID` | One supported Standard-mode model ID; there is no implicit live-model default |
| `META_PRIVACY_ACKNOWLEDGED=true` | Owner has reviewed the data-use notice and provider terms |
| `MOT_ORIGIN` | Exact MoT browser origin; defaults to `http://127.0.0.1:5173` |
| `MOT_SERVER_PORT` | Optional loopback port; defaults to 8788 |
| `MOT_LOG_DIR` | Optional dedicated owner-only diagnostics directory outside the web root; defaults to the OS user state directory under `MinistryOfTourism/muse-diagnostics` |

Without all three Meta settings, status and proposal requests report unavailable. Existing manual board, artwork, saving, and export workflows require no key.

The local Vite app can proxy `/api/muse` to this loopback server. A proposal POST must carry `Content-Type: application/json`, the exact configured browser `Origin`, and `X-MoT-Request: 1`. No cross-origin CORS grant is emitted. This protects the local browser boundary from arbitrary sites; it is not a production user-authentication service. The local trust boundary assumes the owner's OS account and processes are trusted.

## HTTP contract

- `GET /api/muse/status`: availability, reason when unavailable, model ID when configured, and limits. No credential is exposed.
- `POST /api/muse/propose`: strict `{boardId,prompt,cards,assetIds,grounding?}`. Returns unavailable, a typed error, or `{status:'ok',proposal,receipt}`. The receipt records request ID, model ID, date, latency, and token usage when supplied by the provider.
- The browser must run the returned proposal through its actual `parseMuseOutput`/command/revision validator before it can be applied. Server envelope validation is not board authorization.

Typed adapter errors distinguish invalid input/output, rate limit, provider authentication failure (401/403), provider unavailability, timeout, cancellation, and an already-running request. The adapter returns no provider error body, stack trace, or echoed prompt.

## Data leaving the device

Only a deliberate proposal request sends data. The client constructs the payload from selected non-private cards: ID, title, body, stage, day/time; selected associated asset IDs; the board ID; the person's prompt; and selected-city FCC article titles, bodies, and provenance. Image bytes, unselected/private cards, host access codes, and other guests' data are not part of this request schema. Explicitly selected card text and the person's prompt can still contain personal information; selection is not anonymization.

The server forwards that bounded JSON as user-role data, separately from its fixed developer instructions. The provider request body has exactly `model`, `messages` (one `developer`, one `user`), `max_completion_tokens` and `stream:false`, all documented Chat Completions fields. The developer instruction names each proposable command's input fields with an example op that the app's own command schema accepts; without them the first live answer used invented fields and was refused by the browser validator. Provider output has no network tools or independent access to the board. The browser's existing command permissions decide what may change.

## Limits and recovery

- At most one active provider call per adapter, no automatic retries, and a 30-second timeout. Browser cancellation aborts the provider request.
- Prompt: 8,000 characters; 40 selected cards; 100 asset IDs; total UTF-8 request: 96,000 bytes. Oversized context fails clearly rather than silently dropping articles or notes.
- Response: at most 2,048 completion tokens and 128,000 response bytes. Truncated, malformed, or wrong-board proposals fail without an applied change.
- HTTP boundary: at most six accepted-origin requests per minute per socket IP; client-supplied forwarding headers do not establish identity.
- One cost unit means one provider call. Token and call ceilings bound consumption; cost units are not currency and no price estimate is fabricated. The owner must configure provider account spending limits and verify current pricing before enabling a paid service.

## Diagnostics access and retention

Server diagnostics contain only request ID, model ID, timestamp, error class, latency, call units, and numeric token usage. The sink revalidates and strips extra fields before writing JSONL. Prompt/card/article text, image bytes, names, credentials, stay details and provider bodies are excluded. HTTP 401/403 is `authentication_failed`, distinct from a provider outage. There is no HTTP log-reading endpoint and request diagnostics are no longer copied to standard error.

The default sink is outside the source/web roots in the OS user's state directory (`%LOCALAPPDATA%/MinistryOfTourism/muse-diagnostics` on Windows; the XDG state directory or `~/.local/state` elsewhere). Windows creates and verifies a protected DACL with only the current owner SID, inherited by newly created log files. POSIX directories/files use 0700/0600 and the directory owner is checked. The server refuses to start if private diagnostics cannot be established. Windows requires its installed Windows PowerShell; Node's mode bits alone do not establish owner-only Windows access ([Node file permissions](https://nodejs.org/api/fs.html#fschmodpath-mode-callback)). The browser, native packages and built assets contain no log files.

Each process has its own session file. An idle timer removes individual records after 24 hours while the process is running; normal server close and process exit delete that session file. A killed process or power loss cannot run cleanup: its owner-only remnant is removed on the next server start, and old session files are pruned then. This is the stated local retention policy, not a promise that an offline operating system deletes crash remnants at a wall-clock deadline. An owner who separately captures terminal output or runs a production platform must configure that external sink's access and retention independently.

Local tests inspect the actual Windows directory/file ACLs, verify a safe canary-free log, advance an idle session beyond 24 hours, check deletion on close, and refuse an unsecured sink before any provider call. Cancellation and the unchanged 30-second deadline also settle when a fixture transport ignores abort; that transport retains the single-call lease until it ends, preventing overlapping provider requests or late success logs.

## Live evidence (31 October 2026)

Local loopback only, owner-directed: built web app (`vite preview`, 127.0.0.1:5173) → mot-server (127.0.0.1:8788, key in the process environment only) → `POST https://api.meta.ai/v1/chat/completions` with `muse-wonder-1.0` → proposal validated in the browser by `parseMuseOutput`/`prevalidateProposal`, applied by the person and undone. Request `chatcmpl-01a18e26-6d97-7411-bd25-7a5b2555c83b`, reported model `muse-wonder-1.0`, 7.2 s server latency, 4,189 input / 972 output tokens. Board: a new labelled QA trip with no cards; the request carried the QA prompt and the public San Sebastián issue (8 articles). Evidence: `Design Sprints/Meta-Review-W6-2026-10-31/README.md`. Production ingress, owner-only log retention and design sign-off remain open below.

## Production gate and live evidence still required

Static Firebase Hosting alone does not run this Node process. Production needs an explicitly approved authenticated server/ingress, per-user authorization and spending controls, owner-only log access/retention, and the correct same-origin route. Do not expose the loopback development adapter as an unauthenticated public paid proxy.

The historical live receipt above remains evidence for its recorded application revision. Local follow-up combines the newer Ask Muse sheet with W6's schema-valid provider instruction, owner-only diagnostics, exact field disclosure and typed recovery. New checks use labelled transport fixtures only: no fresh provider call, credential handling or deployment is implied. The UI states the sent board/card/source fields, empty picture-ID list, 30-second ceiling, local retention policy and provider-account retention boundary. Sample changes retain explicit test-adapter attribution after save/reopen and do not claim that a separately configured live runtime is disconnected.

On 31 October 2026 the owner reviewed the actual Ask Muse composer and timeout-recovery screenshots and explicitly chose: "Use my approval of these screenshots" to replace the Opus-specific final design gate for this local closeout. This is owner approval, not an Opus review, independent model verification or a claim of independently awarded Design Council scores. The saved design/harness rules and model assignments are unchanged. Production setup still needs the separately approved authenticated ingress, owner-managed provider settings and platform retention described above.
