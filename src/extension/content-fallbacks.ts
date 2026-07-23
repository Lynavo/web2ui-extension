import type {
  CaptureAsset,
  CaptureImageNode,
  CaptureNode,
  CaptureWarning,
  PageRect,
} from "../core/contracts/capture.js";

export const CAPTURE_MARKER_ATTRIBUTES = [
  "data-h2f-shot",
  "data-h2f-backdrop-source-for",
] as const;

export interface ScreenshotFallbackNode {
  nodeId: string;
  rect: PageRect;
  tag: string;
  preserveBackdrop: boolean;
}

export const LOCAL_STATIC_PROFILE_ID = "local-static-v1";
export const LOCAL_STATIC_SCREENSHOT_LIMIT = 12;

export function localStaticSettleDelayMs(tag: string): number {
  return tag === "canvas" ? 120 : 60;
}

export type ApplyScreenshotFallbackResult =
  | { applied: true; byteSize: number; assetId: string }
  | { applied: false; reason: "node-missing" | "invalid-data" | "asset-too-large" };

export type LocalStaticFallbackFailureReason =
  | Exclude<ApplyScreenshotFallbackResult, { applied: true }>["reason"]
  | "capture-unavailable"
  | "deferred";

export interface LocalStaticFallbackFailure {
  nodeId: string;
  reason: LocalStaticFallbackFailureReason;
}

export interface LocalStaticFallbackResolution {
  attemptedCount: number;
  appliedCount: number;
  failures: LocalStaticFallbackFailure[];
  warnings: CaptureWarning[];
}

export function collectScreenshotFallbackNodes(root: CaptureNode): ScreenshotFallbackNode[] {
  const nodes: ScreenshotFallbackNode[] = [];
  walkCaptureNodes(root, (node) => {
    if (node.type !== "image" || node.assetMissing !== true) return;
    nodes.push({
      nodeId: node.id,
      rect: node.bounds,
      tag: node.tag,
      preserveBackdrop: node.fallbackLabel === "backdrop-composite",
    });
  });
  return nodes;
}

export async function resolveLocalStaticScreenshotFallbacks(options: {
  root: CaptureNode;
  assets: CaptureAsset[];
  capture: (request: ScreenshotFallbackNode) => Promise<string | null>;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
}): Promise<LocalStaticFallbackResolution> {
  const requests = collectScreenshotFallbackNodes(options.root);
  const attempts = requests.slice(0, LOCAL_STATIC_SCREENSHOT_LIMIT);
  const deferred = requests.slice(LOCAL_STATIC_SCREENSHOT_LIMIT);
  const failures: LocalStaticFallbackFailure[] = [];
  let appliedCount = 0;

  for (const request of attempts) {
    const dataUrl = await options.capture(request);
    if (dataUrl === null) {
      markFallbackUnavailable(
        options.root,
        request.nodeId,
        "single-frame capture unavailable",
        1,
      );
      failures.push({ nodeId: request.nodeId, reason: "capture-unavailable" });
      continue;
    }
    const result = applyScreenshotFallbackAsset({
      root: options.root,
      assets: options.assets,
      nodeId: request.nodeId,
      dataUrl,
      maxAssetBytes: options.maxAssetBytes,
      maxTotalAssetBytes: options.maxTotalAssetBytes,
    });
    if (result.applied) {
      appliedCount += 1;
      continue;
    }
    markFallbackUnavailable(
      options.root,
      request.nodeId,
      `single-frame capture ${result.reason}`,
      1,
    );
    failures.push({ nodeId: request.nodeId, reason: result.reason });
  }

  for (const request of deferred) {
    markFallbackUnavailable(
      options.root,
      request.nodeId,
      `${LOCAL_STATIC_PROFILE_ID} ${LOCAL_STATIC_SCREENSHOT_LIMIT}-region limit`,
      0,
    );
    failures.push({ nodeId: request.nodeId, reason: "deferred" });
  }

  return {
    attemptedCount: attempts.length,
    appliedCount,
    failures,
    warnings: failures.map((failure) => ({
      code:
        failure.reason === "asset-too-large"
          ? "asset_too_large"
          : "dynamic_frame_unavailable",
      nodeId: failure.nodeId,
      count: 1,
      detail: localStaticFailureDetail(failure.reason),
    })),
  };
}

