# MOT-121 source gaps: local diagnosis and upstream handoff

Baseline `e3b9d4015b76fafc7f0bd3966ed5307e9d837a96`, 31 October 2026. Codex performed this bounded local diagnosis. It is neither a publication change nor approval of a source exclusion. The production audit stays metadata-only and still reports these unresolved rows.

## Sixteen inline derivatives

Both city metadata and journal originals maps contain the same embedded PNG sheet. The eight declared frames per city are valid within the declared 1254×1254 sheet. The separately executed diagnostic decoded only these two already-local payloads in memory, checked the PNG header and dimensions, and hashed the exact PNG bytes. No matching digest is declared in the supplied optimized release or asset registry.

| City | PNG bytes | Dimensions | Full PNG SHA-256 | Frames |
|---|---:|---|---|---:|
| new-york | 1,529,583 | 1254×1254 | `4d367f08fa065a00b25885a8c9155ad3c65acfd63299f8ee33970d11f6e93df4` | 8 |
| ho-chi-minh-city | 1,381,261 | 1254×1254 | `4e55b7a88cdb12ebceb9e22c2e54502a116e3ab8ec6e3b3326b67c26e22e2923` | 8 |

The public gallery fashion pictures for these cities have different dimensions and identities. They cannot be substituted for these eight-frame sheets. An embedded image's text fingerprint is distinct from its decoded PNG hash; neither a basename nor the same city name proves an alias. No payload or decoded image is copied to this repository or to a report.

**Required disposition:** obtain a source-authoritative published original mapping for each exact sheet, with city, full digest, byte count, dimensions, original URL, frames, credit/rights and release version. If the source owner chooses a different representation or an operation-specific exclusion, record that explicit decision and retain the original 16-row denominator. Supporting inline originals in MoT would require a separately reviewed contract change; this work does not weaken the existing HTTPS catalog or audit contracts. No FCC source or hosted publication was modified.

## Manila brush master

`data/brush-portraits.json` declares `artworkMaster` with SHA-256 `baf3835f9d4102d83856a3f31ba06c069ef5132d26fe73c0891b636ddb4ce858` and the original `/assets/brush-portraits-v1/manila/baf3835f9d41-artwork-original.png`, but no explicit city/country field. The asset registry supplies no digest-matching city binding. The existing MoT generator assigns Manila; repeating that assumption or reading the URL path is not independent source-city evidence.

**Required disposition:** an authoritative source record binding this master to a city/country, or an explicit non-city/scope decision preserving its identity, credit and rights. Keep both the source unresolved row and the unmatched MoT entry visible until then. Do not silently remove the artwork or relabel its origin.

## Separate, locally fixable audit issue

The Osaka and Taipei magazine entries explicitly declare `type: restaurant`, while the old audit used their `food` section as category. The bounded Wonder fix prefers existing explicit category, then recognizes only the declared `hotel`/`restaurant` types, then retains the old section fallback. It changes no URLs, rights, images or public catalog records. Cross-city identical-byte aliases in release metadata prove identical bytes only; they do not independently verify depicted venue, source licensing or live availability.

## Reproduction and handoff boundary

Run `probe-source-gaps.py` from the local evidence directory `Design Sprints/MOT121-131-Wonder-Next-2026-10-31/`. It pins nine source JSON files, accepts only bounded PNG data URIs, checks four invalid-input controls, and verifies source hashes after reading. `MOT121-SOURCE-GAPS.json` retains every frame/derivative reference, full hashes, input versions through file digests, and the held dispositions. This diagnostic is separate from the audit and grants no extra filesystem or network access to it.

The upstream follow-up may prepare source corrections locally; publication, source ownership decisions and any existing harness change require their own authorized scope. MOT-121/A23, requested Astra review, production/device holds, native JSON/ZIP and PDF closure remain unchanged.
