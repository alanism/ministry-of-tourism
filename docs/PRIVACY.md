# Privacy and data flows

This describes the browser/file workflow and optional in-app model adapter in the public-source baseline `925f410`. Source and hosted versions may differ. The [owner's manual](../OWNER-MANUAL.md) explains the current copy choices; local-preview use cases state their separate maturity and data-sharing limits.

| Recipient | Data | Purpose | Retention |
|---|---|---|---|
| This browser: IndexedDB `mot-trip:<boardId>` | Each trip board: cards, layout, revisions | Local board work | Until the person clears browser storage (or the browser evicts it) |
| This browser: IndexedDB `writers-board-blobs` | Photo bytes, keyed by SHA-256 | Photos on cards and keepsakes | Same as above |
| This browser: IndexedDB `mot-export-artifacts` | Kept export bytes, scope, board revision and receipt metadata | Re-download an exported file | Until the person removes the kept export or browser storage is cleared or evicted; downloaded copies are separate |
| This browser: localStorage `mot-boards`, `mot-last-trip`, `mot-sample:<boardId>` | Board titles, kinds and ids; which board was open; which boards are samples | The board list and reopening the last board | Same as above |
| This browser: localStorage `mot-demo-metrics-v1`, only when opted in | Totals for demo actions, no card text or guest details | Learn which demo actions get used; these counters are not provider billing records | Until the checkbox is switched off or browser storage is cleared |
| FCC public publication and artwork hosting | Public city IDs and requested feed, source and image URLs; no board text | Destination tags, this city's stories and selected artwork | Publisher access-log retention is not specified by the local feed contract |
| Optional MoT model server, then its configured Muse provider, only after Ask | Board ID, request, chosen non-private cards (ID, title, text, lane, day, time), city/grounding label and FCC article text/source metadata | Produce a proposal for review; no picture files are sent, and this composer sends an empty picture-ID list | Server diagnostics omit content: process session, or at most 24 hours if the owner captures them; provider retention follows the configured account terms |

Board exports are created on request. The Export screen uses these labels for HTML, PDF and editable ZIP:

- **Review copy (includes private content):** the full selection, including private notes, votes and images. For a trusted reviewer or personal backup. A personal ZIP retains original media bytes and may retain their embedded metadata.
- **Public copy:** shared cards and their permitted images, excluding private cards, layers and their exclusive media. Under **Shared copy**, choose **Trip · guide and stay** or the narrower **Guide only** selection. The label describes the file contents; it does not publish the file automatically.
- **Photo postcard / Memory page PNG:** the inspected keepsake selector offers non-private photos; the download is a new derivative and leaves the original unchanged.

For Public ZIP exports, the metadata-stripping function removes supported embedded metadata from well-formed JPEGs (Exif/XMP/IPTC and comments) and PNGs (text, time and Exif chunks). Other formats and malformed files are not covered by that function. Removing embedded location metadata does not redact visible landmarks, street signs, faces, captions or other content that can reveal a location or identity. Review the selected content as well as its metadata before sharing.

**Use your own Muse with files** is a separate deliberate handoff. Its context includes the displayed trip title, registered city, time zone, selected non-private text, allowed public asset references, request and binding metadata. It excludes private cards, image bytes, credentials and whole-document history. You inspect the context, download it and choose whether to upload it to your assistant. Returned proposals require local review; a file grants no live board access. The assistant's processing and retention follow its own environment and terms.

The following paragraph describes the optional in-app model adapter, rather than that file handoff:

Opening Ask Muse loads the selected city's public FCC issue and checks the local
runtime status. It sends no board content or proposal request until Ask is pressed.
Private and unchosen cards, other boards, picture bytes and annotations outside
the chosen card text are excluded. The board title is excluded. Missing story text
forces a catalogue-only label; an oversized issue is refused without truncation or
a provider request. Returned changes are validated and require the person's choice.

MOT-82 tests use actual public FCC stories and a labelled provider transport fixture. They make no live-provider claim. See [Muse runtime](MUSE-RUNTIME.md) for configuration, dated live evidence and remaining production gates; a historical receipt does not establish the currently configured service's availability.

Those runtime checks do not establish unrelated routing, printing or payment services. An FCC city-shop link sends its public city slug, with no referrer or private trip parameters.

The app loads its own files (code, fonts, sample photos, the MOT logo) from the
site that serves it. The trip screens send no analytics.

UI copy rule: never claim a revoked share link recalls a downloaded package.
Once bytes leave, they are gone; revoking stops future access only.
