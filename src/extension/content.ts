import {
  cleanupCaptureMarkersInPage,
  extractCaptureInPage,
  type InPageAssetRequest,
  type InPageExtractionResult,
} from "../core/capture/in-page-extractor.js";
import {
  hideConsentOverlaysInPage,
  restoreConsentOverlaysInPage,
} from "../core/capture/consent-overlays.js";
import {
  decodeCaptureInlineAssetData,
  isSafeSvgMarkup,
  type CaptureAsset,
  type CaptureWarning,
  type PageRect,
} from "../core/contracts/capture.js";
import { executeContentCapture, type ContentCaptureDependencies } from "./content-capture.js";
import {
  MAX_ASSET_BYTES,
  MAX_TOTAL_ASSET_BYTES,
  buildAssetWarnings,
  buildResolvedCaptureAsset,
  collectAssetNodeIds,
  normalizeMediaType,
} from "./content-assets.js";
import {
  cleanupCaptureMarkers,
  findCaptureMarker,
  localStaticSettleDelayMs,
  resolveLocalStaticScreenshotFallbacks,
  type ScreenshotFallbackNode,
} from "./content-fallbacks.js";
import {
  restorePageScroll,
  restorePageScrollToTop,
  stabilizeFullPageScroll,
} from "./content-scroll.js";
import {
  CAPTURE_MODES,
  isPopupMessage,
  type ContentMessage,
  type ElementScreenshotResponse,
  type FetchAssetResponse,
  type RunCaptureCommand,
} from "./types.js";

const CONTENT_RUNTIME_KEY = "__web2uiLocalCaptureContentV1";
const runtimeGlobal = globalThis as typeof globalThis & Record<string, unknown>;

let activeCommand: RunCaptureCommand | null = null;

if (typeof chrome !== "undefined" && runtimeGlobal[CONTENT_RUNTIME_KEY] !== true) {
  runtimeGlobal[CONTENT_RUNTIME_KEY] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRunCaptureCommand(message)) return undefined;

    activeCommand = message;
    const initialScroll = { x: window.scrollX, y: window.scrollY };
    sendResponse({ accepted: true });
    void executeContentCapture(message, createBrowserDependencies(message, initialScroll))
      .then(async (document) => {
        if (!isActive(message)) return;
        await chrome.runtime.sendMessage({
          type: "capture-done",
          runId: message.runId,
          tabId: message.tabId,
          documentId: message.documentId,
          document,
        } satisfies ContentMessage);
      })
      .catch(async () => {
        if (!isActive(message)) return;
        await chrome.runtime.sendMessage({
          type: "capture-error",
          runId: message.runId,
          tabId: message.tabId,
          documentId: message.documentId,
          code: "capture-failed",
        } satisfies ContentMessage);
      })
      .finally(() => {
        if (isActive(message)) activeCommand = null;
      });
    return undefined;
  });
}

