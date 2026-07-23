import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.resolve(root, process.argv[2] ?? "dist");

const allowedRuntimeDependencies = new Set(["react", "react-dom"]);
const commercialWebsiteUrl = "https://web2ui.lynavo.io/";
const commercialWebsiteLinkFiles = new Set([
  "src/extension/popup/commercial-edition.tsx",
  "dist/popup.js",
]);

const forbiddenSourcePatterns = [
  /web2ui\.lynavo\.io/iu,
  /(?:workers\.dev|r2\.dev|cloudflarestorage\.com)/iu,
  /\/api\//u,
  /@web2ui\//iu,
  /\b(?:Authorization|Bearer|deviceToken|remainingCredits|jobId|uploadSessionId)\b/u,
  /\b(?:credits?|billing|stripe)\b/iu,
  /\b(?:Sentry|PostHog|Segment|Datadog)\b/u,
  /\bBearer\s+/u,
  /\bdevice[-_ ]?token\b/iu,
  /\b(?:R2_BUCKET|WEB2UI_API_BASE)\b/u,
  /cloudflarestorage\.com/iu,
  /\bconvertCaptureToUploadableRenderPlan\b/u,
  /\bprepareFixtureUploadableRenderPlan\b/u,
  /\bUploadableRenderPlan\b/u,
  /kind\s*:\s*["'](?:object|upload)["']/u,
  /\bfigma\.(?:create|loadFontAsync|ui\.)/u,
];

const forbiddenReleasePatterns = [
  /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//iu,
  /<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\//iu,
  /\bimportScripts\s*\(\s*["'](?:https?:)?\/\//iu,
  /\bimport\s*\(\s*["'](?:https?:)?\/\//iu,
  /\b(?:eval|Function)\s*\(/u,
  /(?:\/Volumes\/|\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\)/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/u,
];

await assertRuntimeDependencies();
await assertNoServerBoundary(path.join(root, "src"));
await assertNoServerBoundary(target);
await assertManifest(target);

console.log(`Verified local-only release boundary: ${path.relative(root, target) || "."}`);

async function assertRuntimeDependencies() {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const dependencies = Object.entries(packageJson.dependencies ?? {});
  const offenders = dependencies
    .filter(
      ([name, version]) =>
        !allowedRuntimeDependencies.has(name) ||
        /^(?:file|git|https?|link|workspace):/u.test(String(version)),
    )
    .map(([name]) => name);
  if (offenders.length > 0) {
    throw new Error(`server boundary violation: unexpected runtime dependencies: ${offenders.join(", ")}`);
  }
}

async function assertNoServerBoundary(directory) {
  const files = await listFiles(directory);
  const offenders = [];
  for (const file of files) {
    if (file.endsWith(".map")) {
      offenders.push(`${path.relative(root, file)} (source map)`);
      continue;
    }
    if (!/\.(?:css|html|js|json|md|mjs|svg|ts|tsx|txt|xml)$/u.test(file)) continue;
    const contents = await readFile(file, "utf8").catch(() => "");
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (/sourceMappingURL|sourceURL|sourcesContent|webpack:\/\//u.test(contents)) {
      offenders.push(`${path.relative(root, file)} (source map metadata)`);
      continue;
    }
    const boundaryContents = stripReviewedCommercialWebsiteLink(relative, contents);
    const match = forbiddenSourcePatterns.find((pattern) => pattern.test(boundaryContents));
    const releaseMatch = forbiddenReleasePatterns.find((pattern) => pattern.test(contents));
    const popupNetworkMatch =
      relative === "dist/popup.js"
        ? /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource)\b/u.exec(contents)
        : null;
    if (match || releaseMatch || popupNetworkMatch) {
      offenders.push(
        `${path.relative(root, file)} (${(match ?? releaseMatch)?.source ?? "popup network primitive"})`,
      );
    }
  }
  if (offenders.length > 0) {
    throw new Error(`server boundary violation:\n${offenders.join("\n")}`);
  }
}

function stripReviewedCommercialWebsiteLink(relative, contents) {
  if (!commercialWebsiteLinkFiles.has(relative)) return contents;
  const occurrences = contents.split(commercialWebsiteUrl).length - 1;
  if (occurrences !== 1) return contents;
  return contents.replace(commercialWebsiteUrl, "");
}

async function assertManifest(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  const manifestInfo = await stat(manifestPath).catch(() => null);
  if (!manifestInfo?.isFile()) {
    throw new Error("server boundary violation: release target must contain a root manifest.json");
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.minimum_chrome_version !== "106") {
    throw new Error("server boundary violation: minimum Chrome version drifted");
  }
  const expectedPermissions = [
    "activeTab",
    "alarms",
    "clipboardWrite",
    "debugger",
    "scripting",
    "storage",
    "unlimitedStorage",
  ];
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)) {
    throw new Error("server boundary violation: manifest permissions drifted");
  }
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["<all_urls>"])) {
    throw new Error("server boundary violation: manifest host permissions drifted");
  }
  if (
    manifest.content_security_policy?.extension_pages !==
    "script-src 'self'; object-src 'none';"
  ) {
    throw new Error("server boundary violation: manifest CSP drifted");
  }
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (manifest.version !== packageJson.version) {
    throw new Error("server boundary violation: manifest version drifted");
  }
  for (const forbidden of [
    "content_scripts",
    "externally_connectable",
    "key",
    "oauth2",
    "update_url",
  ]) {
    if (forbidden in manifest) {
      throw new Error(`server boundary violation: forbidden manifest key: ${forbidden}`);
    }
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`server boundary violation: symbolic link: ${path.relative(root, file)}`);
    }
    if (entry.isDirectory()) files.push(...(await listFiles(file)));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
