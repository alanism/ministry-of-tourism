# Content-card and source-cache UI

MOT-80 uses the existing card brick and validated commands. Source details keep the publisher snapshot read-only and edit `travelerNote` separately. Legacy edited excerpts remain visible as the traveler's saved copy. Notes, dated evidence, FCC quotations and unverified Muse suggestions have distinct labels. Source URLs are opened without an opener/referrer; invalid schemes and embedded credentials are not actionable. Source HTML is rendered as text.

MOT-79 retains the current issue while fetching. Its state is scoped to the board and destination; a failed or timed-out request cannot substitute another city's copy. Refreshing never writes to copied cards. Changed source identities produce a note-kept badge, with article and venue namespaces kept separate. Source status carries the retrieval date and explicitly labels a cached offline copy. A loaded response does not claim a durable cache write succeeded.

The existing adapter performs ETag revalidation. The browser explicitly uses its existing maximum of two retries, giving three total attempts, then stops until a person retries. The existing 20-second request deadline remains. Source status can be inspected above the board without initiating a request; destination content is still loaded on opening Explore FCC.

## Reproduce

Run `npm run check` and `npm --prefix apps/web run build`. With a dev server, set `MOT_TEST_ORIGIN` and optionally `MOT_PLAYWRIGHT_MODULE`; direct `MOT_EVIDENCE_DIR` outside the checkout, then run:

```
node scripts/test-mot-content-cards.cjs
node scripts/test-mot-fcc-states.cjs
```

The first script checks source-note isolation, independent dates/evidence, inert source markup, Undo, keyboard close/return focus, actual Plex 600 loading, source-reading space and four viewport widths. A phone hit test checks that the action footer does not cover the title field; the note field is clicked on-screen. The second checks retained pending content, version changes without card mutations, three-request termination, offline IndexedDB copies, HTTP 304 revalidation retaining the retrieval date, the real 20-second AbortController deadline, public-source-only diagnostics, rejected wrong-city responses and distinct same-number venue identities across cities. Its registry, feed text, traveler notes and checked-fact examples are explicit synthetic fixtures. They do not establish live publication or completion of Spark's registry/CORS tasks.

The RED checks reproduced the missing source detail flow, disappearing content during refresh, a collapsed phone reading area and a phone footer covering the title field. New pure tests cover note command Undo/Redo, URL handling, immutable snapshots, changed-source identity and same-city fallback. Existing constraints and timeouts are unchanged. Offline browser evidence uses an already loaded application; cold-start hosting and the browser cache-write failure path are not covered by these scripts.

These UI implementations can be reviewed independently of the outstanding MOT-76 registry integration. MOT-80 and MOT-79 retain their dependency holds and need their assigned reviews; no Opus score, independent acceptance or Verified status is implied. The app's Muse runtime, credentials and model allowlist are unchanged. Spark builder work and MOT-94's hold are outside this change.
