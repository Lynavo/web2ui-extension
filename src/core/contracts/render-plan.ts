/**
 * render-plan — High-fidelity Figma render plan contract.
 *
 * Produced by packages/conversion from a CaptureDocument, consumed by the
 * Figma plugin node builder. Shapes mirror the Figma Plugin API closely so
 * the plugin stays a thin executor: fills/strokes/effects/cornerRadius map
 * 1:1 onto Figma node properties.
 *
 * Geometry: x/y are RELATIVE TO THE PARENT node (Figma convention), unlike
 * capture which uses absolute page coordinates.
 */

import {
  isCaptureWarningCode,
  isSafeSvgMarkup,
  type CaptureWarning,
  type RgbaColor,
} from "./capture.js";

export const RENDER_PLAN_CONTRACT_VERSION = "render-plan" as const;

/**
 * Render-plan data URLs remain inline only when their serialized UTF-8 byte
 * length is strictly below this threshold. Assets at or above the threshold
 * must use an upload/object reference and are served through a capability URL.
 */
export const RENDER_PLAN_INLINE_ASSET_ENCODED_BYTE_THRESHOLD = 128 * 1024;

export type RenderPlanContractVersion = typeof RENDER_PLAN_CONTRACT_VERSION;

// ---------------------------------------------------------------------------
// Paint / effect shapes (Figma-aligned)
// ---------------------------------------------------------------------------

export interface FigmaSolidPaint {
  type: "SOLID";
  color: { r: number; g: number; b: number };
  opacity: number;
}

export interface FigmaGradientStop {
  position: number;
  color: RgbaColor;
}

/**
 * Gradient transform is a 2x3 affine matrix in Figma's normalized space,
 * precomputed by the conversion engine so the plugin never does math.
 */
export type FigmaGradientTransform = [
  [number, number, number],
  [number, number, number],
];

export interface FigmaGradientPaint {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR";
  gradientStops: FigmaGradientStop[];
  gradientTransform: FigmaGradientTransform;
  opacity: number;
}

export interface FigmaImagePaint {
  type: "IMAGE";
  /** Reference into RenderPlan.assets. */
  assetId: string;
  scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
  /**
   * TILE only: tile size / natural image size, derived from the measured
   * background-size fact (capture ImagePaint.tileSizePx). Omitted → 1.
   */
  scalingFactor?: number;
  opacity: number;
}

export type FigmaPaint = FigmaSolidPaint | FigmaGradientPaint | FigmaImagePaint;

export interface FigmaDropShadowEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: RgbaColor;
  offset: { x: number; y: number };
  radius: number;
  spread: number;
  visible: true;
  blendMode: "NORMAL";
}

export interface FigmaBlurEffect {
  type: "LAYER_BLUR" | "BACKGROUND_BLUR";
  radius: number;
  visible: true;
}

export type FigmaEffect = FigmaDropShadowEffect | FigmaBlurEffect;

// ---------------------------------------------------------------------------
// Auto Layout
// ---------------------------------------------------------------------------

