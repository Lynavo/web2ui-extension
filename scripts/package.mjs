import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { writeProductionSbom } from "./sbom.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const releaseDir = path.join(root, "out", "releases");

await import("./build.mjs");
await import("./verify-release.mjs");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const archiveName = `web2ui-extension-${packageJson.version}.zip`;
const archivePath = path.join(releaseDir, archiveName);
const fixedTimestamp = new Date("1980-01-01T00:00:00.000Z");
const entries = {};

for (const file of await listFiles(dist)) {
  const name = path.relative(dist, file).split(path.sep).join("/");
  entries[name] = [new Uint8Array(await readFile(file)), { mtime: fixedTimestamp }];
}
for (const name of ["INSTALL.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  entries[name] = [
    new Uint8Array(await readFile(path.join(root, name))),
    { mtime: fixedTimestamp },
  ];
}
entries["SOURCE_CODE.txt"] = [
  new TextEncoder().encode(sourceCodeNotice(packageJson.version)),
  { mtime: fixedTimestamp },
];

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
const archive = zipSync(entries, { level: 9 });
await writeFile(archivePath, archive);

const sha256 = createHash("sha256").update(archive).digest("hex");
await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`, "utf8");
await writeProductionSbom({
  root,
  output: path.join(releaseDir, `web2ui-extension-${packageJson.version}.spdx.json`),
});

console.log(`Packaged ${path.relative(root, archivePath)}`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

function sourceCodeNotice(version) {
  return `Web2UI Extension ${version} — Corresponding Source

The complete corresponding source for this archive is the release tag:

  https://github.com/Lynavo/web2ui/tree/v${version}

The release page, archive checksum, and source archive are published at:

  https://github.com/Lynavo/web2ui/releases/tag/v${version}

The tagged tree includes the extension and browser core source, build and verification
scripts, package.json, and pnpm-lock.yaml.

Rebuild and verify from that source tree with:

  pnpm install --frozen-lockfile
  pnpm validate
  pnpm package
`;
}
