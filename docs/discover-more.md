# Discover more like this

The public preview was enabled on Firebase on 5 November 2026 with owner approval. Production uses anonymous Auth, consumed App Check plus a durable token-ID replay guard, and the named usage database. The legacy loopback instructions below are an additional local option. See [deployment details](public-discovery-backend.md).

This opt-in feature starts in **Explore FCC**, after a city's public catalogue loads. Choose one to three FCC places and a category, review the Contributor disclosure, and ask Muse Spark 1.3 Contributor for related venues. Nothing is added automatically. Each result shows its related FCC seed, a model-suggested connection, the exact returned search excerpt, a source link and the search time. **Add to board** creates an unverified agent place card in Explore using the normal command boundary; the source excerpts and retrieval time stay with it. Duplicate board titles are blocked locally at add time.

## Public input only

The public browser request sends `{cityId, seedIds, category, requestId, contributorConsent: true}`. The loopback request sends only `{cityId, seedIds, category}`. The server accepts this exact schema, reloads the city from the fixed public FCC feed origin, and resolves the selected venue IDs itself. It sends Meta the public city name, selected public venue names/links, category and all existing public venue names as exclusions. Arbitrary prompts, board IDs, cards, notes, photos, bookings, user keys and other extra fields are rejected. No private board state is available to the discovery adapter. Catalogue and provider text are data, never executable instructions.

This is a **separate Contributor-mode flow** from the existing Standard-mode board assistant. Meta Contributor permits submitted content to improve Meta models and prohibits personal, sensitive and confidential information. The UI discloses this and requires a per-panel opt-in. No text-entry field or board-selection field exists in discovery. This does not change other features' privacy or account terms. See [Meta's published account information](https://dev.meta.ai/docs/pricing-rate-limits).

## Source rules and limits

The adapter uses `POST https://api.meta.ai/v1/responses`, model `muse-spark-1.3-contributor`, `web_search` and `include: ["web_search_call.results"]`, following [Meta's search-grounding documentation](https://dev.meta.ai/docs/search-grounding). At least one completed search must be returned. A candidate URL must exactly match a returned search result with a nonempty snippet. The saved excerpt must name both the candidate and its selected FCC seed. Model-written URLs alone are discarded. Instagram is labeled only for a readable co-mention on an Instagram post or reel URL; profiles and empty snippets are discarded. A successful response may contain zero candidates. Search snippets are evidence to review, not independent verification of the model's interpretation, location, current operation, recency or popularity. Dates are **search times**, not publication dates.

All existing FCC venue names are excluded in the prompt and checked again after Unicode/punctuation normalization; repeated new candidates are removed. This handles spelling-format duplicates, not every business alias. There are no trend scores, fabricated social metrics, claims of private Instagram access or claims that FCC endorsed a newly discovered place. The Copenhagen test suggested Lille Bakery, Apotek 57 and Copenhagen Contemporary from public guides; those examples are not baked into live results. Tests use clearly labeled synthetic fixtures.

## Runtime and owner setup

**Default: unavailable.** The static Firebase Hosting configuration has no discovery backend or secret storage; its SPA fallback is not an API. The UI handles the missing endpoint without affecting FCC, manual boards or exports. No hosting rewrites, deployment configuration or secrets were added. No live paid request was made during implementation.

The adapter is currently a **single-process loopback preview only**. The server binds `127.0.0.1`; discovery also requires a loopback browser origin and loopback remote address. Existing origin, JSON-content and intent-header checks remain in effect. The owner may configure their own server environment outside this repository with:

- `MOT_DISCOVERY_MODE=loopback-preview`
- `MOT_DISCOVERY_CONTRIBUTOR_ACK=true`, after reviewing the applicable Meta terms
- `META_API_KEY`, held only in that owner's local server environment
- `MOT_ORIGIN=http://127.0.0.1:5173` (the default exact browser origin)

Then run the existing `npm --workspace @mot/server start` and `npm --workspace @mot/web run dev`, and open that exact loopback URL. The existing Vite `/api/muse` proxy covers both discovery routes. Never put a key in Vite variables, the browser, a URL, a board or an exported package. This delivery did not read, copy, install or configure a real key.

**Bring your own key means running your own local server in this release.** The public app does not collect a personal key or forward one through the owner's server. An owner-funded public preview and a hosted BYOK interface are not enabled. The existing external Muse helper remains available independently.

## Usage controls and deployment decision

- Exactly one in-flight adapter request; no retries and no automatic follow-up loop.
- At most **five provider attempts for each server process lifetime**, reserved before sending. Failed or cancelled provider calls consume attempts. Restarting the server resets this allowance.
- At most six HTTP submissions per minute per socket address, shared with the existing Muse limiter; no trust in forwarded IP headers.
- 2 KiB browser request, 12 KiB serialized public-catalogue input, 192 KiB streamed provider response.
- At most two built-in search calls, low search context, 2,500 output tokens including reasoning, and a 30-second total adapter timeout. Browser cancellation/close ignores late results. Cancelling a request cannot guarantee that the provider stops billing it.
- No request content, keys or raw provider errors are logged by discovery. Existing board-assistant diagnostics are unchanged.

These are per-process request and output bounds, **not a hard dollar ceiling or a global token budget**. Web search may introduce variable billed input tokens; a timeout may already have incurred cost. A second server, serverless instance or restart has a separate allowance. The current adapter intentionally refuses nonlocal origins even if its preview variables are set. Before any public funded preview, implement authenticated ingress and an atomic persistent admission/usage ledger shared across instances, plus account-level spend controls. That backend/deployment work requires a separate concrete setup and review; a Firebase static deploy alone cannot make discovery run safely. No deployment, commit or push was performed here.

## Carousel panel

Slide 09 adds an outlined Gotham SVG with accessible HTML copy. The photo is a reused FCC-inspired model/iPad scene from slide 08, composed with a new discovery headline and source-review copy. No new photo was generated and no paid image API was called. The panel accurately labels this as a local preview and qualifies Instagram coverage. Existing slides, actions and typography preview are preserved.

## Public preview follow-up

The separate attested Firebase backend is now deployed and enabled after owner approval on 5 November. See [public discovery backend](public-discovery-backend.md) for durable limits, exact request contract, setup/deployment holds and verification. The app dispatches `firebase-attested` status to the lazy anonymous Auth/App Check adapter, retaining loopback behavior. The public client config contains no Meta credential.

For this workspace, use npm 11.18.0 or newer containing npm/cli fix #9673 when resolving dependencies: npm 11.9 silently loses root overrides across workspace links and reports patched gRPC as invalid. The lock pins `@grpc/grpc-js` 1.14.7. Both clean-manifest lock resolution and the actual installed tree were checked with pinned npm 11.18.0; a fresh full root `npm ci` was not run. Root audit retains inherited body-parser and moderate advisories; new Firebase high advisories were removed. This is not a claim that the entire repository audit is clean.