export interface RenderPlanAutoLayout {
  layoutMode: "HORIZONTAL" | "VERTICAL";
  itemSpacing: number;
  counterAxisSpacing?: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  primaryAxisAlignItems: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems: "MIN" | "CENTER" | "MAX";
  layoutWrap?: "NO_WRAP" | "WRAP";
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** Figma layer blend modes we can map from CSS mix-blend-mode. */
export type FigmaBlendMode =
  | "NORMAL"
  | "MULTIPLY"
  | "SCREEN"
  | "OVERLAY"
  | "DARKEN"
  | "LIGHTEN"
  | "COLOR_DODGE"
  | "COLOR_BURN"
  | "HARD_LIGHT"
  | "SOFT_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

export interface RenderPlanNodeBase {
  /** Stable id unique within the plan, e.g. "rp_000042". */
  id: string;
  /** Source capture node id for traceability. */
  sourceNodeId?: string;
  name: string;
  /** Position relative to parent. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotationDegrees?: number;
  visible?: boolean;
  /** Layer blend mode from CSS mix-blend-mode; omitted means NORMAL. */
  blendMode?: FigmaBlendMode;
}

export interface RenderPlanFrameNode extends RenderPlanNodeBase {
  type: "FRAME";
  fills: FigmaPaint[];
  strokes: FigmaPaint[];
  strokeWeight: number;
  /** Per-side stroke weights when non-uniform. */
  strokeWeights?: { top: number; right: number; bottom: number; left: number };
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER";
  cornerRadius?: number;
  cornerRadii?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  effects: FigmaEffect[];
  clipsContent: boolean;
  autoLayout?: RenderPlanAutoLayout;
  children: RenderPlanNode[];
}

export interface RenderPlanTextSegment {
  /** Character range [start, end) this segment styles. */
  start: number;
  end: number;
  fontFamily: string;
  fontStyle: string;
  fontSizePx: number;
  color: RgbaColor;
  letterSpacingPx: number;
  textDecoration: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
}

export interface RenderPlanTextNode extends RenderPlanNodeBase {
  type: "TEXT";
  characters: string;
  fontFamily: string;
  /** Figma style name, e.g. "Regular", "Bold", "Semi Bold Italic". */
  fontStyle: string;
  fontSizePx: number;
  lineHeightPx: number;
  letterSpacingPx: number;
  fills: FigmaPaint[];
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textDecoration: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  textCase: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";
  textAutoResize: "NONE" | "HEIGHT" | "WIDTH_AND_HEIGHT";
  /** Mixed inline styles; empty when the node is uniformly styled. */
  segments?: RenderPlanTextSegment[];
  /** Browser pixels used only when the target cannot load the authored family. */
  fontFallbackAssetId?: string;
  /** Use the browser pixels even when the authored family itself loads. */
  fontFallbackRequired?: true;
  effects: FigmaEffect[];
}

export interface RenderPlanRectangleNode extends RenderPlanNodeBase {
  type: "RECTANGLE";
  fills: FigmaPaint[];
  strokes: FigmaPaint[];
  strokeWeight: number;
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER";
  cornerRadius?: number;
  cornerRadii?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  effects: FigmaEffect[];
}

export interface RenderPlanVectorNode extends RenderPlanNodeBase {
  type: "SVG";
  /** Raw sanitized SVG markup, inserted by the downstream SVG node factory. */
  svgMarkup?: string;
  /** Fallback: rasterized asset when markup unavailable. */
  assetId?: string;
}

export type RenderPlanNode =
  | RenderPlanFrameNode
  | RenderPlanTextNode
  | RenderPlanRectangleNode
  | RenderPlanVectorNode;

// ---------------------------------------------------------------------------
// Assets & fonts
// ---------------------------------------------------------------------------

export type RenderPlanAssetRef =
  | { kind: "capture"; assetId: string }
  | { kind: "url"; url: `data:${string}` };

export interface RenderPlanAsset {
  assetId: string;
  mediaType: string;
  /** Capture refs are internal; portable plans use local data URLs. */
  ref: RenderPlanAssetRef;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface RenderPlanFontRequest {
  family: string;
  /** Figma style names required, e.g. ["Regular", "Bold"]. */
  styles: string[];
  /** Fallback family the plugin should substitute when load fails. */
  fallbackFamily: string;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface RenderPlan {
  schemaVersion: RenderPlanContractVersion;
  renderPlanId: `rp_${string}`;
  sourceCaptureId: `cap_${string}`;
  sourceType: "chrome_capture";
  createdAt: string;
  safeSourceLabel: string;
  page: {
    widthPx: number;
    heightPx: number;
    background: RgbaColor;
  };
  root: RenderPlanFrameNode;
  assets: RenderPlanAsset[];
  fonts: RenderPlanFontRequest[];
  warnings: CaptureWarning[];
  stats: {
    nodeCount: number;
    textNodeCount: number;
    assetCount: number;
    conversionDurationMs: number;
  };
}

export function isRenderPlan(value: unknown): value is RenderPlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RenderPlan>;
  return (
    candidate.schemaVersion === RENDER_PLAN_CONTRACT_VERSION &&
    typeof candidate.renderPlanId === "string" &&
    candidate.renderPlanId.startsWith("rp_") &&
    typeof candidate.sourceCaptureId === "string" &&
    candidate.sourceCaptureId.startsWith("cap_") &&
    candidate.sourceType === "chrome_capture" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.safeSourceLabel === "string" &&
    isRenderPlanPage(candidate.page) &&
    isRenderPlanFrameNode(candidate.root, 0) &&
    Array.isArray(candidate.assets) &&
    candidate.assets.every(isRenderPlanAsset) &&
    Array.isArray(candidate.fonts) &&
    candidate.fonts.every(isRenderPlanFontRequest) &&
    Array.isArray(candidate.warnings) &&
    candidate.warnings.every(isRenderPlanWarning) &&
    isRenderPlanStats(candidate.stats)
  );
}

function isRenderPlanWarning(value: unknown): value is CaptureWarning {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CaptureWarning>;
  return (
    isCaptureWarningCode(candidate.code) &&
    (candidate.nodeId === undefined || typeof candidate.nodeId === "string") &&
    isFiniteNonNegativeNumber(candidate.count) &&
    (candidate.detail === undefined || typeof candidate.detail === "string")
  );
}

function isRenderPlanPage(value: unknown): value is RenderPlan["page"] {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlan["page"]>;
  return (
    isFinitePositiveNumber(candidate.widthPx) &&
    isFinitePositiveNumber(candidate.heightPx) &&
    isRgbaColor(candidate.background)
  );
}

function isRenderPlanNode(value: unknown, depth: number): value is RenderPlanNode {
  if (typeof value !== "object" || value === null || depth > 500) return false;
  const candidate = value as { type?: unknown };
  if (candidate.type === "FRAME") return isRenderPlanFrameNode(value, depth);
  if (candidate.type === "TEXT") return isRenderPlanTextNode(value);
  if (candidate.type === "RECTANGLE") return isRenderPlanRectangleNode(value);
  if (candidate.type === "SVG") return isRenderPlanVectorNode(value);
  return false;
}

function isRenderPlanNodeBase(
  value: unknown,
  type: RenderPlanNode["type"],
): value is RenderPlanNodeBase {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanNodeBase> & { type?: unknown };
  return (
    candidate.type === type &&
    isNonEmptyString(candidate.id) &&
    (candidate.sourceNodeId === undefined || typeof candidate.sourceNodeId === "string") &&
    typeof candidate.name === "string" &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNonNegativeNumber(candidate.width) &&
    isFiniteNonNegativeNumber(candidate.height) &&
    isOpacity(candidate.opacity) &&
    (candidate.rotationDegrees === undefined || isFiniteNumber(candidate.rotationDegrees)) &&
    (candidate.visible === undefined || typeof candidate.visible === "boolean") &&
    (candidate.blendMode === undefined || isBlendMode(candidate.blendMode))
  );
}

function isRenderPlanFrameNode(value: unknown, depth: number): value is RenderPlanFrameNode {
  if (!isRenderPlanNodeBase(value, "FRAME")) return false;
  const candidate = value as Partial<RenderPlanFrameNode>;
  return (
    Array.isArray(candidate.fills) &&
    candidate.fills.every(isFigmaPaint) &&
    Array.isArray(candidate.strokes) &&
    candidate.strokes.every(isFigmaPaint) &&
    isFiniteNonNegativeNumber(candidate.strokeWeight) &&
    (candidate.strokeWeights === undefined || isStrokeWeights(candidate.strokeWeights)) &&
    isStrokeAlign(candidate.strokeAlign) &&
    (candidate.cornerRadius === undefined || isFiniteNonNegativeNumber(candidate.cornerRadius)) &&
    (candidate.cornerRadii === undefined || isCornerRadii(candidate.cornerRadii)) &&
    Array.isArray(candidate.effects) &&
    candidate.effects.every(isFigmaEffect) &&
    typeof candidate.clipsContent === "boolean" &&
    (candidate.autoLayout === undefined || isRenderPlanAutoLayout(candidate.autoLayout)) &&
    Array.isArray(candidate.children) &&
    candidate.children.every((child) => isRenderPlanNode(child, depth + 1))
  );
}

function isRenderPlanTextNode(value: unknown): value is RenderPlanTextNode {
  if (!isRenderPlanNodeBase(value, "TEXT")) return false;
  const candidate = value as Partial<RenderPlanTextNode>;
  return (
    typeof candidate.characters === "string" &&
    typeof candidate.fontFamily === "string" &&
    typeof candidate.fontStyle === "string" &&
    isFinitePositiveNumber(candidate.fontSizePx) &&
    isFinitePositiveNumber(candidate.lineHeightPx) &&
    isFiniteNumber(candidate.letterSpacingPx) &&
    Array.isArray(candidate.fills) &&
    candidate.fills.every(isFigmaPaint) &&
    ["LEFT", "CENTER", "RIGHT", "JUSTIFIED"].includes(candidate.textAlignHorizontal ?? "") &&
    ["NONE", "UNDERLINE", "STRIKETHROUGH"].includes(candidate.textDecoration ?? "") &&
    ["ORIGINAL", "UPPER", "LOWER", "TITLE"].includes(candidate.textCase ?? "") &&
    ["NONE", "HEIGHT", "WIDTH_AND_HEIGHT"].includes(candidate.textAutoResize ?? "") &&
    (candidate.segments === undefined ||
      (Array.isArray(candidate.segments) && candidate.segments.every(isRenderPlanTextSegment))) &&
    (candidate.fontFallbackAssetId === undefined ||
      isNonEmptyString(candidate.fontFallbackAssetId)) &&
    (candidate.fontFallbackRequired === undefined || candidate.fontFallbackRequired === true) &&
    Array.isArray(candidate.effects) &&
    candidate.effects.every(isFigmaEffect)
  );
}

function isRenderPlanRectangleNode(value: unknown): value is RenderPlanRectangleNode {
  if (!isRenderPlanNodeBase(value, "RECTANGLE")) return false;
  const candidate = value as Partial<RenderPlanRectangleNode>;
  return (
    Array.isArray(candidate.fills) &&
    candidate.fills.every(isFigmaPaint) &&
    Array.isArray(candidate.strokes) &&
    candidate.strokes.every(isFigmaPaint) &&
    isFiniteNonNegativeNumber(candidate.strokeWeight) &&
    isStrokeAlign(candidate.strokeAlign) &&
    (candidate.cornerRadius === undefined || isFiniteNonNegativeNumber(candidate.cornerRadius)) &&
    (candidate.cornerRadii === undefined || isCornerRadii(candidate.cornerRadii)) &&
    Array.isArray(candidate.effects) &&
    candidate.effects.every(isFigmaEffect)
  );
}

function isRenderPlanVectorNode(value: unknown): value is RenderPlanVectorNode {
  if (!isRenderPlanNodeBase(value, "SVG")) return false;
  const candidate = value as Partial<RenderPlanVectorNode>;
  return (
    (candidate.svgMarkup === undefined ||
      (typeof candidate.svgMarkup === "string" && isSafeSvgMarkup(candidate.svgMarkup))) &&
    (candidate.assetId === undefined || isNonEmptyString(candidate.assetId))
  );
}

function isRenderPlanStats(value: unknown): value is RenderPlan["stats"] {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlan["stats"]>;
  return (
    isFiniteNonNegativeNumber(candidate.nodeCount) &&
    isFiniteNonNegativeNumber(candidate.textNodeCount) &&
    isFiniteNonNegativeNumber(candidate.assetCount) &&
    isFiniteNonNegativeNumber(candidate.conversionDurationMs)
  );
}

function isRenderPlanFontRequest(value: unknown): value is RenderPlanFontRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanFontRequest>;
  return (
    typeof candidate.family === "string" &&
    Array.isArray(candidate.styles) &&
    candidate.styles.every((style) => typeof style === "string") &&
    typeof candidate.fallbackFamily === "string"
  );
}

function isRenderPlanTextSegment(value: unknown): value is RenderPlanTextSegment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanTextSegment>;
  return (
    isFiniteNonNegativeNumber(candidate.start) &&
    isFiniteNonNegativeNumber(candidate.end) &&
    candidate.end >= candidate.start &&
    typeof candidate.fontFamily === "string" &&
    typeof candidate.fontStyle === "string" &&
    isFinitePositiveNumber(candidate.fontSizePx) &&
    isRgbaColor(candidate.color) &&
    isFiniteNumber(candidate.letterSpacingPx) &&
    ["NONE", "UNDERLINE", "STRIKETHROUGH"].includes(candidate.textDecoration ?? "")
  );
}

