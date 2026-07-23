import assert from "node:assert/strict";
import { copyFile, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const fixtureDir = new URL("out/tests/release-boundary/", root);

function verify(target) {
  return spawnSync("node", ["scripts/verify-release.mjs", target], {
    cwd: root,
    encoding: "utf8",
  });
}

test("accepts the local-only source and extension bundle", () => {
  const build = spawnSync("pnpm", ["run", "build"], { cwd: root, encoding: "utf8" });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const result = verify("dist");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("rejects server control-plane code from a release bundle", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(
    new URL("background.js", fixtureDir),
    'fetch("https://service.invalid/api/jobs"); const bearer = "Bearer device-token";\n',
  );

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /server boundary violation/iu);
});

test("rejects a release target without a root manifest", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(new URL("background.js", fixtureDir), "export {};\n");

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /manifest/iu);
});

test("rejects source maps from a release target", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await writeFile(new URL("background.js", fixtureDir), "export {};\n");
  await writeFile(new URL("background.js.map", fixtureDir), '{"sources":["src/private.ts"]}\n');

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /source map/iu);
});

test("rejects inline source metadata from a release target", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await writeFile(
    new URL("background.js", fixtureDir),
    "export {};\n//# sourceMappingURL=data:application/json;base64,e30=\n",
  );

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /source map/iu);
});

test("rejects symbolic links from a release target", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await symlink("/etc/hosts", new URL("background.js", fixtureDir));

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /symbolic link/iu);
});

for (const [label, source] of [
  ["hosted-service origin", 'const endpoint = "https://web2ui.lynavo.io";'],
  ["worker origin", 'const endpoint = "https://capture.workers.dev";'],
  ["object-storage origin", 'const endpoint = "https://capture.r2.dev";'],
  ["authorization header", 'const headers = { Authorization: "secret" };'],
  ["account credits", "const remainingCredits = 3;"],
  ["job identity", 'const jobId = "job_1";'],
  ["upload session", 'const uploadSessionId = "upload_1";'],
  ["workspace-only package", 'import "@web2ui/contracts";'],
  ["telemetry SDK", 'const reporter = "Sentry";'],
  ["device API", 'fetch("/api/device");'],
]) {
  test(`rejects ${label} code from a release target`, async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await mkdir(fixtureDir, { recursive: true });
    await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
    await writeFile(new URL("background.js", fixtureDir), `${source}\n`);

    const result = verify("out/tests/release-boundary");
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /server boundary violation/iu);
  });
}

test("rejects remotely hosted executable code from extension HTML", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await writeFile(
    new URL("popup.html", fixtureDir),
    '<!doctype html><script src="https://cdn.invalid/popup.js"></script>\n',
  );

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /remote|server boundary violation/iu);
});

test("rejects machine paths from a release target", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await writeFile(new URL("background.js", fixtureDir), 'const source = "/Users/private/work.ts";\n');

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /machine path|server boundary violation/iu);
});

test("rejects private keys even when hidden in a text release file", async () => {
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("manifest.json", root), new URL("manifest.json", fixtureDir));
  await writeFile(
    new URL("SOURCE_CODE.txt", fixtureDir),
    "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n",
  );

  const result = verify("out/tests/release-boundary");
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /private key|server boundary violation/iu);
});
