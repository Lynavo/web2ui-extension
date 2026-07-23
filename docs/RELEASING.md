# Release guide

Releases are unpacked-extension ZIP archives published through GitHub Releases. This project does
not publish to the Chrome Web Store, an update server, npm, or another package registry.

## Version sources

A release version must agree in:

- `package.json`;
- `manifest.json`;
- the matching heading in `CHANGELOG.md`;
- annotated Git tag `v<version>`;
- generated archive name `web2ui-extension-<version>.zip`.

The release workflow rejects a tag that does not match the package version.

## Prepare a release

1. Review the commits intended for release.
2. Update both version files and finalize `CHANGELOG.md`.
3. Install the exact lockfile and run the complete local gate:

   ```bash
   pnpm install --frozen-lockfile
   pnpm audit
   pnpm validate
   pnpm package
   ```

4. Verify that `git status --short` contains no generated artifacts.
5. Inspect the generated ZIP, checksum, and SBOM under `out/releases/`.
6. Merge the reviewed change to protected `main`.

## Publish

Create and push an annotated tag from the reviewed `main` commit:

```bash
version="$(node --input-type=module -e \
  "import packageJson from './package.json' with { type: 'json' }; process.stdout.write(packageJson.version)")"
git tag -a "v${version}" -m "Web2UI extension v${version}"
git push origin "v${version}"
```

Replace the example version with the actual version. The tag workflow repeats validation and
packaging, creates build-provenance attestations, and publishes:

- the unpacked-extension ZIP;
- its `.sha256` checksum;
- the SPDX 2.3 JSON SBOM.

Do not create release assets manually unless recovering from a documented GitHub Actions outage;
the workflow-built artifacts are the release source of truth.

## Verify the publication

1. Confirm CI, CodeQL, and the release workflow are green for the tagged commit.
2. Confirm the GitHub Release is neither a draft nor a prerelease.
3. Download the published assets and verify the checksum.
4. Verify build provenance:

   ```bash
   version="$(node --input-type=module -e \
     "import packageJson from './package.json' with { type: 'json' }; process.stdout.write(packageJson.version)")"
   gh attestation verify "web2ui-extension-${version}.zip" \
     --repo Lynavo/web2ui
   ```

5. Extract the ZIP and load its directory through `chrome://extensions`.
6. Run a smoke capture on a synthetic page and paste the result into Figma.

If verification fails, do not replace assets under the same tag. Fix the cause, advance the
version, and publish a new release so the audit trail remains unambiguous.