function isFigmaPaint(value: unknown): value is FigmaPaint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FigmaPaint>;
  if (candidate.type === "SOLID") {
    const paint = candidate as Partial<FigmaSolidPaint>;
    return isRgbColor(paint.color) && isOpacity(paint.opacity);
  }
  if (
    candidate.type === "GRADIENT_LINEAR" ||
    candidate.type === "GRADIENT_RADIAL" ||
    candidate.type === "GRADIENT_ANGULAR"
  ) {
    const paint = candidate as Partial<FigmaGradientPaint>;
    return (
      Array.isArray(paint.gradientStops) &&
      paint.gradientStops.length > 0 &&
      paint.gradientStops.every(isFigmaGradientStop) &&
      isGradientTransform(paint.gradientTransform) &&
      isOpacity(paint.opacity)
    );
  }
  if (candidate.type === "IMAGE") {
    const paint = candidate as Partial<FigmaImagePaint>;
    return (
      isNonEmptyString(paint.assetId) &&
      ["FILL", "FIT", "CROP", "TILE"].includes(paint.scaleMode ?? "") &&
      (paint.scalingFactor === undefined ||
        (typeof paint.scalingFactor === "number" &&
          Number.isFinite(paint.scalingFactor) &&
          paint.scalingFactor > 0)) &&
      isOpacity(paint.opacity)
    );
  }
  return false;
}

