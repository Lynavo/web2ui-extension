# Maintainer guide

The current code owners are declared in `.github/CODEOWNERS`. Maintainers review scope, licensing,
security boundaries, compatibility, and release readiness.

## Merge requirements

- At least one code-owner approval.
- Required CI, dependency review, and CodeQL checks pass.
- User-visible behavior, permissions, privacy statements, and release boundaries remain aligned.
- Contributions use AGPL-3.0-only unless separate permission is recorded outside the repository.

## Release requirements

Follow [docs/RELEASING.md](docs/RELEASING.md). Its version alignment, local validation, annotated
tag, workflow-built artifacts, checksum, provenance, and manual smoke checks are release
requirements.

After the repository migration, protect `main`, require the validation/security checks, enable
Dependabot alerts and updates, secret scanning with push protection, private vulnerability
reporting, and automatic deletion of merged branches. Unused wiki and project features should stay
disabled.
