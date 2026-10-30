# Privacy and data flows (MOT-36) — true as of this build

| Recipient | Data | Purpose | Retention |
|---|---|---|---|
| This browser: IndexedDB `mot-trip:<boardId>` | Each trip board: cards, layout, revisions | Local board work | Until the person clears browser storage (or the browser evicts it) |
| This browser: IndexedDB `writers-board-blobs` | Photo bytes, keyed by SHA-256 | Photos on cards and keepsakes | Same as above |
| This browser: localStorage `mot-boards`, `mot-last-trip`, `mot-sample:<boardId>` | Board titles, kinds and ids; which board was open; which boards are samples | The board list and reopening the last board | Same as above |
| This browser: localStorage `mot-demo-metrics-v1`, only when opted in | Totals for demo actions, no card text or guest details | Learn which demo actions get used; no live model billing in this demo | Until the checkbox is switched off or browser storage is cleared |
| FCC public publication and artwork hosting | Public city IDs and requested feed, source and image URLs; no board text | Destination tags, this city's stories and selected artwork | Publisher access-log retention is not specified by the local feed contract |
| MoT server, then its configured Muse provider, only after Ask | Board ID, request, chosen non-private cards (ID, title, text, lane, day, time), city/grounding label and FCC article text/source metadata | Produce a proposal for review; no picture files are sent, and this composer sends an empty picture-ID list | Server diagnostics omit content: process session, or at most 24 hours if the owner captures them; provider retention follows the configured account terms |

Board exports are created on request. Downloaded copies have these scopes:

- **Full backup** (Export ZIP → Full backup): every card, private ones
  included, and the original photo bytes. Meant for the person themselves.
- **Copy to share** (Export ZIP → Copy to share): no private cards, and photo
  metadata removed (JPEG Exif/XMP/IPTC and comments; PNG text, time and Exif
  chunks), so photos carry no location.
- **Postcard PNG** and the itinerary and memorabilia pages: shared cards only.

Opening Ask Muse loads the selected city's public FCC issue and checks the local
runtime status. It sends no board content or proposal request until Ask is pressed.
Private and unchosen cards, other boards, picture bytes and annotations outside
the chosen card text are excluded. The board title is excluded. Missing story text
forces a catalogue-only label; an oversized issue is refused without truncation or
a provider request. Returned changes are validated and require the person's choice.

MOT-82 tests use actual public FCC stories and a labelled provider transport
fixture. They make no live-provider claim. MOT-95 remains gated on owner-managed
server configuration and a recorded live round trip; see `MUSE-RUNTIME.md`.
Maps, printing and payments are not connected by this change. Opening Order on FCC
sends only its public city slug, with no referrer or private trip parameters.

The app loads its own files (code, fonts, sample photos, the MOT logo) from the
site that serves it. The trip screens send no analytics.

UI copy rule: never claim a revoked share link recalls a downloaded package.
Once bytes leave, they are gone; revoking stops future access only.