function isFigmaGradientStop(value: unknown): value is FigmaGradientStop {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FigmaGradientStop>;
  return isUnitNumber(candidate.position) && isRgbaColor(candidate.color);
}

function isGradientTransform(value: unknown): value is FigmaGradientTransform {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 3 &&
        row.every((entry) => isFiniteNumber(entry)),
    )
  );
}

function isFigmaEffect(value: unknown): value is FigmaEffect {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FigmaEffect>;
  if (candidate.type === "DROP_SHADOW" || candidate.type === "INNER_SHADOW") {
    const effect = candidate as Partial<FigmaDropShadowEffect>;
    return (
      isRgbaColor(effect.color) &&
      isPoint(effect.offset) &&
      isFiniteNonNegativeNumber(effect.radius) &&
      isFiniteNumber(effect.spread) &&
      effect.visible === true &&
      effect.blendMode === "NORMAL"
    );
  }
  if (candidate.type === "LAYER_BLUR" || candidate.type === "BACKGROUND_BLUR") {
    const effect = candidate as Partial<FigmaBlurEffect>;
    return isFiniteNonNegativeNumber(effect.radius) && effect.visible === true;
  }
  return false;
}

function isRenderPlanAutoLayout(value: unknown): value is RenderPlanAutoLayout {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanAutoLayout>;
  return (
    (candidate.layoutMode === "HORIZONTAL" || candidate.layoutMode === "VERTICAL") &&
    isFiniteNonNegativeNumber(candidate.itemSpacing) &&
    (candidate.counterAxisSpacing === undefined ||
      isFiniteNonNegativeNumber(candidate.counterAxisSpacing)) &&
    isFiniteNonNegativeNumber(candidate.paddingTop) &&
    isFiniteNonNegativeNumber(candidate.paddingRight) &&
    isFiniteNonNegativeNumber(candidate.paddingBottom) &&
    isFiniteNonNegativeNumber(candidate.paddingLeft) &&
    ["MIN", "CENTER", "MAX", "SPACE_BETWEEN"].includes(candidate.primaryAxisAlignItems ?? "") &&
    ["MIN", "CENTER", "MAX"].includes(candidate.counterAxisAlignItems ?? "") &&
    (candidate.layoutWrap === undefined || ["NO_WRAP", "WRAP"].includes(candidate.layoutWrap))
  );
}

