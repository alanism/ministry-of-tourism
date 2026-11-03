# FCC Coverage Audit (MOT-121)

`scripts/audit-mot-fcc-coverage.mjs` is a deterministic, offline, metadata-only audit comparing a supplied Foreign Clubbers Correspondence (FCC) snapshot with the supplied MoT public catalog. It does not fetch live URLs, read image bytes, follow registry `local` paths, execute embedded content, or mutate inputs. Consequently it provides no live URL or real-byte proof; availability is only as declared by supplied release metadata.

## Bounds

City documents are capped at 4 MiB, registries and other individual files at 16 MiB, and unique actually-read input bytes at 128 MiB in aggregate. Inputs are allocated from their stated file size with change detection during the pinned read, rather than preallocating the maximum for every file. Count limits also apply to cities, files, rows, collections, items, and related collections.

## Interpretation

A full source sheet and a crop derived from it are distinct identities. A gallery record that aliases a crop adds SHA/URL provenance to that crop while its full gallery row remains separately visible; matching one exact crop does not cover the sheet or another crop. A runtime derivative coalesced with its underlying crop preserves the runtime source ID, with prior IDs retained as aliases.

Rows retain provenance, credit, and rights status. Source-supplied credit/rights are not upgraded by a MoT match; conflicts and unresolved provenance remain visible. Eligibility is deliberately conservative: catalog presence still needs a product check, credited sharing follows the existing policy without granting standalone permission, embedding is unresolved, and shop status is unverified.

## Run and exits

Run the explicit test command with:

```sh
node --test scripts/audit-mot-fcc-coverage.test.mjs
```

Run the audit with `node scripts/audit-mot-fcc-coverage.mjs --fcc-root PATH --mot-public PATH --output PATH`, where the output must be outside both input roots. Exit `0` means the completed report has no gaps or issues, `2` means the completed audit found gaps/issues, and `1` means the audit itself failed (for example missing, malformed, unsafe, changed, or oversized input).

## Downstream use

The report's `missing` and `unresolved` rows, together with its issues and limitations, are inputs to MOT-122 and MOT-127 triage. They are not, by themselves, proof that coverage has been accepted or that any asset may be used for a new purpose.
