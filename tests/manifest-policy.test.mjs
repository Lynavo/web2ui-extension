import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the exact reviewed MV3 permissions, CSP, version, and icon set", async () => {
  const build = spawnSync("pnpm", ["run", "build"], { cwd: root, encoding: "utf8" });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("dist/manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, "106");
  assert.equal(manifest.version, packageJson.version);
  assert.match(manifest.version, /^\d+(?:\.\d+){0,3}$/u);
  assert.deepEqual(manifest.permissions, [
    "activeTab",
    "alarms",
    "clipboardWrite",
    "debugger",
    "scripting",
    "storage",
    "unlimitedStorage",
  ]);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(
    manifest.content_security_policy?.extension_pages,
    "script-src 'self'; object-src 'none';",
  );
  for (const forbidden of [
    "content_scripts",
    "externally_connectable",
    "key",
    "oauth2",
    "update_url",
  ]) {
    assert.equal(forbidden in manifest, false, `${forbidden} must not be declared`);
  }

  assert.deepEqual(Object.keys(manifest.icons ?? {}).sort(), ["128", "16", "32", "48"]);
  assert.deepEqual(Object.keys(manifest.action?.default_icon ?? {}).sort(), ["128", "16", "32"]);
  for (const size of [16, 32, 48, 128]) {
    const relative = manifest.icons?.[String(size)];
    assert.equal(typeof relative, "string");
    const iconUrl = new URL(`dist/${relative}`, root);
    assert.equal(existsSync(iconUrl), true, `${relative} must exist in dist`);
    const bytes = await readFile(iconUrl);
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test("documents every extension permission without drift", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");
  const privacy = await readFile(new URL("PRIVACY.md", root), "utf8");
  const documentation = `${readme}\n${privacy}`;

  assert.match(readme, /Chrome 106 or newer/iu);

  for (const permission of manifest.permissions) {
    assert.match(documentation, new RegExp("`" + permission + "`", "u"), `${permission} must be documented`);
  }
  for (const permission of manifest.host_permissions) {
    assert.match(documentation, new RegExp(permission.replaceAll("*", "\\*"), "u"));
  }
  assert.match(documentation, /alarm[\s\S]*24-hour|24-hour[\s\S]*alarm/iu);
  assert.match(documentation, /current page|CDN|asset/iu);
});

test("keeps popup resources packaged and executable code local", async () => {
  const html = await readFile(new URL("src/extension/popup/popup.html", root), "utf8");

  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["'](?:https?:)?\/\//iu);
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/iu);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=["'](?:https?:)?\/\//iu);
});
