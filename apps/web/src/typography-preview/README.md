# Local typography A/B/C comparison

From the repository root, run `npm run dev --workspace apps/web -- --host 127.0.0.1 --port 4186`.
Open `http://127.0.0.1:4186/typography-preview.html` and use the switcher:

- `?typography=a`: current IBM Plex typography.
- `?typography=b`: Zilla Slab headings; Nunito body text and controls.
- `?typography=c`: Nunito headings; Zilla Slab body text and controls.

Switching changes CSS and the shareable URL without reloading or modifying the active trip. All variants retain the same sizes, weights, spacing, colors, imagery and utility monospace labels. The test covers live app text; outlined carousel artwork and rendered/exported magazine pages retain their original type. This is a local visual comparison, with no traffic assignment or conversion experiment.

The preview has its own HTML entry. The normal app entry and default production build do not import it. No production deployment is part of this comparison.

Nunito and Zilla Slab are self-hosted WOFF2 files from the official Google Fonts CSS API. Latin and extended Latin subsets cover the requested preview; other scripts use the existing fallback stack. Full original font licenses and a source/hash manifest are retained in this directory. Both families use the SIL Open Font License 1.1:

- https://github.com/google/fonts/tree/main/ofl/nunito
- https://github.com/google/fonts/tree/main/ofl/zillaslab

## Validation, 4 November 2026

All three variants pass Chromium checks at 320, 390, 768 and 1440 pixels: actual rendered font families, no page/console errors, landing actions, carousel state, trip-state preservation during switching, navigation, save/reload and ZIP export. The preview toolbar's initial collision with fixed app controls was reproduced and corrected by giving the preview app its own containing block. The same overlap check now passes at every tested width.

Type checks and the default production build pass. The production index hash remains identical to release `a3c8123`; the preview and new fonts are excluded. The required `npm run check` reports 1,503 passed and the same four pre-existing video assertions failed, taking 62.70 seconds and missing the 60-second target. An earlier concurrent build/browser run additionally hit three existing five-second test timeouts; those did not recur when the suite ran alone. No existing assertions, configuration, deadlines or weights were changed. Revisit runner contention and the timing boundary on 4 May 2027; no automatic task was scheduled.
