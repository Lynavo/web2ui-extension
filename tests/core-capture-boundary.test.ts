import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const captureSourceDirectory = path.resolve("src/core/capture");

describe("browser-safe capture core boundary", () => {
  it("contains no server boundary or Playwright runtime imports", async () => {
    const names = (await readdir(captureSourceDirectory))
      .filter((name) => name.endsWith(".ts"))
      .sort();
    expect(names.length).toBeGreaterThan(0);

    const source = (
      await Promise.all(
        names.map((name) => readFile(path.join(captureSourceDirectory, name), "utf8")),
      )
    ).join("\n");

    expect(source).not.toMatch(/from\s+["'][^"']*playwright[^"']*["']/u);
    expect(source).not.toMatch(/@web2ui\//u);
    expect(source).not.toContain(["root", "Selector"].join(""));
    expect(source).not.toMatch(/(?:server|worker|plugin|upload)[-/](?:client|runtime|api)/iu);
  });
});
