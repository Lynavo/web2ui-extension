# Install Web2UI from a release package

Web2UI is distributed directly as an unpacked Chrome/Chromium extension.

Chrome 106 or newer is required.

## Download and verify

Download both files for the same version from
[GitHub Releases](https://github.com/Lynavo/web2ui-extension/releases):

- `web2ui-extension-<version>.zip`
- `web2ui-extension-<version>.zip.sha256`

On macOS or Linux, verify the archive from the directory containing both files:

```bash
shasum -a 256 -c web2ui-extension-<version>.zip.sha256
```

The command must report `OK`. Do not install an archive whose checksum does not match.

## Load the extension

1. Extract the ZIP into a permanent local directory.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted directory containing `manifest.json`.

Keep that directory in place while the extension is installed. To update, verify and extract the
new release, replace the old directory, then select **Reload** for Web2UI on
`chrome://extensions`.

## Build the same package from source

The matching source is tagged `v<version>` in the repository. With Node.js 24 and pnpm 10:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm package
```

The ZIP and checksum are written to `out/releases/`.
