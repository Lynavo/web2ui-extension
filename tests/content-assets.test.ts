import { describe, expect, it } from "vitest";
import type { InPageAssetRequest } from "../src/core/capture/in-page-extractor.js";
import {
  MAX_ASSET_BYTES,
  buildAssetWarnings,
  buildResolvedCaptureAsset,
  collectAssetNodeIds,
  normalizeMediaType,
  tintSvgMarkup,
} from "../src/extension/content-assets.js";
import type { CaptureElementNode } from "../src/core/contracts/capture.js";

const svgRequest: InPageAssetRequest = {
  assetId: "asset_mask",
  kind: "svg-image",
  url: "https://fixture.invalid/icon.svg",
  tint: "#1266cc",
};

describe("content asset resolution", () => {
  it("maps shared assets to every affected capture node and scopes warnings", () => {
    const root: CaptureElementNode = {
      id: "root",
      type: "element",
      tag: "body",
      name: "body",
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      opacity: 1,
      clipsContent: false,
      fills: [{ type: "image", assetId: "shared", scaleMode: "fill" }],
      children: [
        {
          id: "image",
          type: "image",
          tag: "img",
          name: "image",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          opacity: 1,
          clipsContent: false,
          assetId: "shared",
          scaleMode: "fill",
        },
      ],
    };

    const nodeIds = collectAssetNodeIds(root);

    expect(buildAssetWarnings("asset_too_large", "shared", nodeIds)).toEqual([
      { code: "asset_too_large", nodeId: "root", count: 1, detail: "shared" },
      { code: "asset_too_large", nodeId: "image", count: 1, detail: "shared" },
    ]);
    expect(buildAssetWarnings("asset_fetch_failed", "orphan", nodeIds)).toEqual([
      { code: "asset_fetch_failed", count: 1, detail: "orphan" },
    ]);
  });

  it("treats response Content-Type as fact over a URL/request hint", () => {
    const png = Uint8Array.from([137, 80, 78, 71]);
    const asset = buildResolvedCaptureAsset(svgRequest, png, "image/png; charset=binary");

    expect(normalizeMediaType(" IMAGE/PNG; charset=binary ")).toBe("image/png");
    expect(asset).toMatchObject({
      assetId: "asset_mask",
      kind: "raster-image",
      mediaType: "image/png",
      byteSize: 4,
    });
    expect(asset?.data).toBe("data:image/png;base64,iVBORw==");
  });

  it("uses the request kind only when Content-Type is unavailable", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>');
    const asset = buildResolvedCaptureAsset(svgRequest, svg, "");

    expect(asset?.kind).toBe("svg-image");
    expect(asset?.mediaType).toBe("image/svg+xml");
  });

  it("applies measured SVG mask tint while preserving fill=none", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor"/><path fill="none"/><circle style="fill:#000;stroke:none"/></svg>';
    const tinted = tintSvgMarkup(source, "#1266cc");

    expect(tinted).toContain('<svg fill="#1266cc"');
    expect(tinted).toContain('path fill="#1266cc"');
    expect(tinted).toContain('path fill="none"');
    expect(tinted).toContain("fill:#1266cc");
  });

  it("rejects unsafe SVG and a single asset beyond 4 MiB", () => {
    const unsafe = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    expect(buildResolvedCaptureAsset(svgRequest, unsafe, "image/svg+xml")).toBeNull();

    const oversized = new Uint8Array(MAX_ASSET_BYTES + 1);
    expect(
      buildResolvedCaptureAsset(
        {
          assetId: svgRequest.assetId,
          kind: "raster-image",
          url: svgRequest.url,
        },
        oversized,
        "image/png",
      ),
    ).toBeNull();
  });
});
