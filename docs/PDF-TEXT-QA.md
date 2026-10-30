# Magazine PDF text

R7-2 adds a text layer measured from the canonical page SVG. R7-6 sets MoT's PDF producer and preserves the Unicode trip title. Visible pages still use the same lossless raster, layout, art, links and labels. Existing Writer's Board PDF callers keep their defaults.

`svgPdfTextLayer` measures rendered lines after fonts settle, including their anchor and rotation. It reads printed text nodes, never `data-flow-source` or card metadata. Hidden ancestors, transparent text and lines wholly outside the trim are excluded. The temporary measurement node is removed on completion, failure or cancellation. Audience filtering happens before this step, through the existing magazine preparation and export scope.

The PDF writer maps Unicode code points through ToUnicode, including surrogate pairs. Its self-contained Type 3 font has blank glyphs, so it cannot alter the page image or introduce a visible fallback typeface. Measured baselines, sizes, widths and turns position each line; line-level selection widths are proportional rather than the original font's individual glyph advances. Paragraph tags and a page/document structure preserve the canonical content order. This is searchable/selectable text with basic reading structure, not a claim of PDF/UA conformance, complete heading/image semantics or tested assistive-technology support. No OCR or external service is used.

The writer validates geometry and bounds text runs before assembling bytes. Unicode font banks and object allocation follow source order; no clock, artifact ID or request metadata enters the PDF. Re-export from the same imported trip remains deterministic. Artwork already containing lettering in raster pixels is not transcribed.

## Reproduce

Run `npm run check` and `npm run build --workspace=apps/web`.

With a local Vite server, set `MOT_TEST_ORIGIN`, optional `MOT_PLAYWRIGHT_MODULE`, `MOT_PYTHON` (with pypdf), optional `MOT_PDFTOPPM`, and an external `MOT_EVIDENCE_DIR`. Run:

```
node scripts/test-mot-pdf-text.cjs
```

This checks a rotated/centred two-line multilingual page, native PDF extraction, tags, metadata, repeated byte identity, cancellation, hidden/unprinted-text exclusion and explicit shared/personal export sentinels. It rasterizes the real PDF with Poppler against the canonical SVG at the unchanged 4/255 limit. Notes in the test are fictional. Browser plugin not available in the build environment; this uses sandboxed Playwright Chromium.

Then run `scripts/test-mot-composition-export.cjs bangkok` using the licensed fixture setup in `MAGAZINE-QA.md`. It checks actual edited PDF/ZIP downloads, geometry, crop, rotation, order, lock, native raster comparison and identical PDF re-export from a clean preloaded offline import. It makes no offline cold-start claim. Native extraction across the full issue and comparison of all 14 image streams against the prior build were also checked for this revision.

The regression suite starts red without a text layer, Unicode mapping, tags or MoT metadata. A separate red browser check caught text inside an opacity-zero ancestor; the extractor now excludes it. Existing thresholds, timeouts, build configuration and type constraints were unchanged. The older R6 Lisbon raster discrepancy and unrelated R7 layout findings are separate review items.

References: [Adobe's text-rendering definition](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.3.pdf), [W3C PDF7 and its distinction between actual text and complete accessibility](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF7), and [Tesseract's discussion of Unicode mapping for invisible text](https://github.com/tesseract-ocr/tesseract/blob/main/src/api/pdfrenderer.cpp).
