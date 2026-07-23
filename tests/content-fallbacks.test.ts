import { describe, expect, it, vi } from "vitest";
import type {
  CaptureAsset,
  CaptureElementNode,
  CaptureImageNode,
} from "../src/core/contracts/capture.js";
import {
  CAPTURE_MARKER_ATTRIBUTES,
  LOCAL_STATIC_PROFILE_ID,
  LOCAL_STATIC_SCREENSHOT_LIMIT,
  applyScreenshotFallbackAsset,
  cleanupCaptureMarkers,
  collectScreenshotFallbackNodes,
  localStaticSettleDelayMs,
  resolveLocalStaticScreenshotFallbacks,
  type ScreenshotFallbackNode,
} from "../src/extension/content-fallbacks.js";

function image(id: string, fallbackLabel: string): CaptureImageNode {
  return {
    id,
    type: "image",
    tag: "canvas",
    name: id,
    bounds: { x: 10, y: 20, width: 100, height: 60 },
    opacity: 1,
    clipsContent: false,
    assetMissing: true,
    fallbackLabel,
    scaleMode: "fill",
  };
}

function root(children: CaptureImageNode[]): CaptureElementNode {
  return {
    id: "root",
    type: "element",
    tag: "body",
    name: "body",
    bounds: { x: 0, y: 0, width: 400, height: 300 },
    opacity: 1,
    clipsContent: true,
    fills: [],
    children,
  };
}