function createBrowserDependencies(
  command: RunCaptureCommand,
  initialScroll: { x: number; y: number },
): ContentCaptureDependencies {
  return {
    now: Date.now,
    nextCaptureId: () => `cap_${crypto.randomUUID().replaceAll("-", "")}`,
    viewport: () => ({
      widthPx: Math.max(1, window.innerWidth),
      heightPx: Math.max(1, window.innerHeight),
      deviceScaleFactor: Math.max(0.1, window.devicePixelRatio || 1),
    }),
    safeSourceLabel: () => window.location.hostname || "current-page",
    hideConsent: () => hideConsentOverlaysInPage().hiddenCount,
    restoreConsent: () => {
      restoreConsentOverlaysInPage();
    },
    stabilizeFullPage,
    settlePage,
    viewportClip: () => ({
      x: initialScroll.x,
      y: initialScroll.y,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    extract: extractCaptureInPage,
    resolveAssets,
    resolveFallbacks,
    cleanupMarkers: () => {
      cleanupCaptureMarkers();
      cleanupCaptureMarkersInPage();
    },
    restoreScroll: () => restorePageScroll(initialScroll),
    assertActive: () => assertActive(command),
    reportProgress: async (_current, progress, label) => {
      await sendForRun(command, { type: "capture-progress", progress, label });
    },
  };
}

async function resolveAssets(
  extraction: InPageExtractionResult,
  command: RunCaptureCommand,
): Promise<{ assets: CaptureAsset[]; warnings: CaptureWarning[] }> {
  const assets: CaptureAsset[] = [];
  const warnings: CaptureWarning[] = [];
  const nodeIdsByAsset = collectAssetNodeIds(extraction.root);
  let totalBytes = 0;

  const addAsset = (asset: CaptureAsset): boolean => {
    if (asset.byteSize > MAX_ASSET_BYTES || totalBytes + asset.byteSize > MAX_TOTAL_ASSET_BYTES) {
      warnings.push(...buildAssetWarnings("asset_too_large", asset.assetId, nodeIdsByAsset));
      return false;
    }
    totalBytes += asset.byteSize;
    assets.push(asset);
    return true;
  };

  for (const inline of extraction.inlineAssets) {
    const sourceBytes = decodeCaptureInlineAssetData(inline.data, inline.mediaType);
    if (sourceBytes === null || sourceBytes.byteLength > MAX_ASSET_BYTES) {
      warnings.push(
        ...buildAssetWarnings(
          sourceBytes === null ? "asset_fetch_failed" : "asset_too_large",
          inline.assetId,
          nodeIdsByAsset,
        ),
      );
      continue;
    }
    const mediaType = normalizeMediaType(inline.mediaType);
    const isSvg = mediaType === "image/svg+xml" || inline.kind === "svg-inline";
    let data = inline.data;
    if (isSvg) {
      data = new TextDecoder().decode(sourceBytes);
      if (!isSafeSvgMarkup(data)) {
        warnings.push(...buildAssetWarnings("asset_fetch_failed", inline.assetId, nodeIdsByAsset));
        continue;
      }
    } else if (!mediaType.startsWith("image/") || !inline.data.startsWith("data:")) {
      warnings.push(...buildAssetWarnings("asset_fetch_failed", inline.assetId, nodeIdsByAsset));
      continue;
    }
    addAsset({
      assetId: inline.assetId,
      kind: isSvg ? (inline.kind === "svg-inline" ? "svg-inline" : "svg-image") : "raster-image",
      data,
      mediaType: isSvg ? "image/svg+xml" : mediaType,
      byteSize: sourceBytes.byteLength,
      ...(inline.naturalWidth === undefined ? {} : { naturalWidth: inline.naturalWidth }),
      ...(inline.naturalHeight === undefined ? {} : { naturalHeight: inline.naturalHeight }),
    });
  }

  const remoteResults = await mapWithConcurrency(
    extraction.assetRequests,
    6,
    async (request) => fetchRemoteAsset(request, command),
  );
  for (let index = 0; index < extraction.assetRequests.length; index += 1) {
    const request = extraction.assetRequests[index];
    const result = remoteResults[index];
    if (!request) {
      warnings.push({ code: "asset_fetch_failed", count: 1 });
      continue;
    }
    if (!result) {
      warnings.push(...buildAssetWarnings("asset_fetch_failed", request.assetId, nodeIdsByAsset));
      continue;
    }
    const asset = buildResolvedCaptureAsset(request, result.bytes, result.contentType);
    if (!asset) {
      warnings.push(...buildAssetWarnings("asset_fetch_failed", request.assetId, nodeIdsByAsset));
      continue;
    }
    addAsset(asset);
  }
  return { assets, warnings };
}

async function fetchRemoteAsset(
  request: InPageAssetRequest,
  command: RunCaptureCommand,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!isHttpUrl(request.url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(request.url, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("asset response failed");
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        contentType: response.headers.get("content-type") ?? "",
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    const response = await sendForRun<FetchAssetResponse>(command, {
      type: "fetch-asset",
      url: request.url,
    });
    if (!response.ok || response.bytes === undefined) return null;
    return {
      bytes: new Uint8Array(response.bytes),
      contentType: response.contentType ?? "",
    };
  }
}

async function resolveFallbacks(
  root: InPageExtractionResult["root"],
  assets: CaptureAsset[],
  warnings: CaptureWarning[],
  command: RunCaptureCommand,
): Promise<void> {
  const resolution = await resolveLocalStaticScreenshotFallbacks({
    root,
    assets,
    maxAssetBytes: MAX_ASSET_BYTES,
    maxTotalAssetBytes: MAX_TOTAL_ASSET_BYTES,
    capture: async (request) => {
      assertActive(command);
      return captureScreenshotFallback(request, command);
    },
  });
  warnings.push(...resolution.warnings);
}

async function captureScreenshotFallback(
  request: ScreenshotFallbackNode,
  command: RunCaptureCommand,
): Promise<string | null> {
  const element = findCaptureMarker(request.nodeId);
  if (!(element instanceof HTMLElement)) return null;
  element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  await sleep(localStaticSettleDelayMs(request.tag));
  await nextAnimationFrame();
  const clip = viewportClip(element.getBoundingClientRect());
  if (!clip) return null;

  const restoreOverlaps = request.preserveBackdrop ? () => undefined : hideOverlappingElements(element);
  try {
    return await captureElementRect(clip, command);
  } finally {
    restoreOverlaps();
  }
}

async function captureElementRect(
  rect: PageRect,
  command: RunCaptureCommand,
): Promise<string | null> {
  const response = await sendForRun<ElementScreenshotResponse>(command, {
    type: "capture-element-screenshot",
    rect,
  });
  return response.ok ? response.dataUrl ?? null : null;
}

function viewportClip(rect: DOMRect): PageRect | null {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  if (right - left < 1 || bottom - top < 1) return null;
  return {
    x: left + window.scrollX,
    y: top + window.scrollY,
    width: right - left,
    height: bottom - top,
  };
}

function hideOverlappingElements(target: HTMLElement): () => void {
  const targetRect = target.getBoundingClientRect();
  const changed: Array<{ element: HTMLElement; value: string; priority: string }> = [];
  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    if (element === target || element.contains(target) || target.contains(element)) continue;
    const rect = element.getBoundingClientRect();
    const overlaps =
      rect.left < targetRect.right &&
      rect.right > targetRect.left &&
      rect.top < targetRect.bottom &&
      rect.bottom > targetRect.top;
    if (!overlaps || rect.width < 1 || rect.height < 1) continue;
    changed.push({
      element,
      value: element.style.getPropertyValue("opacity"),
      priority: element.style.getPropertyPriority("opacity"),
    });
    element.style.setProperty("opacity", "0", "important");
  }
  return () => {
    for (const { element, value, priority } of changed) {
      if (value) element.style.setProperty("opacity", value, priority);
      else element.style.removeProperty("opacity");
    }
  };
}

async function stabilizeFullPage(): Promise<{ width: number; height: number }> {
  const capturePageSize = {
    width: Math.max(
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
      document.body.scrollWidth,
    ),
    height: Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.clientHeight,
      document.body.scrollHeight,
    ),
  };
  const result = await stabilizeFullPageScroll({
    viewportHeight: () => window.innerHeight,
    scrollHeight: () =>
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    scrollY: () => window.scrollY,
    scrollBy: (deltaY) => window.scrollBy(0, deltaY),
    scrollTo: (top) => window.scrollTo(0, top),
    wait: sleep,
  });
  capturePageSize.height = result.capturePageHeight;
  restorePageScrollToTop();
  await nextAnimationFrame();
  return capturePageSize;
}

async function settlePage(): Promise<void> {
  const fonts = document.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  const images = Promise.all(
    Array.from(document.images)
      .slice(0, 200)
      .map((image) => image.decode().catch(() => undefined)),
  );
  await Promise.race([Promise.all([fonts, images]), sleep(3_000)]);
  await nextAnimationFrame();
}

async function sendForRun<T = unknown>(
  command: RunCaptureCommand,
  payload: Omit<ContentMessage, keyof RunCaptureCommand | "document" | "code">,
): Promise<T> {
  assertActive(command);
  return chrome.runtime.sendMessage({
    ...payload,
    runId: command.runId,
    tabId: command.tabId,
    documentId: command.documentId,
  }) as Promise<T>;
}

function assertActive(command: RunCaptureCommand): void {
  if (!isActive(command)) throw new Error("Capture run is stale");
}

function isActive(command: RunCaptureCommand): boolean {
  return (
    activeCommand?.runId === command.runId &&
    activeCommand.tabId === command.tabId &&
    activeCommand.documentId === command.documentId
  );
}

function isRunCaptureCommand(value: unknown): value is RunCaptureCommand {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RunCaptureCommand>;
  return (
    candidate.type === "run-capture" &&
    typeof candidate.runId === "string" &&
    candidate.runId.length > 0 &&
    Number.isInteger(candidate.tabId) &&
    (candidate.tabId ?? -1) >= 0 &&
    typeof candidate.documentId === "string" &&
    candidate.documentId.length > 0 &&
    CAPTURE_MODES.includes(candidate.mode as RunCaptureCommand["mode"]) &&
    isPopupMessage({
      type: "start-capture",
      mode: candidate.mode,
      options: candidate.options,
    })
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await mapper(value);
    }
  });
  await Promise.all(workers);
  return results;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export {};
