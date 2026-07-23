import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);

test("builds a loadable local-only MV3 extension", async () => {
  await rm(dist, { recursive: true, force: true });

  const result = spawnSync("pnpm", ["run", "build"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const file of [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "popup.css",
  ]) {
    assert.equal(existsSync(new URL(file, dist)), true, `dist/${file} must exist`);
  }

  const manifest = JSON.parse(await readFile(new URL("manifest.json", dist), "utf8"));
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(
    manifest.content_security_policy?.extension_pages,
    "script-src 'self'; object-src 'none';",
  );
});
