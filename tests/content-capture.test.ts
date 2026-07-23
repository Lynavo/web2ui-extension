import { describe, expect, it, vi } from "vitest";
import type { InPageExtractionResult } from "../src/core/capture/in-page-extractor.js";
import type { CaptureAsset } from "../src/core/contracts/capture.js";
import {
  executeContentCapture,
  type ContentCaptureDependencies,
} from "../src/extension/content-capture.js";
import type { RunCaptureCommand } from "../src/extension/types.js";

function extraction(): InPageExtractionResult {
  return {
    root: {
      id: "n_root",
      type: "element",
      tag: "body",
      name: "body",
      bounds: { x: 0, y: 0, width: 320, height: 240 },
      opacity: 1,
      clipsContent: true,
      fills: [],
      children: [],
    },
    assetRequests: [],
    inlineAssets: [],
    fonts: [],
    warnings: [],
    pageWidth: 320,
    pageHeight: 240,
    pageBackground: { r: 1, g: 1, b: 1, a: 1 },
    nodeCount: 1,
    textNodeCount: 0,
    imageNodeCount: 0,
  };
}

function command(mode: RunCaptureCommand["mode"]): RunCaptureCommand {
  return {
    type: "run-capture",
    runId: "run_current",
    tabId: 5,
    documentId: "document_current",
    mode,
    options: {
      viewports: [{ id: "browser", label: "Browser", widthPx: null, source: "browser" }],
      themes: [{ id: "browser", label: "Browser", source: "browser" }],
    },
  };
}

function dependencies(overrides: Partial<ContentCaptureDependencies> = {}): ContentCaptureDependencies {
  let now = Date.UTC(2026, 6, 13, 0, 0, 0);
  return {
    now: () => (now += 10),
    nextCaptureId: () => "cap_local_test",
    viewport: () => ({ widthPx: 320, heightPx: 240, deviceScaleFactor: 2 }),
    safeSourceLabel: () => "fixture.invalid",
    hideConsent: () => 1,
    restoreConsent: vi.fn(),
    stabilizeFullPage: vi.fn(async () => ({ width: 320, height: 480 })),
    settlePage: vi.fn(async () => undefined),
    viewportClip: () => ({ x: 0, y: 0, width: 320, height: 240 }),
    extract: vi.fn(() => extraction()),
    resolveAssets: vi.fn(async () => ({ assets: [] as CaptureAsset[], warnings: [] })),
    resolveFallbacks: vi.fn(async () => undefined),
    cleanupMarkers: vi.fn(),
    restoreScroll: vi.fn(),
    assertActive: vi.fn(),
    reportProgress: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("executeContentCapture", () => {
  it("captures Visible Area without scrolling and emits a local CaptureDocument", async () => {
    const deps = dependencies();
    const document = await executeContentCapture(command("visible-area"), deps);

    expect(deps.stabilizeFullPage).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalledWith({
      maxNodes: 8_000,
      captureTextFallbacks: true,
      viewportClip: { x: 0, y: 0, width: 320, height: 240 },
    });
    expect(document).toMatchObject({
      captureId: "cap_local_test",
      sourceType: "chrome_capture",
      safeSourceLabel: "fixture.invalid",
      page: { widthPx: 320, heightPx: 240, fullPage: false },
      stats: { nodeCount: 1, assetByteTotal: 0 },
    });
    expect(document.warnings).toContainEqual({ code: "cookie_consent_hidden", count: 1 });
  });

  it("stabilizes Full Page before extracting the complete document", async () => {
    const deps = dependencies();
    const document = await executeContentCapture(command("full-page"), deps);

    expect(deps.stabilizeFullPage).toHaveBeenCalledOnce();
    expect(deps.extract).toHaveBeenCalledWith({
      maxNodes: 8_000,
      captureTextFallbacks: true,
      captureVirtualizedContent: true,
      capturePageSize: { width: 320, height: 480 },
    });
    expect(document.page.fullPage).toBe(true);
  });

  it("restores page state and capture markers after a failure", async () => {
    const failure = new Error("asset resolution failed");
    const deps = dependencies({
      resolveAssets: vi.fn(async () => {
        throw failure;
      }),
    });

    await expect(executeContentCapture(command("full-page"), deps)).rejects.toBe(failure);
    expect(deps.restoreConsent).toHaveBeenCalledOnce();
    expect(deps.restoreScroll).toHaveBeenCalledOnce();
    expect(deps.cleanupMarkers).toHaveBeenCalledOnce();
  });
});
