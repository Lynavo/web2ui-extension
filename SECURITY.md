# Security policy

## Supported versions

Security fixes are provided for the latest published release. Development snapshots are not
supported releases.

## Security boundary

All executable code is packaged with the extension. Page DOM, text, URLs, SVG, images, and
messages are treated as untrusted input. Asset reads, capture sizes, SVG content, run identity,
local retention, and clipboard writes are constrained and covered by tests.

The project does not operate a capture service, so maintainers cannot recover a local result or
inspect it remotely. Never publish private captures, credentials, or sensitive page content in a
repository issue; use a synthetic reproduction instead.
