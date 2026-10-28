# Privacy and data flows (MOT-36) — true as of this build

| Recipient | Data | Purpose | Retention |
|---|---|---|---|
| This browser: IndexedDB `mot-trip:<boardId>` | Each trip board: cards, layout, revisions | Local board work | Until the person clears browser storage (or the browser evicts it) |
| This browser: IndexedDB `writers-board-blobs` | Photo bytes, keyed by SHA-256 | Photos on cards and keepsakes | Same as above |
| This browser: localStorage `mot-boards`, `mot-last-trip`, `mot-sample:<boardId>` | Board titles, kinds and ids; which board was open; which boards are samples | The board list and reopening the last board | Same as above |
| This browser: localStorage `mot-demo-metrics-v1`, only when opted in | Totals for demo actions, no card text or guest details | Learn which demo actions get used; no live model billing in this demo | Until the checkbox is switched off or browser storage is cleared |
| Nobody else, by default | — | — | — |

Data leaves the device only when the person downloads it:

- **Full backup** (Export ZIP → Full backup): every card, private ones
  included, and the original photo bytes. Meant for the person themselves.
- **Copy to share** (Export ZIP → Copy to share): no private cards, and photo
  metadata removed (JPEG Exif/XMP/IPTC and comments; PNG text, time and Exif
  chunks), so photos carry no location.
- **Postcard PNG** and the itinerary and memorabilia pages: shared cards only.

Not live yet, so not listed as recipients: Muse (no key, not deployed, makes no
calls; when connected it receives only the cards and photos the person selects,
never a private card), FCC live data (fixture only), maps, printing, payments,
hosting. Each must be added here, with purpose and retention, in the same
change that connects it, before it receives anything.

The app loads its own files (code, fonts, sample photos, the MOT logo) from the
site that serves it. The trip screens send no analytics.

UI copy rule: never claim a revoked share link recalls a downloaded package.
Once bytes leave, they are gone; revoking stops future access only.
