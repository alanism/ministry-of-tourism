# Shared public FCC catalogue — MOT-139 local implementation

The browser and public handler consume one strict catalogue/query/eligibility implementation in `packages/core/src/trip/public-catalogue.ts`. Transport/cache/UI stay outside core. No private trip/context fields, article bodies, raw registry dump or original image bytes enter this corpus. No deployment, FCC source write, new licence, paid inference or kanban status change was performed by this slice.

## Pinned corpus and source units

Snapshot: `fcc-7a7b564fa587b84ba69948f7e358b9ea5c3ac5e5d5b1813b4d4a0ac8c881d5e1`. Generated with the approved offline asset/shop audit, the actual manifest-referenced MoT artwork shards, destination registry, published FCC feed index and198 validated city feeds, the bounded source-gap diagnostic and the exact owner-approved operation dispositions.

- 8,507 frozen asset source rows;833 originally unresolved;0 denominator exclusions. Raw missing/unresolved accounting is preserved, not relabelled as unique designs.
- 2,401 shop product records remain a separate unit with unresolved product-to-runtime asset associations. Real declared mockup/artwork representations and city-only shop routes remain distinct; no stock/size/price or exact-design checkout claim.
- One extra runtime unit remains, explicitly related to the now owner-bound brush source row rather than deleted.
- 200 destination records,1,712 public article metadata records and10,268 public place metadata records. Austin and Manila have no pinned published feed in this release; article/place queries report their gaps, not a complete empty result. Article bodies are excluded.
- Total23,089 queryable metadata identities, not23,089 unique artworks.

The normalized records preserve stable source IDs, source versions/digests/dates, recorded origin/country, full frame/crop/source-sheet provenance, real credits/rights, rendition roles and per-operation reasons. Known matched runtime IDs are relations, not guessed source-row aliases. No alias/tombstone history was invented.

## Exact owner dispositions

`docs/MOT137-OWNER-APPROVAL.md` records Alan's actual approvals. `MOT137-APPROVED-RENDITIONS.json` pins that document's UTF-8/LF hash, original image-inventory hash, FCC revision and the root's actual17-representation live-byte receipt hash. It contains only selected public metadata, not private machine paths or image payloads.

Sixteen existing New York/Ho Chi Minh City figure WebPs are enabled for public preview and **personal-trip insertion only**. Every runtime record has its WebP's own hash, pixel dimensions, `renditionRole: derivative`, `personalOnly: true`, full `[0,0,1,1]` placement crop and no invented `original` URL. ArtRef.source.contentHash retains the corresponding master PNG hash. The ledger separately retains1254×1254 master hashes/byte counts, raw source frame and source versions. No second application of the sheet crop occurs. Full-sheet originals, host-guide insertion, shared/standalone embedding, printing and commerce receive no new grant. Source-row state remains historically unresolved where the original remains unpublished; the approved alternate operation is explicit.

The exact brush master is bound to Manila/PH, original portrait artwork with its existing bytes/credit/rights. The canonical source row and previously extra runtime unit are both retained with an explicit relation. General MOT-92 credited-art policy is unchanged. Persisting personalOnly to native assets and enforcing shared-export restrictions belongs to the separately coordinated insertion/export slice, not an inference from this metadata flag alone.

## API and wire boundary

`validateCatalogueIndex` accepts the strict full or compact wire index and returns the same expanded `CatalogueIndex`. Compact templates deduplicate only sourceVersion/retrievedAt/freshness/rights/eligibility. Unknown/private fields, missing templates, overrides and identity/denominator conflicts fail validation. The query domain uses NFKC, lowercase and whitespace normalization; deterministic city/category/type/title/ID ordering; explicit types[], city/country, category/line and purpose. Limit defaults20/max50. Cursors bind the snapshot and SHA-256 of normalized query/filter/purpose/order identity and remain below1000characters.

`searchCatalogue` is asynchronous only for the existing WebCrypto digest. `readCatalogueItem(index,id,purpose)` is synchronous and returns the indexed item/detail locator, actual recorded alias/tombstone outcome or unavailable. `catalogueItemForPurpose` is shared by summary, detail and public adapters; it does not create a second rights engine. `validateCatalogueDetail` binds every row to its exact index/snapshot/shard and runtime ID, origin/country, source relation, rendition/original/crop/hash evidence and personalOnly restriction. It never assumes audit rowID equals runtime assetID.

`toPublicCatalogueItem/Page` emits only the corrected MOT-138 contract fields. CityResult and assetResult JSON definitions are generated from the same strict Zod wrappers and resolve existing catalogItem refs. Original definitions are retained. Unknown delivery MIME/native connector compatibility is not certified by these validators.

## Measured metadata budgets

Manifest31,840bytes; compact index14,822,964bytes, expanded equivalent35,411,424bytes;200lazy detail shards, largest396,122bytes. The original uncompressed index exceeded the declared16MiB cap and was correctly refused; that failure is retained. The cap was not raised. Full detail metadata totals63,051,764bytes and is never required for first list search; the root reader loads bounded selected shards only. No thumbnail/original fetch occurs in this generator.

Full generation completed in19.523seconds, focused loops remain below60seconds. Generator output is deterministically bound to normalized metadata, exact input digests and normalizer source digest. `MOT139-CATALOGUE-BUILD.json` preserves all per-input hashes/bytes and output measurements. Source lookup paths in that private repository evidence are public-relative identifiers, not machine secrets.

## Verification and limitations

14 focused catalogue/contract tests and7 generator controls pass; core TypeScript passes. Initial missing-feature REDs, runtime substitution RED, cross-shard RED, personal-purpose RED, source-approval provenance negative controls, wire/private-template refusal and runtime restriction propagation RED/GREEN logs remain beside the kanban under `Design Sprints/Route-To-90-Execution-2026-11-02`.

The full metadata verifier passed: all23,089IDs reached over462pages; all200shard hashes and records agree; all runtime/source bindings validated;16 personal derivative records, one brush source binding and one related extra unit retained;7,652 runtime representations. Verification took17.542seconds. The generator also checks complete expanded-wire equality for all records.

The root separately performed actual HTTP/hash/decode verification of the17 approved representations. These results do not replace root browser Add/Undo/reload/native restore, full-corpus loading measurements, supported devices, independent whole-card acceptance, native MCP client compatibility or release gates. Historical O3/O5–O8 denominator remains unknown and is not reconstructed by this public metadata inventory.

Both council roots were applied: Engineering systems/adversarial skills (one pure catalogue authority, bounded work, exact source/operation evidence, immutable harness) and Design Ryo Lu/Andy Allen/Jayse guidance (discoverable real material, reversible human operations and clear state; no decorative film UI). The root's actual Muse Wonder1.0 route review and actual Muse Wonder definition/implementation reviews remain independently attributable; this implementation is actual Muse Wonder.

Current delivery follow-up: snapshot `fcc-5dd0b216e02ed5f9e818f0ee25f5e45c19bf7161ee757b155a3e66811db7a84b`; all 16 approved WebP renditions lack observed ACAO, so preview remains available and insertion is unavailable pending separately authorized FCC header deployment. Rendition metadata now retains exact hash/dimensions/full crop; generated labels use plain separators. Nine generator tests pass; full corpus identity/hash verification retained in Route-To-90 evidence.