function isStrokeWeights(value: unknown): value is RenderPlanFrameNode["strokeWeights"] {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NonNullable<RenderPlanFrameNode["strokeWeights"]>>;
  return (
    isFiniteNonNegativeNumber(candidate.top) &&
    isFiniteNonNegativeNumber(candidate.right) &&
    isFiniteNonNegativeNumber(candidate.bottom) &&
    isFiniteNonNegativeNumber(candidate.left)
  );
}

function isCornerRadii(value: unknown): value is NonNullable<RenderPlanFrameNode["cornerRadii"]> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NonNullable<RenderPlanFrameNode["cornerRadii"]>>;
  return (
    isFiniteNonNegativeNumber(candidate.topLeft) &&
    isFiniteNonNegativeNumber(candidate.topRight) &&
    isFiniteNonNegativeNumber(candidate.bottomRight) &&
    isFiniteNonNegativeNumber(candidate.bottomLeft)
  );
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y);
}

function isRgbColor(value: unknown): value is { r: number; g: number; b: number } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { r?: unknown; g?: unknown; b?: unknown };
  return isUnitNumber(candidate.r) && isUnitNumber(candidate.g) && isUnitNumber(candidate.b);
}

function isRgbaColor(value: unknown): value is RgbaColor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RgbaColor>;
  return (
    isUnitNumber(candidate.r) &&
    isUnitNumber(candidate.g) &&
    isUnitNumber(candidate.b) &&
    isUnitNumber(candidate.a)
  );
}

