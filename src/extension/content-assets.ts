import {
  isSafeSvgMarkup,
  type CaptureAsset,
  type CaptureNode,
  type CaptureWarning,
  type CaptureWarningCode,
  type Paint,
} from "../core/contracts/capture.js";
import type { InPageAssetRequest } from "../core/capture/in-page-extractor.js";

export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 18 * 1024 * 1024;

export function collectAssetNodeIds(root: CaptureNode): Map<string, Set<string>> {
  const nodeIdsByAsset = new Map<string, Set<string>>();
  const register = (assetId: string, nodeId: string): void => {
    const nodeIds = nodeIdsByAsset.get(assetId) ?? new Set<string>();
    nodeIds.add(nodeId);
    nodeIdsByAsset.set(assetId, nodeIds);
  };
  const registerPaints = (nodeId: string, paints: readonly Paint[]): void => {
    for (const paint of paints) {
      if (paint.type === "image") register(paint.assetId, nodeId);
    }
  };
  const visit = (node: CaptureNode): void => {
    if ((node.type === "image" || node.type === "svg") && node.assetId !== undefined) {
      register(node.assetId, node.id);
    }
    if (node.type === "text" && node.fillClip !== undefined) {
      registerPaints(node.id, node.fillClip.fills);
    }
    if (node.type === "element") {
      registerPaints(node.id, node.fills);
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
  return nodeIdsByAsset;
}

export function buildAssetWarnings(
  code: CaptureWarningCode,
  assetId: string,
  nodeIdsByAsset: ReadonlyMap<string, ReadonlySet<string>>,
): CaptureWarning[] {
  const nodeIds = nodeIdsByAsset.get(assetId);
  if (nodeIds === undefined || nodeIds.size === 0) {
    return [{ code, count: 1, detail: assetId }];
  }
  return Array.from(nodeIds, (nodeId) => ({
    code,
    nodeId,
    count: 1,
    detail: assetId,
  }));
}

export function buildResolvedCaptureAsset(
  request: InPageAssetRequest,
  bytes: Uint8Array,
  responseContentType: string,
): CaptureAsset | null {
  if (bytes.byteLength > MAX_ASSET_BYTES) return null;

  const factualMediaType = normalizeMediaType(responseContentType);
  const isSvg = factualMediaType
    ? factualMediaType === "image/svg+xml"
    : request.kind === "svg-image";

  if (isSvg) {
    const source = new TextDecoder().decode(bytes);
    if (!isSafeSvgMarkup(source)) return null;
    const data = request.tint === undefined ? source : tintSvgMarkup(source, request.tint);
    if (data === null || !isSafeSvgMarkup(data)) return null;
    const byteSize = new TextEncoder().encode(data).byteLength;
    if (byteSize > MAX_ASSET_BYTES) return null;
    return {
      assetId: request.assetId,
      kind: "svg-image",
      data,
      mediaType: "image/svg+xml",
      byteSize,
    };
  }

  if (!factualMediaType.startsWith("image/")) return null;
  return {
    assetId: request.assetId,
    kind: "raster-image",
    data: `data:${factualMediaType};base64,${bytesToBase64(bytes)}`,
    mediaType: factualMediaType,
    byteSize: bytes.byteLength,
  };
}

export function tintSvgMarkup(svg: string, tint: string): string | null {
  if (!isSafeSvgMarkup(svg) || !isSafeTint(tint)) return null;
  let tinted = svg
    .replace(/currentColor/giu, tint)
    .replace(/fill="(?!none")[^"]*"/giu, `fill="${tint}"`)
    .replace(/fill:\s*(?!none)[^;"'}]+/giu, `fill:${tint}`);
  if (!/<svg\b[^>]*\bfill=/iu.test(tinted)) {
    tinted = tinted.replace(/<svg\b/iu, `<svg fill="${tint}"`);
  }
  return isSafeSvgMarkup(tinted) ? tinted : null;
}

export function normalizeMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isSafeTint(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/[<>&"']/u.test(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
