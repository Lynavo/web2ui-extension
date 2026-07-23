# Architecture

Web2UI is a Manifest V3 browser extension with a local capture-to-clipboard pipeline. It has no
application server and no account or upload interface. This document describes the public
edition's runtime modules and the seams where untrusted data is checked.

## System flow

```text
Popup
  │ explicit capture request
  ▼
Background service worker ── injects ──► Content runtime in the active page
  │                                         │
  │ debugger emulation / bounded             │ DOM and computed-style measurement
  │ screenshot and asset adapters            ▼
  │                                    CaptureDocument
  │                                         │
  └──────── validates run/tab/document ◄─────┘
                    │
                    ▼
          Pure CaptureDocument → RenderPlan conversion
                    │
                    ▼
       IndexedDB (one plan, 25 MiB, 24-hour lifetime)
                    │
                    ▼
       Popup requests SVG/HTML/text clipboard payload
                    │
                    ▼
                  Figma paste
```

The popup never reads the page directly. The content runtime never owns durable state. The
background service worker coordinates the run, validates identities, owns privileged Chrome
operations, performs conversion, and stores the current result.

## Modules and interfaces

### Capture module

`src/core/capture/` contains page measurement and capture helpers. Its main interface is the
`CaptureDocument` contract in `src/core/contracts/capture.ts`.

`in-page-extractor.ts` runs inside the captured document and records browser facts: geometry,
computed paints, text measurements, stacking information, fonts, and asset requests. It is the
correct place to measure facts that only a browser can know. Later modules should consume those
facts rather than infer them from class names, URL suffixes, text shape, or layer names.

Consent-overlay handling, full-page scrolling, asset recovery, and single-frame raster fallbacks
are coordinated by the extension adapters. Cleanup runs in `finally` paths so capture markers,
hidden overlays, emulation, debugger attachment, and scroll position are restored on success or
failure.

The public dynamic-content behavior is `local-static-v1`. It takes at most one current-frame sample
for each attempted fallback region, attempts no more than 12 regions, and does not finish animation
timelines, perform multi-frame quality retries, recover transparent layers from a second screenshot,
or use a hosted rendering environment. Failed or deferred regions become explicit labeled
placeholders and retain the extractor's node-scoped warning.

### Contract module

`src/core/contracts/` defines two data interfaces:

- `CaptureDocument` is the measured page representation.
- `RenderPlan` is a portable, renderer-oriented representation with inline data-URL assets.

Both contracts include runtime validators. Data from a content runtime or local database is
untrusted and must pass validation before it is converted, persisted, or copied. New fields
should be optional unless a deliberate contract-version migration is implemented.

### Conversion module

`src/core/conversion/` converts a valid `CaptureDocument` into a `RenderPlan`, then renders the
plan as SVG/HTML/plain text for the clipboard. This module is intentionally pure and
browser-platform independent: it accepts data and returns data without Chrome APIs, DOM access,
network calls, or persistence.

This seam concentrates geometry, paint, text, warning, and asset-hydration rules in one
implementation. Tests call the same exported conversion interfaces used by the extension.

### Extension runtime module

`src/extension/` contains Chrome-specific adapters:

| Area | Responsibility |
| --- | --- |
| `background.ts` | Wires MV3 events, Chrome APIs, asset reads, debugger screenshots, expiry alarms, and the controller. |
| `background-controller.ts` | Coordinates capture state, privileged cleanup, validation, conversion, persistence, and clipboard preparation. |
| `content.ts` | Runs the capture implementation in the active document and reports progress/results. |
| `content-*.ts` | Separates orchestration, asset recovery, fallback capture, and scrolling behavior. |
| `plan-store.ts` | Validates and stores one bounded RenderPlan in IndexedDB. |
| `state-machine.ts` | Defines valid user-visible state transitions. |
| `types.ts` | Defines and validates popup/content message interfaces. |
| `popup/` | Presents controls and performs the final user-gesture clipboard write. |

`BackgroundController` is deliberately constructed with platform, storage, conversion, and
clipboard adapters. Unit tests replace those adapters without mocking the entire Chrome runtime.

## Runtime trust seams

### Popup to service worker

Only messages from the extension's own runtime ID are accepted. Message objects are allowlisted
by type and keys; unknown modes and malformed capture options are rejected.

### Content runtime to service worker

Every capture has a random run ID plus the Chrome tab ID and document ID. The controller accepts a
message only when all three values match the active session and Chrome's sender metadata. A
navigation, tab closure, debugger detach, stale document, or superseding run invalidates the
session.

### Page assets

The content runtime discovers assets declared by the page. The service worker adapter fetches
only HTTP(S) URLs, omits credentials and referrer data, follows bounded time and byte limits, and
returns bytes to the active capture. Inline SVG is checked before it enters a portable plan.
These reads may contact the page's own origin or CDN; they never target a Web2UI service.

### Local persistence

IndexedDB holds one record named `current`. `RenderPlanStore` validates its contract, rejects
plans larger than 25 MiB, and assigns a 24-hour expiry. The service worker also schedules a Chrome
alarm, clears expired data at startup, and clears previous data before a new capture.

### Clipboard

Clipboard preparation reads only the current validated plan. The popup performs the write after
an explicit user action, preferring SVG/HTML rich formats and falling back to plain SVG text when
Chromium does not support a MIME combination.

## Build and release boundary

`scripts/build.mjs` bundles three entry points:

- `background.js` as an ES module;
- `content.js` as an isolated IIFE;
- `popup.js` as an isolated IIFE.

It then copies static popup files, icons, and the manifest into `dist/`.

`scripts/verify-release.mjs` checks source and bundle boundaries, exact manifest permissions,
minimum Chrome compatibility, browser-only runtime dependencies, local-only code, absence of
remote executable code, source maps, secrets, symbolic links, and machine-local paths. Packaging
adds public license/install/source metadata and produces a checksum and SPDX SBOM under
`out/releases/`.

## Deliberate limits

- Chrome 106+ is the supported runtime; Firefox and Safari are outside this architecture.
- The output optimizes visual similarity and basic editable text, not full native Figma layer
  semantics.
- Canvas, video, WebGL, unsupported SVG, and browser-only effects use the bounded
  `local-static-v1` single-frame fallback profile.
- The extension captures one viewport/theme combination and stores one current result.
- There is no capture-data migration path to or runtime dependency on a hosted product. The popup
  may open the separately hosted commercial website after an explicit user click, but does not
  call its APIs or transfer capture state.

See [DEVELOPMENT.md](DEVELOPMENT.md) for change guidance and [TESTING.md](TESTING.md) for the
verification map.
