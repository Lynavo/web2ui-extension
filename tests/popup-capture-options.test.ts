import { describe, expect, it } from "vitest";
import {
  THEME_OPTIONS,
  VIEWPORT_OPTIONS,
  buildCaptureOptions,
  formatThemeChip,
  formatViewportChip,
} from "../src/extension/popup/capture-options.js";

describe("popup capture options", () => {
  it("offers the complete viewport and theme presets", () => {
    expect(VIEWPORT_OPTIONS.map(({ id }) => id)).toEqual([
      "browser",
      "1920",
      "1440",
      "1024",
      "768",
      "390",
    ]);
    expect(THEME_OPTIONS.map(({ id }) => id)).toEqual(["browser", "light", "dark"]);
  });

  it("builds one preset viewport and one forced theme", () => {
    expect(buildCaptureOptions("390", "dark")).toEqual({
      viewports: [{ id: "390", label: "390 px", widthPx: 390, source: "preset" }],
      themes: [{ id: "dark", label: "Dark", source: "forced" }],
    });
  });

  it("formats Browser with the measured width and falls back safely", () => {
    expect(formatViewportChip("browser", 1366)).toBe("1366px");
    expect(formatViewportChip("browser", null)).toBe("Browser");
    expect(formatThemeChip("dark")).toBe("DARK");
  });
});
