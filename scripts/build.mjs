import { build } from "esbuild";
import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const shared = {
  bundle: true,
  minify: true,
  platform: "browser",
  sourcemap: false,
  target: "es2022",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [path.join(root, "src/extension/background.ts")],
    format: "esm",
    outfile: path.join(dist, "background.js"),
  }),
  build({
    ...shared,
    entryPoints: [path.join(root, "src/extension/content.ts")],
    format: "iife",
    outfile: path.join(dist, "content.js"),
  }),
  build({
    ...shared,
    entryPoints: [path.join(root, "src/extension/popup/main.tsx")],
    format: "iife",
    outfile: path.join(dist, "popup.js"),
  }),
]);

await copyFile(path.join(root, "src/extension/popup/popup.html"), path.join(dist, "popup.html"));
await copyFile(path.join(root, "src/extension/popup/styles.css"), path.join(dist, "popup.css"));
await cp(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
await writeFile(path.join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("Built unpacked extension in dist/");
