# MOT-107 response ledger

The ledger is a separate, versioned organizer JSON file. It never imports or replaces a trip document, itinerary, permissions, bookings or media. Household response files contain the explicitly shared MOT-105 envelope, either as JSON or as a two-file `mot-household-response` ZIP. A ZIP contains only `response.json` and its versioned size/SHA-256 manifest; it does not carry the household roster or executable content.

From the repository root, using the same Node runtime as the app tooling:

```sh
node scripts/merge-mot-responses.mjs --config group.json --out ledger.json response.json response.zip
node scripts/merge-mot-responses.mjs --config group.json --out ledger.json --resolve-household family-a response.json
node scripts/merge-mot-responses.mjs --config group.json --ledger ledger.json --out ledger-copy.json later-response.json
```

`group.json` is the MOT-105 configuration object (version, stable trip ID, households and declared rounds). Output is mandatory and must be separate from configuration/response inputs. Existing output is loaded as the previous ledger automatically. An explicit previous ledger may be used to create a fresh copy; an existing output must use itself as its previous ledger. Only an organizer-owned ledger should be supplied as previous state. Returned household files cannot set sender-resolution flags.

By default unfamiliar replies are pending and never enter `current`. `--resolve-household ID` records the organizer's explicit resolution for those imported replies. This is a household label decision, not authentication or a signature. It neither creates voters nor grants permissions. A pending higher reply leaves the previous resolved response usable until resolution. Matching an unresolved envelope later with explicit resolution changes its flag without adding another history entry. Resolving later replies does not retroactively resolve unrelated pending files.

Every unique valid response is retained in revision history. Identical response IDs are no-ops, including delivery again inside ZIP. Higher resolved revisions replace the active snapshot; lower revisions stay historical. Two different resolved responses at the same highest revision suppress that household/round from `current` and expose both IDs as a conflict. There is no arrival-time winner. Ask for a higher revision to resolve a conflict. Clock dates never choose a winner. Independent stamps and rank points are not altered or tallied here.

`current` uses the highest proposal version declared in the supplied group configuration. Other versions remain separately identified in history and `stale_proposals`; rounds and households are keyed independently. Declare every round belonging to a new proposal before merging its replies. All prior declared round definitions must remain available to validate retained history. Names can change without changing stable IDs.

The public core exports `mergeResponseLedger`, `mergeResponseFiles`, `parseGroupResponseFile` and `exportGroupResponsePackage`. They run in Node or the browser (File/Blob bytes), use the MOT-105 validator and native ZIP limits, and perform no network or board writes. Inputs are not mutated. The returned object contains `ledger`, `current`, `conflicts`, `pending`, `stale_proposals` and per-response receipts. Consumers must use the validated current projection, not sum history. MOT-108 handles tallying; MOT-106/112 handle response/summary UI. No new form or automatic trip-import behavior is claimed here.

The merge validates all previous history and all new responses before returning any candidate. Bad hashes, unsupported fields/versions, wrong identities, unknown options, malformed or oversized input and invalid ranks reject the entire batch. JSON text stays inert; guide URLs are never fetched. ZIP entry names are restricted, duplicates rejected, declared expansion sizes checked before inflation, and actual sizes plus manifest and response-content hashes checked afterwards. Limits reuse native package constants (10 MiB per file; 50 MiB per batch/expanded archive), with at most 1,000 unique history entries.

The CLI retains the previous valid file on validation or save failure. It takes an exclusive sibling lock, writes and fsyncs a candidate in the same directory, then atomically renames it into place. Duplicate content does not rewrite the output. Busy locks report a retry action; after an interrupted process, confirm no merge is active before removing its stale `.lock` file. A failed candidate is removed; the original remains available. These locks coordinate this CLI's writers, not unrelated editors. Keep a separate backup when editing a ledger manually. The CLI prints counts, never response notes.

Tests: `packages/core/src/trip/response-ledger.test.ts` and `response-ledger-cli.test.ts`. Run `npm run check` and `npm run build --workspace apps/web`. Evidence is recorded on MOT-107 in the production integration kanban. No credentials, paid models, deployment or PDF work.
