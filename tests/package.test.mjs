import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { unzipSync } from "fflate";

const root = new URL("../", import.meta.url);
const releaseDir = new URL("out/releases/", root);
const archive = new URL("web2ui-extension-0.1.0.zip", releaseDir);
const checksum = new URL("web2ui-extension-0.1.0.zip.sha256", releaseDir);
const sbom = new URL("web2ui-extension-0.1.0.spdx.json", releaseDir);

test("packages a verified Chrome extension ZIP with its AGPL license and checksum", async () => {
  await rm(releaseDir, { recursive: true, force: true });
  const result = spawnSync("pnpm", ["run", "package"], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(archive), true);
  assert.equal(existsSync(checksum), true);
  assert.equal(existsSync(sbom), true);

  const archiveBytes = await readFile(archive);
  const expectedHash = createHash("sha256").update(archiveBytes).digest("hex");
  assert.equal(
    (await readFile(checksum, "utf8")).trim(),
    `${expectedHash}  web2ui-extension-0.1.0.zip`,
  );

  const entries = unzipSync(new Uint8Array(archiveBytes));
  assert.deepEqual(Object.keys(entries).sort(), [
    "INSTALL.md",
    "LICENSE",
    "SOURCE_CODE.txt",
    "THIRD_PARTY_NOTICES.md",
    "background.js",
    "content.js",
    "icons/icon-128.png",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "manifest.json",
    "popup.css",
    "popup.html",
    "popup.js",
  ]);
  const sourceNotice = new TextDecoder().decode(entries["SOURCE_CODE.txt"]);
  const installGuide = new TextDecoder().decode(entries["INSTALL.md"]);
  assert.match(sourceNotice, /Web2UI Extension 0\.1\.0/u);
  assert.match(sourceNotice, /github\.com\/Lynavo\/web2ui-extension\/tree\/v0\.1\.0/iu);
  assert.match(sourceNotice, /github\.com\/Lynavo\/web2ui-extension\/releases\/tag\/v0\.1\.0/iu);
  assert.match(sourceNotice, /pnpm install --frozen-lockfile/u);
  assert.match(sourceNotice, /pnpm validate/u);
  assert.match(sourceNotice, /pnpm package/u);
  assert.match(installGuide, /chrome:\/\/extensions/u);
  assert.match(installGuide, /Load unpacked/u);
  assert.match(installGuide, /shasum -a 256 -c/u);
  assert.equal(Object.keys(entries).some((file) => file.endsWith(".map")), false);

  const spdx = JSON.parse(await readFile(sbom, "utf8"));
  assert.equal(spdx.spdxVersion, "SPDX-2.3");
  assert.equal(
    spdx.documentNamespace,
    "https://github.com/Lynavo/web2ui-extension/releases/tag/v0.1.0/sbom",
  );
  assert.deepEqual(
    spdx.packages.map(({ name }) => name).sort(),
    ["react", "react-dom", "scheduler", "web2ui-extension"],
  );
  assert.equal(
    spdx.relationships.some(
      ({ spdxElementId, relationshipType, relatedSpdxElement }) =>
        spdxElementId === "SPDXRef-Package-Web2UI" &&
        relationshipType === "DEPENDS_ON" &&
        relatedSpdxElement.includes("react-dom"),
    ),
    true,
  );
});

test("creates a deterministic release archive", async () => {
  const first = spawnSync("pnpm", ["run", "package"], { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  const firstHash = createHash("sha256").update(await readFile(archive)).digest("hex");

  const second = spawnSync("pnpm", ["run", "package"], { cwd: root, encoding: "utf8" });
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
  const secondHash = createHash("sha256").update(await readFile(archive)).digest("hex");

  assert.equal(secondHash, firstHash);
});
