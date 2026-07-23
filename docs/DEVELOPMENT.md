# Development guide

## Prerequisites

- Node.js 24 or newer
- pnpm 10
- Chrome or Chromium for manual extension testing

Install exactly what the lockfile declares:

```bash
pnpm install --frozen-lockfile
```

No environment variables, service accounts, API keys, databases, or hosted services are required.

## Repository map

```text
src/core/capture/       Browser-page measurement and capture helpers
src/core/contracts/     CaptureDocument and RenderPlan contracts and validators
src/core/conversion/    Pure capture conversion and clipboard rendering
src/extension/          MV3 adapters, state, storage, messaging, and popup
tests/                  Unit, policy, build, package, and real-browser tests
scripts/                Build, release verification, packaging, and SBOM tools
docs/                   Public architecture and contributor documentation
icons/                  Checked-in extension icons
dist/                   Generated unpacked extension (ignored)
out/                    Generated test and release artifacts (ignored)
```

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm build` | Rebuild the unpacked extension in `dist/`. |
| `pnpm typecheck` | Check TypeScript without emitting files. |
| `pnpm lint` | Run ESLint with zero warnings allowed. |
| `pnpm test` | Run Node policy/build tests and Vitest unit suites. |
| `pnpm e2e` | Run the real MV3 capture/copy flow in Chromium. |
| `pnpm validate` | Run build, typecheck, lint, all tests, E2E, and release verification. |
| `pnpm package` | Build and verify the distributable ZIP, checksum, and SPDX SBOM. |
| `pnpm audit` | Check installed dependencies against the package advisory database. |

To run one Vitest file:

```bash
pnpm exec vitest run tests/state-machine.test.ts
```

To run one Node test file:

```bash
node --test tests/manifest-policy.test.mjs
```

## Manual browser loop

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer mode and choose **Load unpacked**.
4. Select this repository's `dist/` directory.
5. After rebuilding, use the extension card's reload button before testing again.
6. Test on a disposable or synthetic HTTP(S) page, then inspect the service worker from the
   extension card when logs are needed.

Do not test private page content in screenshots or issue attachments. The automated E2E fixture
under `tests/e2e/fixtures/` is the preferred baseline.

## Choosing the change location

- Add a browser measurement only in `src/core/capture/` and carry it explicitly through the
  capture contract.
- Add or tighten untrusted-data validation in `src/core/contracts/` or `src/extension/types.ts`.
- Change geometry, paint, text, asset hydration, or clipboard rendering in
  `src/core/conversion/`.
- Change Chrome permissions, events, debugger behavior, storage, messaging, or popup behavior in
  `src/extension/`.
- Change packaging or release policy only with matching `*.test.mjs` coverage.

Avoid pass-through wrappers. A module should hide meaningful behavior behind a small interface,
and tests should exercise the same interface used by its callers.

## Fidelity changes

Start with a minimal synthetic reproduction. Assert the measured fact at the capture contract,
then assert the resulting conversion. Do not fix a capture defect by guessing in the conversion
module when the browser could measure the fact directly.

Useful focused suites include:

```bash
pnpm exec vitest run tests/core-capture-extractor.test.ts
pnpm exec vitest run tests/core-conversion.test.ts
pnpm exec vitest run tests/content-capture.test.ts
```

If visual evidence is needed, write it under `out/`; do not add generated screenshots to
`docs/assets/` unless they are intentionally reviewed public documentation assets.

## Permission and privacy changes

Treat any change to `manifest.json`, asset fetching, page injection, persistence, clipboard
behavior, or retention as security-sensitive. Update all of these together:

- implementation and focused tests;
- `tests/manifest-policy.test.mjs` and release-boundary checks as applicable;
- the permission table in `README.md`;
- `PRIVACY.md` and `SECURITY.md` when data handling changes;
- `CHANGELOG.md` when users are affected.

## Generated files and repository hygiene

`dist/`, `out/`, `.playwright-cli/`, dependency directories, environment files, local keys, and
extension packages are ignored. Do not create placeholder directories or commit files solely to
keep an empty directory in Git.

Before requesting review:

```bash
git status --short
pnpm validate
```

See [TESTING.md](TESTING.md) for suite ownership and [RELEASING.md](RELEASING.md) for maintainer
release steps.
