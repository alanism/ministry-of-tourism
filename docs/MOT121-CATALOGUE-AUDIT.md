# MOT-121 catalogue audit: bounded shop inventory

1 November 2026. Local implementation; MOT-121 and A23 remain open.

Alan requested actual Muse Wonder review, issue fixes and catalogue progress. Muse Wonder
approved the existing MOT-121 definition for this bounded offline work and
independently reproduced the historical shop findings. It requested two adapter
corrections: refuse controls before URL parsing, and preserve complete source
metadata with separate product/asset units. The historical diagnostic remains
unchanged; this adapter supersedes its projection for new inventory work.

## Implemented boundary

The existing audit accepts an explicit pair of local inputs:

```powershell
node scripts/audit-mot-fcc-coverage.mjs `
  --fcc-root <FCC_METADATA_ROOT> --mot-public <MOT_PUBLIC_ROOT> `
  --shop-source <PINNED_CITY_CATALOG_MJS> --shop-receipt <FETCH_RECEIPT_JSON> `
  --output <REPORT_OUTSIDE_INPUT_ROOTS>
```

Without these options, the version-1 report is unchanged. With both, version 2
contains `assetAudit` (the exact original report) and `shopAudit` (the distinct
shop-product inventory). Never add these counts as unique designs. No original
asset row is removed, reclassified or silently excluded by this supplement.

The shop input is the published `CITY` and `PRODUCTS` JSON literals from
`https://foreignclubberscorespondence.web.app/shop/assets/city-catalog.mjs`.
Source code is parsed as data, never imported or evaluated. The adapter makes
no network request. Bounds: 4 MiB source, 64 KiB receipt, depth 32, 500,000
tokens, 1,000 cities and 10,000 products. Invalid UTF-8/Unicode, duplicate keys,
exports/IDs/city slots, unsafe numbers, changed schemas, malformed locators and
source/receipt mismatches fail the requested scan. ASCII controls/whitespace
are rejected before any locator normalization. URLs remain within declared
FCC shop asset roles; no images or print files are read.

Each stable `fcc-shop:<rawProductId>` carries its source snapshot SHA separately.
Complete declared city and product objects survive, including country label,
line, print, layout and declared price. These remain source observations:
country labels are not inferred ISO codes, and prices are not current commerce
claims. Mockup, artwork and print-file locators have distinct roles; unknown
dimensions/hashes/rights/credit remain unknown. Existing MoT asset rights policy
is unchanged. A locator is not an original-byte, insertion or embedding grant.

Candidate same-city source IDs and related representation URLs are diagnostics,
not accepted product-to-asset mappings. Every product remains unresolved until
the appropriate authoritative mapping and operation checks exist. The new
inventory can be fully scanned while `ok` stays false. Exit 2 means a completed
scan with coverage gaps; exit 1 means invalid/incomplete execution and emits no
new report. A prior output file may remain after a failed scan: consumers must
check exit status and pinned input identities. Inputs cannot be report outputs.

## Evidence and remaining work

New behavioural controls cover metadata preservation, stable IDs across source
changes, malformed/active input, source bounds, control-character refusal,
mapping limits, empty cities, exact nested legacy preservation, missing inputs
and failure without overwriting input/prior evidence. Existing tests and harness
constraints are retained. Full frozen-input and independent implementation
review receipts are recorded in:

`C:/Users/alani/OneDrive/Documents/Vibe Code/Ministry of Tourism/Design Sprints/MOT-121-Muse Wonder-Catalogue-2026-11-01/`

The source is 2,401 product records/200 cities, separate from 649 legacy apparel
asset rows; Austin has 12 shop records and no legacy apparel row. The original
8,507-row report retains 5,205 matched, 2,469 missing, 833 unresolved, one extra
and no duplicate IDs. These source findings do not establish missing unique
designs, current availability, rights, UI insertion or full FCC coverage.

The original inline-sheet/Manila authority gaps remain MOT-137 work. MOT-122/127
own human discovery and truthful shop handoff. MOT-139's actual-client blocker
remains: MOT-138 contract approval is not actual Muse cloud/file execution.
No shared consumer extraction, MCP endpoint, private-trip access, source
publication, app UI, deployment or release gate is implemented by this change.
Private-trip MOT-143–145 remains deferred. No self-Verified claim is made.

## Actual review and verification disposition

Independent `muse-wonder-1.0` approved corrective source commit
`a0a74a79c45f3b920ec7ba512ed74c6e9223cb4a`; its exact patch is integrated in
isolated candidate `deda79052366da8b1d4ba3185e45b75ce7427822`. All four findings
are closed within this audit scope: control-bearing locator refusal, complete
source metadata/units, source-controlled category accounting and derivative-only
representation association. The first REQUEST CHANGES and separate APPROVE
reports are retained as `WONDER-IMPLEMENTATION-REVIEW.md` and
`WONDER-IMPLEMENTATION-REREVIEW.md` in the evidence folder above.

Muse Wonder independently passed 66 controls (53 unchanged originals plus 13 new),
recomputed every shop record and confirmed the unchanged original asset report.
The repeated v2 report is 30,253,506 bytes with SHA-256
`3a15dd70fcba3c2bc9cbe352b5296f7ccfb190c09612b58c73e7e5a07cb21a27`.
The isolated candidate passes `npm run check`: 1,246 tests / 188 files / four
TypeScript projects in 41.840 seconds; the web build passes in 6.242 seconds.
All 200 pre-existing test/config/rule Git blobs remain unchanged. App/package
runtime source, canonical 7d3865e candidate and production were not changed.
This final documentation record adds no code after the reviewed/tested patch.

Kanban save 243 records R33–R35 and the scoped implementation; the original
acceptance definitions and broad source-authority blocker remain. Actual review
is satisfied for the bounded audit; source decisions and full coverage remain
unresolved. All other 76 task objects and all 52 completed cards are preserved.
