# Changelog

All user-visible changes to Web2UI — Copy for Figma are recorded here.

## 0.1.0 — 2026-07-23

- Published the browser-safe capture contracts, DOM extractor, canonical conversion, and clipboard
  renderer while retaining the local-only data boundary.
- Preserved measured text lines, paint stacking, masks, fragment backgrounds, dynamic raster
  fallbacks, and viewport clipping in local Copy for Figma results.
- Reworked Full Page stabilization to revisit lazy regions, capture long narrow pages beyond the
  former 60-step limit, and stop at the initial frontier instead of chasing infinite feeds.
- Defined dynamic content as the documented `local-static-v1` profile: one current-frame sample
  per attempted fallback region, up to 12 regions, no animation convergence, and no multi-shot
  alpha recovery.

- Added local Visible Area and Full Page capture modes.
- Added a six-viewport/three-theme selector and balanced Full Page / Visible Area
  capture cards.
- Added browser-only capture-to-RenderPlan conversion and Copy for Figma clipboard output.
- Added one-result local storage with a 24-hour expiry and explicit clearing.
- Added AGPL-3.0 licensing, privacy documentation, deterministic release ZIP verification, and
  documented manual installation.
- Added scheduled deletion and fail-closed expiry for the local result after 24 hours.