describe("content screenshot fallbacks", () => {
  it("uses the public local-static limits without a second capture profile seam", () => {
    expect(LOCAL_STATIC_PROFILE_ID).toBe("local-static-v1");
    expect(LOCAL_STATIC_SCREENSHOT_LIMIT).toBe(12);
    expect(localStaticSettleDelayMs("canvas")).toBe(120);
    expect(localStaticSettleDelayMs("div")).toBe(60);
  });

  it("captures each attempted region once and marks over-budget regions explicitly", async () => {
    const tree = root(
      Array.from({ length: 15 }, (_, index) => image(`node-${index}`, "canvas")),
    );
    const assets: CaptureAsset[] = [];
    const capture = vi.fn<
      (request: ScreenshotFallbackNode) => Promise<string | null>
    >(async () => "data:image/png;base64,aGk=");

    const result = await resolveLocalStaticScreenshotFallbacks({
      root: tree,
      assets,
      capture,
      maxAssetBytes: 100,
      maxTotalAssetBytes: 1_000,
    });

    expect(capture).toHaveBeenCalledTimes(12);
    expect(capture.mock.calls.map(([request]) => request.nodeId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `node-${index}`),
    );
    expect(result).toMatchObject({
      attemptedCount: 12,
      appliedCount: 12,
      failures: [
        { nodeId: "node-12", reason: "deferred" },
        { nodeId: "node-13", reason: "deferred" },
        { nodeId: "node-14", reason: "deferred" },
      ],
    });
    expect(result.warnings).toEqual([
      {
        code: "dynamic_frame_unavailable",
        nodeId: "node-12",
        count: 1,
        detail: "local-static-v1 12-region limit",
      },
      {
        code: "dynamic_frame_unavailable",
        nodeId: "node-13",
        count: 1,
        detail: "local-static-v1 12-region limit",
      },
      {
        code: "dynamic_frame_unavailable",
        nodeId: "node-14",
        count: 1,
        detail: "local-static-v1 12-region limit",
      },
    ]);
    expect(assets).toHaveLength(12);
    expect(tree.children[12]).toMatchObject({
      renderFallback: true,
      fallbackLabel: "local-static-v1 12-region limit",
      rasterCapture: { status: "unavailable", sampleCount: 0 },
    });
  });

  it("marks a failed single-frame capture without retrying it", async () => {
    const tree = root([image("canvas", "canvas")]);
    const capture = vi.fn<
      (request: ScreenshotFallbackNode) => Promise<string | null>
    >(async () => null);

    const result = await resolveLocalStaticScreenshotFallbacks({
      root: tree,
      assets: [],
      capture,
      maxAssetBytes: 100,
      maxTotalAssetBytes: 100,
    });

    expect(capture).toHaveBeenCalledOnce();
    expect(result.failures).toEqual([
      { nodeId: "canvas", reason: "capture-unavailable" },
    ]);
    expect(result.warnings).toEqual([
      {
        code: "dynamic_frame_unavailable",
        nodeId: "canvas",
        count: 1,
        detail: "single-frame screenshot unavailable",
      },
    ]);
    expect(tree.children[0]).toMatchObject({
      renderFallback: true,
      fallbackLabel: "single-frame capture unavailable",
      rasterCapture: { status: "unavailable", sampleCount: 1 },
    });
  });

  it("retains asset-too-large as the failure code for an oversized screenshot", async () => {
    const tree = root([image("canvas", "canvas")]);

    const result = await resolveLocalStaticScreenshotFallbacks({
      root: tree,
      assets: [],
      capture: async () => "data:image/png;base64,aGk=",
      maxAssetBytes: 1,
      maxTotalAssetBytes: 100,
    });

    expect(result.failures).toEqual([
      { nodeId: "canvas", reason: "asset-too-large" },
    ]);
    expect(result.warnings).toEqual([
      {
        code: "asset_too_large",
        nodeId: "canvas",
        count: 1,
        detail: "single-frame screenshot exceeded the local asset budget",
      },
    ]);
  });

  it("preserves backdrop composition without multi-shot alpha recovery", () => {
    const nodes = collectScreenshotFallbackNodes(
      root([
        image("canvas", "canvas"),
        image("decorative", "decorative-effect"),
        image("backdrop", "backdrop-composite"),
        { ...image("ordinary", "image"), tag: "img" },
      ]),
    );

    expect(nodes.map(({ nodeId, preserveBackdrop }) => [nodeId, preserveBackdrop])).toEqual([
      ["canvas", false],
      ["decorative", false],
      ["backdrop", true],
      ["ordinary", false],
    ]);
  });

  it("applies a bounded PNG asset to the matching capture node", () => {
    const tree = root([image("canvas", "canvas")]);
    const assets: CaptureAsset[] = [];
    const result = applyScreenshotFallbackAsset({
      root: tree,
      assets,
      nodeId: "canvas",
      dataUrl: "data:image/png;base64,aGk=",
      maxAssetBytes: 100,
      maxTotalAssetBytes: 100,
    });

    expect(result).toMatchObject({ applied: true, byteSize: 2 });
    expect(assets).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ assetId: "shot-canvas", opacity: 1 });
    expect((tree.children[0] as CaptureImageNode).assetMissing).toBeUndefined();
  });

  it("cleans every temporary marker, including markers inside open shadow roots", () => {
    expect(CAPTURE_MARKER_ATTRIBUTES).toEqual([
      "data-h2f-shot",
      "data-h2f-backdrop-source-for",
    ]);
    const marked = { removeAttribute: vi.fn(), shadowRoot: null };
    const shadowMarked = { removeAttribute: vi.fn(), shadowRoot: null };
    const shadowRoot = {
      querySelectorAll: vi.fn((selector: string) => (selector === "*" ? [shadowMarked] : [shadowMarked])),
    };
    const host = { removeAttribute: vi.fn(), shadowRoot };
    const documentRoot = {
      querySelectorAll: vi.fn((selector: string) => (selector === "*" ? [marked, host] : [marked])),
    };

    cleanupCaptureMarkers(documentRoot as unknown as Document);

    expect(marked.removeAttribute).toHaveBeenCalledWith("data-h2f-shot");
    expect(marked.removeAttribute).toHaveBeenCalledWith("data-h2f-backdrop-source-for");
    expect(shadowMarked.removeAttribute).toHaveBeenCalledWith("data-h2f-shot");
    expect(shadowMarked.removeAttribute).toHaveBeenCalledWith("data-h2f-backdrop-source-for");
  });
});
