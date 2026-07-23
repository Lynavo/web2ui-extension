import { readFile } from "node:fs/promises";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CaptureAsset,
  CaptureDocument,
  CaptureInlineAsset,
} from "../src/core/contracts/capture";
import {
  CAPTURE_CONTRACT_VERSION,
  isCaptureDocument,
  isSafeSvgMarkup,
} from "../src/core/contracts/capture";
import type {
  CaptureOptions,
  CaptureTheme,
  CaptureThemePreference,
  CaptureViewportPreference,
} from "../src/core/contracts/capture-options";
import {
  isRenderPlan,
  RENDER_PLAN_CONTRACT_VERSION,
  type RenderPlan,
  type RenderPlanAssetRef,
} from "../src/core/contracts/render-plan";

function makeCapture(): CaptureDocument {
  return {
    schemaVersion: CAPTURE_CONTRACT_VERSION,
    captureId: "cap_local",
    sourceType: "chrome_capture",
    capturedAt: "2026-07-13T00:00:00.000Z",
    safeSourceLabel: "example.test",
    viewport: { widthPx: 1280, heightPx: 720, deviceScaleFactor: 1 },
    page: { widthPx: 1280, heightPx: 720, fullPage: false },
    pageBackground: { r: 1, g: 1, b: 1, a: 1 },
    root: {
      id: "n_root",
      type: "element",
      tag: "body",
      name: "Body",
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      opacity: 1,
      clipsContent: false,
      fills: [],
      children: [],
    },
    assets: [],
    fonts: [],
    warnings: [],
    stats: {
      nodeCount: 1,
      textNodeCount: 0,
      imageNodeCount: 0,
      assetByteTotal: 0,
      captureDurationMs: 1,
    },
  };
}

function makeRenderPlan(): RenderPlan {
  return {
    schemaVersion: RENDER_PLAN_CONTRACT_VERSION,
    renderPlanId: "rp_local",
    sourceCaptureId: "cap_local",
    sourceType: "chrome_capture",
    createdAt: "2026-07-13T00:00:00.000Z",
    safeSourceLabel: "example.test",
    page: {
      widthPx: 1280,
      heightPx: 720,
      background: { r: 1, g: 1, b: 1, a: 1 },
    },
    root: {
      id: "rp_root",
      name: "Body",
      type: "FRAME",
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      opacity: 1,
      fills: [],
      strokes: [],
      strokeWeight: 0,
      strokeAlign: "INSIDE",
      effects: [],
      clipsContent: true,
      children: [],
    },
    assets: [],
    fonts: [],
    warnings: [],
    stats: {
      nodeCount: 1,
      textNodeCount: 0,
      assetCount: 0,
      conversionDurationMs: 1,
    },
  };
}

describe("local-only capture contract", () => {
  it("only identifies Chrome captures", () => {
    expectTypeOf<CaptureDocument["sourceType"]>().toEqualTypeOf<"chrome_capture">();
    expect(isCaptureDocument(makeCapture())).toBe(true);
    expect(isCaptureDocument({ ...makeCapture(), sourceType: "url" })).toBe(false);
  });

  it("only accepts inline asset data", () => {
    expectTypeOf<CaptureAsset>().toEqualTypeOf<CaptureInlineAsset>();

    const inlineAsset: CaptureAsset = {
      assetId: "asset_inline",
      kind: "raster-image",
      mediaType: "image/png",
      byteSize: 1,
      data: "data:image/png;base64,AA==",
    };
    expect(isCaptureDocument({ ...makeCapture(), assets: [inlineAsset] })).toBe(true);

    expect(
      isCaptureDocument({
        ...makeCapture(),
        assets: [
          {
            assetId: "asset_remote",
            kind: "raster-image",
            mediaType: "image/png",
            byteSize: 1,
            ref: { kind: "object", pathname: "captures/asset.png" },
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("local-only render-plan contract", () => {
  it("does not embed Figma Plugin API calls in the standalone contract", async () => {
    const source = await readFile(
      new URL("../src/core/contracts/render-plan.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/\bfigma\.(?:create|loadFontAsync|ui\.)/u);
  });

  it("does not expose remote or uploaded asset references", () => {
    expectTypeOf<RenderPlanAssetRef>().toEqualTypeOf<
      | { kind: "capture"; assetId: string }
      | { kind: "url"; url: `data:${string}` }
    >();

    const plan = makeRenderPlan();
    const withAssetRef = (ref: unknown) => ({
      ...plan,
      assets: [{ assetId: "asset_1", mediaType: "image/png", ref }],
    });

    expect(isRenderPlan(withAssetRef({ kind: "capture", assetId: "asset_1" }))).toBe(true);
    expect(isRenderPlan(withAssetRef({ kind: "url", url: "data:image/png;base64,AA==" }))).toBe(true);
    expect(isRenderPlan(withAssetRef({ kind: "url", url: "https://example.test/a.png" }))).toBe(false);
    expect(isRenderPlan(withAssetRef({ kind: "url", url: "file:///tmp/a.png" }))).toBe(false);
    expect(isRenderPlan(withAssetRef({ kind: "object", pathname: "captures/a.png" }))).toBe(false);
    expect(isRenderPlan(withAssetRef({ kind: "upload", field: "asset:a" }))).toBe(false);
  });

  it("rejects unsafe inline SVG markup", () => {
    expect(isSafeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>')).toBe(true);
    expect(isSafeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBe(false);

    const safePlan = makeRenderPlan();
    safePlan.root.children.push({
      id: "rp_svg",
      name: "Icon",
      type: "SVG",
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      opacity: 1,
      svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
    });
    expect(isRenderPlan(safePlan)).toBe(true);

    const unsafePlan = structuredClone(safePlan);
    const svgNode = unsafePlan.root.children[0];
    if (svgNode?.type !== "SVG") throw new Error("expected SVG fixture node");
    svgNode.svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect(isRenderPlan(unsafePlan)).toBe(false);
  });

  it("keeps the runtime guard exported for local conversion boundaries", () => {
    expectTypeOf(isRenderPlan).toBeFunction();
    expectTypeOf<RenderPlan>().toBeObject();
  });
});

describe("standalone capture options", () => {
  it("contains only the confirmed viewport and theme preferences", () => {
    expectTypeOf<CaptureTheme>().toEqualTypeOf<"browser" | "light" | "dark">();
    expectTypeOf<CaptureViewportPreference>().toEqualTypeOf<{
      id: string;
      label: string;
      widthPx: number | null;
      source: "browser" | "preset";
    }>();
    expectTypeOf<CaptureThemePreference>().toEqualTypeOf<{
      id: CaptureTheme;
      label: string;
      source: "browser" | "forced";
    }>();
    expectTypeOf<CaptureOptions>().toEqualTypeOf<{
      viewports: CaptureViewportPreference[];
      themes: CaptureThemePreference[];
    }>();
  });
});