function localStaticFailureDetail(reason: LocalStaticFallbackFailureReason): string {
  switch (reason) {
    case "asset-too-large":
      return "single-frame screenshot exceeded the local asset budget";
    case "deferred":
      return `${LOCAL_STATIC_PROFILE_ID} ${LOCAL_STATIC_SCREENSHOT_LIMIT}-region limit`;
    case "capture-unavailable":
      return "single-frame screenshot unavailable";
    case "invalid-data":
      return "single-frame screenshot returned invalid PNG data";
    case "node-missing":
      return "single-frame screenshot target disappeared";
  }
}

export function applyScreenshotFallbackAsset(options: {
  root: CaptureNode;
  assets: CaptureAsset[];
  nodeId: string;
  dataUrl: string;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
}): ApplyScreenshotFallbackResult {
  const node = findImageNode(options.root, options.nodeId);
  if (!node) return { applied: false, reason: "node-missing" };

  const byteSize = estimateDataUriBytes(options.dataUrl);
  if (byteSize <= 0 || !options.dataUrl.startsWith("data:image/png;base64,")) {
    return { applied: false, reason: "invalid-data" };
  }
  const currentTotal = options.assets.reduce((total, asset) => total + asset.byteSize, 0);
  if (
    byteSize > options.maxAssetBytes ||
    currentTotal + byteSize > options.maxTotalAssetBytes
  ) {
    return { applied: false, reason: "asset-too-large" };
  }

  const assetId = `shot-${options.nodeId}`;
  options.assets.push({
    assetId,
    kind: "raster-image",
    data: options.dataUrl,
    mediaType: "image/png",
    byteSize,
    safeSourceLabel: `screenshot-fallback:${node.tag}`,
  });
  node.assetId = assetId;
  delete node.assetMissing;
  delete node.renderFallback;
  delete node.fallbackLabel;
  node.opacity = 1;
  return { applied: true, byteSize, assetId };
}

function markFallbackUnavailable(
  root: CaptureNode,
  nodeId: string,
  label: string,
  sampleCount: number,
): void {
  const node = findImageNode(root, nodeId);
  if (node === null) return;
  node.renderFallback = true;
  node.fallbackLabel = label;
  node.rasterCapture = {
    status: "unavailable",
    sampleCount,
  };
}

export function cleanupCaptureMarkers(root: Document | ShadowRoot = document): void {
  for (const attribute of CAPTURE_MARKER_ATTRIBUTES) {
    root.querySelectorAll(`[${attribute}]`).forEach((element) => {
      element.removeAttribute(attribute);
    });
  }
  root.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) cleanupCaptureMarkers(element.shadowRoot);
  });
}

export function findCaptureMarker(
  nodeId: string,
  root: Document | ShadowRoot = document,
): Element | null {
  const direct = root.querySelector(`[data-h2f-shot="${cssEscape(nodeId)}"]`);
  if (direct) return direct;
  for (const element of root.querySelectorAll("*")) {
    if (!element.shadowRoot) continue;
    const nested = findCaptureMarker(nodeId, element.shadowRoot);
    if (nested) return nested;
  }
  return null;
}

export function estimateDataUriBytes(data: string): number {
  if (!data.startsWith("data:")) return new TextEncoder().encode(data).byteLength;
  const commaIndex = data.indexOf(",");
  if (commaIndex < 0) return 0;
  const metadata = data.slice(0, commaIndex);
  const payload = data.slice(commaIndex + 1);
  if (!metadata.toLowerCase().includes(";base64")) {
    try {
      return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
    } catch {
      return 0;
    }
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function walkCaptureNodes(node: CaptureNode, visitor: (node: CaptureNode) => void): void {
  visitor(node);
  if (node.type !== "element") return;
  for (const child of node.children) walkCaptureNodes(child, visitor);
}

function findImageNode(root: CaptureNode, nodeId: string): CaptureImageNode | null {
  let found: CaptureImageNode | null = null;
  walkCaptureNodes(root, (node) => {
    if (!found && node.type === "image" && node.id === nodeId) found = node;
  });
  return found;
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
