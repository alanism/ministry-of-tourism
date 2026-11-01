# MOT-121: public shop source reconciliation

1 November 2026, Asia/Bangkok. Evidence supplement only; MOT-121 stays In progress.

The published FCC shop catalogue contains **2,401 product records in 200 cities**.
The existing FCC-to-MoT audit contains **649 apparel mockup asset rows**. None of
the shop product IDs occurs as an explicit same-city apparel source/alias identity
in that frozen audit. No exact shop mockup/art URL association was found either.
These are different units: this does **not** establish 2,401 missing designs,
unavailable products, or that the underlying artwork differs. It establishes an
unreconciled product-record source, previously flagged in MOT-121.

Austin is the concrete city gap: the public source declares 12 product records,
while the frozen audit has no Austin apparel asset row. All 200 current source
city/product counts equal the retained 31 October rendered-shop observation.
That comparison is not a new rendered-shop, checkout or stock test.

## Pinned observations

| Input or result | Evidence |
| --- | --- |
| Public source | <https://foreignclubberscorespondence.web.app/shop/assets/city-catalog.mjs> |
| Fetch | 2026-11-01T10:07:34.257606Z; HTTP 200; `text/javascript`; 853,231 bytes |
| Source SHA-256 | `5bc9641eddac1d108008d24b21f36e4374663f65f9b90b02ce8cabe5f8e8f785` |
| Request bounds | One public metadata request; 4 MiB maximum; 20-second timeout; no credentials or redirects |
| Source interpretation | Only literal JSON `CITY` and `PRODUCTS` exports accepted; no source JavaScript executed |
| Inventory | 200 cities; 2,401 unique product IDs; no duplicate city/number slots; no empty city |
| Declared categories | places 913; graphics 702; people 629; tags 154; food 3 |
| Print locator metadata | 30 declared print-file paths; no files downloaded or permissions inferred |
| Product identity mapping | 0 explicit mappings; 2,401 unresolved product-record associations |
| Existing audit | 8,507 rows: 5,205 matched, 2,469 missing, 833 unresolved; 1 extra MoT item; 0 duplicate IDs |
| Existing audit rerun | Two runs at unchanged candidate `7d3865ea4077599b0a9ce9c17d667a7d8aa34eba`, exit 2 retained; both byte-identical to the previous report |
| Existing input denominator | 2,573 metadata inputs; 72,274,703 bytes |
| Existing audit SHA-256 | `a5edaafa6ca992a2a142fc7ca6f45fd301dd7fb6d995b3c5583deb0191eff659` |
| Supplement SHA-256 | `93eb7eebd23d1aeac68f93aa7603b16fdb35d3890206cf512605dc8644927323` |

The diagnostic preserves each product ID, city, source number/category and
separate mockup/art/print locators. It records discovery, preview, insertion,
sharing, embedding and shop evidence separately. A public locator is not a
license, byte-equivalence proof, product deep link, or product acceptance result.
Prices, sizes and stock were not evaluated. No image/original was fetched.

## Verification and scope

The new local diagnostic reproduced RED before its implementation, then passed
14 controls covering active JavaScript refusal, duplicate keys/IDs/slots,
unsupported source shapes, bounds, hostile locators, wrong-city/role mapping,
representation versus product identity, input preservation and deterministic
output. The full 2,401-row supplement repeats byte-identically.

The existing audit's 53 controls pass unchanged. A fresh `npm run check` on the
unchanged integrated candidate `7d3865e` passes 1,246 tests in 188 files and all
four TypeScript projects; total command time 41.805 seconds. These checks apply
to that runtime revision, not to an installed product-catalogue integration.

Full receipts, source bytes, the 2,401-row supplement, diagnostic/tests, initial
RED, repeat reports and logs are retained in:

`C:/Users/alani/OneDrive/Documents/Vibe Code/Ministry of Tourism/Design Sprints/MOT-121-Shop-Reconciliation-2026-11-01/`

Run `python -m unittest -q test_reconcile.py` and `python reconcile_shop.py` from
that directory. `baseline-rerun.json`, `reconciliation-verification.json`,
`fetch-receipt.json` and `candidate-check.json` identify the inputs and results.

This is read-only source diagnosis while MOT-138 awaits the actual Muse cloud
route. No application catalogue, original audit, eligibility, source repository,
test/harness, acceptance definition, completed task, release gate or production
deployment changed. MOT-121's required definition/Astra review and A23 remain
pending. The inline-sheet/Manila authority gaps in MOT-137 remain unresolved.

Before MOT-139/122/127 implementation, reconcile the shop product-record
denominator with the existing asset inventory under the reviewed catalogue
contract; retain both source units and explicit mapping/exclusion reasons.
This supplement does not resolve those implementation blockers. MOT-138's
actual Muse tests remain pending; private-trip MOT-143–145 stays deferred.

Recheck unresolved source mappings when authoritative evidence arrives, or on
1 May 2027 under the empirical retry policy. No automation was created.
