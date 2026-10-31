# Standalone magazine HTML

Export offers **HTML magazine** and the existing editable **ZIP package**.
HTML is a script-free reading copy that embeds licensed IBM Plex fonts and
metadata-free PNG representations of saved images. ZIP remains the editable
backup. Existing kept PDF files can still be downloaded; PDF generation controls
and the public trip-agent PDF entry point are retired.

`window.motTrip.exportArtifact('html')` defaults to a shared copy. The receipt
contains filename, MIME, bytes, SHA-256, board ID, revision and retention status.
`embeddedMedia` distinguishes source and embedded hashes. Ready bytes, a
download, browser retention and an observed offline reopen are different facts.

## Snapshot and media

HTML freezes the trip, selection order, source metadata, scope and media hashes
before asynchronous collection. It verifies each collected original once and
does not re-read mutable storage or refresh an apparel catalogue during export.
The Export preview uses this same saved-selection path. Choose and save an FCC
tee in Magazine to include it; unsaved catalogue previews are not silently added.

PNG, JPEG and still WebP headers are checked before decode. Images are decoded
with browser orientation handling, then encoded as PNG without the original
metadata. Source originals remain unchanged. Unsupported/malformed media and
missing bytes fail by asset, with ZIP as a recovery path. Preview and export share
one decoder slot, retained until unabortable work and cleanup actually settle.

MOT-92's credited unknown/restricted-content policy remains intact; it is an
owner product decision, not a new upstream copyright grant. FCC credit is
required. The embedded font subsets retain their complete SIL OFL notice.
`standalone-fonts.json` records glyph coverage and hashes audited from the actual
seven embedded WOFF2 faces using FontTools. A changed font stylesheet or an
unsupported glyph fails rather than silently using a system font. Regenerate
coverage from the actual `fonts/plex.ts` bytes when changing those fonts.

## Static rendering and validation

The canonical 1184 × 1680 SVG pages and the existing narrow-reader fitter are
reused. The static file contains canonical and precomputed 248-unit narrow
variants, selected by CSS; SVG text stays selectable. It embeds no application
document, scripts or remote rendering resources. Deliberate source/shop links
remain links with no-referrer/no-opener behavior.

Before the fitter mounts SVG, an element/attribute/value allowlist rejects active
content, unknown styles, stylesheet attributes, CSS escapes, external resource
URLs, unsupported image payloads and namespaces. Font CSS must match the embedded
constant. Editor-only data attributes are removed from output; local resource IDs
are namespaced per page/variant. Both variants are validated. CSP adds defense
without replacing validation.

Experimental ceilings are 10 MiB/source image, 50 MiB total source and sanitized
images, 16 MP/image, 64 MP/source collection, 128 pages and 128 MiB serialized
output. Header arithmetic is checked before decode; repeated payloads and both
page variants count toward output. These are enforced engineering bounds, not
measured physical-Safari memory guarantees. Native package limits are unchanged.

## Remaining acceptance

This is bounded MOT-119 serializer implementation, not full launch acceptance.
The existing editorial renderer still has a five-item contents summary and an
eight-stop route. HTML explicitly refuses a trip with more than eight route
candidates instead of reporting success with a silently capped route. Content
eligibility, replacement, editorial hierarchy and safe Markdown remain the
MOT-133/135 contracts; no renderer redesign is included here.

Actual physical iPhone/iPad Safari file-open, full eligible fixtures at the limits,
remaining launch evidence and deployment approval remain separate. The ordinary
unchanged regression suite runs; no PDF is generated or separately retested.
