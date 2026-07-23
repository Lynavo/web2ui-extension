import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("declares a standalone AGPL Chrome extension repository", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const license = await readFile(new URL("LICENSE", root), "utf8");

  assert.equal(packageJson.name, "web2ui-extension");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.repository?.url, "git+https://github.com/Lynavo/web2ui-extension.git");
  assert.equal(packageJson.homepage, "https://github.com/Lynavo/web2ui-extension#readme");
  assert.equal(packageJson.bugs?.url, "https://github.com/Lynavo/web2ui-extension/issues");
  assert.equal(manifest.manifest_version, 3);
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(license, /Version 3, 19 November 2007/);
  assert.ok(license.length > 30_000, "LICENSE must contain the complete AGPL-3.0 text");
  assert.match(
    license,
    /For more information on this, and how to apply and follow the GNU AGPL, see\n<https:\/\/www\.gnu\.org\/licenses\/>\./,
    "LICENSE must include the canonical final paragraph",
  );
});

test("exposes the complete local-only development lifecycle", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
    "build",
    "e2e",
    "lint",
    "package",
    "sbom",
    "test",
    "typecheck",
    "validate",
  ]);
});

test("runs Node release gates and Vitest unit suites through pnpm test", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.match(packageJson.scripts.test, /node --test --test-concurrency=1/u);
  assert.match(packageJson.scripts.test, /vitest run/u);
  assert.match(packageJson.scripts.test, /--exclude ['"]\*\*\/\*\.test\.mjs['"]/u);
});

test("keeps generated and machine-local artifacts out of Git", async () => {
  const gitignoreUrl = new URL(".gitignore", root);

  assert.equal(existsSync(gitignoreUrl), true, ".gitignore must exist");
  const ignored = await readFile(gitignoreUrl, "utf8");
  assert.match(ignored, /^\/node_modules\/$/m);
  assert.match(ignored, /^\/dist\/$/m);
  assert.match(ignored, /^\/out\/$/m);
  assert.match(ignored, /^\/.playwright-cli\/$/m);
  assert.doesNotMatch(ignored, /^\/AGENTS\.md$/m);
  assert.match(ignored, /^\.env\.\*$/m);
  assert.match(ignored, /^\*\.crx$/m);
});

test("publishes standalone agent instructions without internal plans", async () => {
  assert.equal(existsSync(new URL("AGENTS.md", root)), true, "public AGENTS.md must exist");
  const instructions = await readFile(new URL("AGENTS.md", root), "utf8");
  assert.match(instructions, /standalone, local-first Web2UI/iu);
  assert.match(instructions, /Do not add accounts, billing, hosted APIs, uploads, telemetry/iu);
  assert.equal(
    existsSync(new URL("docs/superpowers/plans/2026-07-14-popup-environment-parity.md", root)),
    false,
    "internal agent plans must not be published",
  );
  assert.equal(existsSync(new URL("store/listing.md", root)), false, "store-submission materials are out of scope");
});

test("ships the minimum public project and release documentation", () => {
  for (const file of [
    "README.md",
    "INSTALL.md",
    "PRIVACY.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "MAINTAINERS.md",
    "SUPPORT.md",
    "THIRD_PARTY_NOTICES.md",
    ".github/workflows/ci.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/dependency-review.yml",
    ".github/workflows/release.yml",
    ".github/dependabot.yml",
    ".github/CODEOWNERS",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    "docs/assets/workflow-preview.png",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPMENT.md",
    "docs/TESTING.md",
    "docs/RELEASING.md",
    "AGENTS.md",
  ]) {
    assert.equal(existsSync(new URL(file, root)), true, `${file} must exist`);
  }
});

test("runs validation and packaging in CI without publishing externally", async () => {
  const workflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");

  assert.match(workflow, /pnpm install --frozen-lockfile/u);
  assert.match(workflow, /pnpm validate/u);
  assert.match(workflow, /pnpm package/u);
  assert.match(workflow, /out\/releases/u);
  assert.doesNotMatch(workflow, /chrome[-_ ]webstore|webstore.*upload|gh release|npm publish/iu);
  const workflowFiles = [
    "ci.yml",
    "codeql.yml",
    "dependency-review.yml",
    "release.yml",
  ];
  for (const file of workflowFiles) {
    const contents = await readFile(new URL(`.github/workflows/${file}`, root), "utf8");
    for (const match of contents.matchAll(/^\s*- uses:\s+[^@\s]+@([^\s#]+)/gmu)) {
      assert.match(match[1], /^[0-9a-f]{40}$/u, `GitHub Action must be pinned: ${match[0]}`);
    }
  }
});

test("defines an attested tag-only release workflow", async () => {
  const workflow = await readFile(new URL(".github/workflows/release.yml", root), "utf8");

  assert.match(workflow, /tags:\s*\n\s*- ["']v\*["']/u);
  assert.match(workflow, /test "\$\{GITHUB_REF_NAME\}" = "v\$\{version\}"/u);
  assert.match(workflow, /pnpm validate/u);
  assert.match(workflow, /pnpm package/u);
  assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/u);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /out\/releases\/\*/u);
});

test("ships a disclosed product workflow illustration and Chrome compatibility statement", async () => {
  const workflowPreview = await readFile(new URL("docs/assets/workflow-preview.png", root));
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");

  assert.equal(workflowPreview.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(workflowPreview.readUInt32BE(16), 1600);
  assert.equal(workflowPreview.readUInt32BE(20), 900);
  assert.equal(manifest.minimum_chrome_version, "106");
  assert.match(readme, /docs\/assets\/workflow-preview\.png/u);
  assert.match(readme, /GPT Image 2-generated product illustration/u);
  assert.match(readme, /Chrome 106 or newer/iu);
});

test("declares AGPL project metadata and bundled third-party notices", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const noticesUrl = new URL("THIRD_PARTY_NOTICES.md", root);

  assert.equal(packageJson.license, "AGPL-3.0-only");
  assert.equal(existsSync(noticesUrl), true, "THIRD_PARTY_NOTICES.md must exist");
  const notices = await readFile(noticesUrl, "utf8");
  assert.match(notices, /React 19\.2\.7/);
  assert.match(notices, /React DOM 19\.2\.7/);
  assert.match(notices, /Scheduler 0\.27\.0/);
  assert.match(notices, /Copyright \(c\) Meta Platforms, Inc\. and affiliates\./);
  assert.match(notices, /Permission is hereby granted, free of charge/);
  assert.match(notices, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("keeps production dependencies browser-only and reproducible", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}).sort(), ["react", "react-dom"]);
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
      assert.doesNotMatch(name, /^@web2ui\//u);
      assert.doesNotMatch(
        String(version),
        /^(?:file|git|https?|link|workspace):/u,
        `${section}.${name} must resolve from the package registry`,
      );
    }
  }
});
