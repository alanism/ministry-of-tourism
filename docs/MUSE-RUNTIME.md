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

Without all three Meta settings, status and proposal requests report unavailable. Existing manual board, artwork, saving, and export workflows require no key.

The local Vite app can proxy `/api/muse` to this loopback server. A proposal POST must carry `Content-Type: application/json`, the exact configured browser `Origin`, and `X-MoT-Request: 1`. No cross-origin CORS grant is emitted. This protects the local browser boundary from arbitrary sites; it is not a production user-authentication service. The local trust boundary assumes the owner's OS account and processes are trusted.

## HTTP contract

- `GET /api/muse/status`: availability, reason when unavailable, model ID when configured, and limits. No credential is exposed.
- `POST /api/muse/propose`: strict `{boardId,prompt,cards,assetIds,grounding?}`. Returns unavailable, a typed error, or `{status:'ok',proposal,receipt}`. The receipt records request ID, model ID, date, latency, and token usage when supplied by the provider.
- The browser must run the returned proposal through its actual `parseMuseOutput`/command/revision validator before it can be applied. Server envelope validation is not board authorization.

Typed adapter errors distinguish invalid input/output, rate limit, provider unavailability, timeout, cancellation, and an already-running request. The adapter returns no provider error body, stack trace, or echoed prompt.

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

Server diagnostics contain only request ID, model ID, timestamp, error class, latency, call units, and numeric token usage. They never contain prompt/card/article text, image bytes, names, credentials, stay details, or provider error bodies. The application writes these records only to the owning process's standard error; there is no web endpoint to read logs, and it creates no durable log file or database.

Application retention is process/terminal-session only. If the owner deliberately captures standard error, that sink must be readable only by the owner and rotate/delete entries within 24 hours. Production deployment must enforce those access and retention rules in its logging configuration; this local implementation does not claim to configure an external platform's log retention.

## Live evidence (31 October 2026)

Local loopback only, owner-directed: built web app (`vite preview`, 127.0.0.1:5173) → mot-server (127.0.0.1:8788, key in the process environment only) → `POST https://api.meta.ai/v1/chat/completions` with `muse-wonder-1.0` → proposal validated in the browser by `parseMuseOutput`/`prevalidateProposal`, applied by the person and undone. Request `chatcmpl-01a18e26-6d97-7411-bd25-7a5b2555c83b`, reported model `muse-wonder-1.0`, 7.2 s server latency, 4,189 input / 972 output tokens. Board: a new labelled QA trip with no cards; the request carried the QA prompt and the public San Sebastián issue (8 articles). Evidence: `Design Sprints/Meta-Review-W6-2026-10-31/README.md`. Production ingress, owner-only log retention and design sign-off remain open below.

## Production gate and live evidence still required

Static Firebase Hosting alone does not run this Node process. Production needs an explicitly approved authenticated server/ingress, per-user authorization and spending controls, owner-only log access/retention, and the correct same-origin route. Do not expose the loopback development adapter as an unauthenticated public paid proxy.

MOT-95 stays short of live acceptance until the owner configures the server and a real browser → server → Meta → validated proposal round trip records request ID, model ID, date, and the exact application revision. Also recheck cancellation, failure, privacy disclosure, and manual operation with the runtime disabled. No deployment or paid call is authorized by this document.
