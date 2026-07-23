# Contributing

Thank you for improving Web2UI — Copy for Figma.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use the issue forms
before starting a large behavioral change so its product and security boundaries can be discussed.

## Development setup

Use Node.js 24 or newer and pnpm 10:

```bash
pnpm install --frozen-lockfile
pnpm validate
```

Run `pnpm package` before changing release or manifest behavior. Generated build, browser, test,
and visual artifacts must stay under `out/` and must not be committed.

The detailed contributor references are:

- [Architecture](docs/ARCHITECTURE.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Testing guide](docs/TESTING.md)
- [Release guide](docs/RELEASING.md)

## Change requirements

- Keep the product local-only and limited to Visible Area, Full Page, and Copy for Figma.
- Add a failing test before changing behavior, then run the smallest relevant test and the full
  validation command.
- Do not add accounts, hosted APIs, upload flows, remote code, telemetry, or a Figma runtime.
- Use only synthetic or explicitly redistributable fixtures. Never commit private captures,
  credentials, cookies, page text, or third-party assets without a compatible license.
- Explain any permission change in README and PRIVACY.

## License

Contributions are accepted under AGPL-3.0-only, the same license as the repository. By submitting
a contribution, you confirm that you have the right to license it on those terms.

The project uses an inbound-equals-outbound policy: a contribution does not grant permission to
reuse it under proprietary terms. Reuse in a differently licensed Web2UI edition requires the
contributor's separate permission. No contributor license agreement is implied by a pull request.

Pull requests must complete the repository template, keep each commit reviewable, update public
documentation for user-visible behavior, and pass `pnpm validate`. Maintainers may ask for a
synthetic fixture when a change affects capture fidelity or untrusted page input.
