# FCC Journal exchange (MOT-97)

`exportFccJournal(doc, assets, {party, ...exportOptions})` produces an FCC
`fcc.b.travel.v2` reading copy, an identity map, an unsupported-field report and
the original **scoped** native ZIP. Keep both files. Private and guide filtering
happens before either output is made; party names, stable city and actual dates
must be explicit. The adapter adds FCC's item sequence, prototype and place-list
fields so the editor can add notes after opening the copy.

Open the JSON in the matching city's FCC Journal, edit it, and use **Save JSON**.
Then call `importFccJournal(editedJsonBytes, originalScopedZipBytes)`. This core
adapter returns a fresh `doc`, native `assets`, an `unsupported` report and the
exact edited `originalFcc` bytes. The caller must retain the latter for FCC ink,
media and arrangement recovery. This adapter does not add a MoT import/export UI.

The policy approved on 30 October 2026 is:

- Preserve native titles, bodies, source snapshots, provenance and checked facts.
  Changed FCC text is appended in full to the original card's traveler annotation,
  labelled with its FCC date. This includes edits to FCC's flattened source text;
  such edits never become replacement source evidence.
- New FCC notes become traveler cards. Missing or deleted FCC entries leave native
  cards intact and appear in the report. Stable FCC entry IDs map existing notes.
- Native art bytes, placements and undated cards stay in the companion ZIP.
  FCC ink, clips, art, photos, notebook settings and arrangement stay in the returned
  FCC backup and are reported rather than silently converted.
- Unchanged FCC text and dates leave native cards byte-for-byte equivalent in the
  readable model. The imported board has a new identity, as with native ZIP import.

`nb.trip.motSource` carries the companion ZIP's SHA-256 because FCC persists trip
metadata through saves and reloads. The hash checks file pairing, **not authorship
or authenticity**. Older reading copies without this marker cannot import edits;
export a new copy. No currencies, FX rates or venues are invented.

The FCC JSON cap remains 25,000,000 bytes. Native ZIP import retains its existing
archive, checksum and active-content checks. Unsupported formats, mismatched
files/cities, duplicate identities, invalid dates and invalid item sequences are
rejected. A native calendar beyond 30 days is rejected before mapping. An edit
that would exceed the 20,000-character traveler annotation limit rejects the
whole import; it is never truncated. Commands validate every proposed edit before
writing to the fresh trip; no currently open trip is modified.

Run the focused contract checks with:

```sh
npx vitest run packages/core/src/trip/fcc-journal.test.ts packages/core/src/trip/fcc-journal-import.test.ts
```

Setting `MOT_FCC_JOURNAL_EVIDENCE` to an external output prefix also saves a
synthetic FCC JSON and its companion ZIP for the published editor's **Open JSON**
flow. Run the actual FCC validator and save/reload cycle separately when FCC's
published editor changes; unit tests do not substitute for that acceptance check.
