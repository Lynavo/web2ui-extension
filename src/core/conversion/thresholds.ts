/**
 * 转换层判断型阈值集中治理（Phase 6）。
 *
 * 规则：
 * - 本文件只收录「判断型」阈值 —— 会改变结构决策的比较值。
 *   纯几何常数（渐变矩阵 0.5、round 精度、最小尺寸 0.01）不属于此类。
 * - 每个阈值必须注明：判断什么、为何取该值、命中哪个回退路径。
 * - 新增判断型阈值必须进本文件并配 fixture 复现；禁止散落在逻辑中。
 */

/**
 * 单行文本行高钳制窗口：style 行高 ≈ 字号（≤1.02×）而捕获高度略高
 * （1.05×~1.55×）时，判定为浏览器 normal 行高与 style 行高不一致，
 * 采用捕获高度。窗口外保留 style 行高。
 */
export const SINGLE_LINE_STYLE_HEIGHT_RATIO_MAX = 1.02;
export const SINGLE_LINE_CAPTURED_MIN_RATIO = 1.05;
export const SINGLE_LINE_CAPTURED_MAX_RATIO = 1.55;

/** 行高回退上限：无可信行高时按 fontSize × 1.2（CSS normal 的近似）。 */
export const FALLBACK_LINE_HEIGHT_RATIO = 1.2;

/**
 * 近正方形判定：宽高差占长边比例 ≤0.02 视为正方形（圆角处理用）。
 */
export const NEAR_SQUARE_TOLERANCE = 0.02;