function isStrokeAlign(value: unknown): value is "INSIDE" | "OUTSIDE" | "CENTER" {
  return value === "INSIDE" || value === "OUTSIDE" || value === "CENTER";
}

function isBlendMode(value: unknown): value is FigmaBlendMode {
  return (
    typeof value === "string" &&
    [
      "NORMAL",
      "MULTIPLY",
      "SCREEN",
      "OVERLAY",
      "DARKEN",
      "LIGHTEN",
      "COLOR_DODGE",
      "COLOR_BURN",
      "HARD_LIGHT",
      "SOFT_LIGHT",
      "DIFFERENCE",
      "EXCLUSION",
      "HUE",
      "SATURATION",
      "COLOR",
      "LUMINOSITY",
    ].includes(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUnitNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isOpacity(value: unknown): value is number {
  return isUnitNumber(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRenderPlanAsset(value: unknown): value is RenderPlanAsset {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanAsset> & { base64?: unknown };
  return (
    candidate.base64 === undefined &&
    isNonEmptyString(candidate.assetId) &&
    isNonEmptyString(candidate.mediaType) &&
    isRenderPlanAssetRef(candidate.ref)
  );
}

function isRenderPlanAssetRef(value: unknown): value is RenderPlanAssetRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RenderPlanAssetRef>;
  if (candidate.kind === "capture") {
    return isNonEmptyString((candidate as { assetId?: unknown }).assetId);
  }
  if (candidate.kind === "url") {
    return isAllowedUrlAssetRef((candidate as { url?: unknown }).url);
  }
  return false;
}

function isAllowedUrlAssetRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}
