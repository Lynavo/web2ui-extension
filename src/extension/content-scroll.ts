export interface ScrollTarget {
  scrollTo: {
    (x: number, y: number): void;
    (options: ScrollToOptions): void;
  };
  document?: {
    documentElement?: { scrollTop: number; scrollLeft: number };
    body?: { scrollTop: number; scrollLeft: number };
  };
}

export interface ScrollPosition {
  x: number;
  y: number;
}

export interface FullPageScrollDriver {
  viewportHeight(): number;
  scrollHeight(): number;
  scrollY(): number;
  scrollBy(deltaY: number): void;
  scrollTo(top: number): void;
  wait(durationMs: number): Promise<void>;
}

export interface FullPageScrollResult {
  reachedBottom: boolean;
  downSteps: number;
  upSteps: number;
  /** Initial height, unless revisiting the captured region caused later reflow. */
  capturePageHeight: number;
}

const MAX_FULL_PAGE_SCROLL_STEPS = 200;
const FULL_PAGE_SCROLL_DELAY_MS = 120;
const FULL_PAGE_BOTTOM_SETTLE_MS = 250;

/**
 * Sweep only the document extent observed when capture starts. The reverse
 * pass gives late-mounted observers a real intersection without chasing an
 * infinite-feed sentinel beyond the original capture frontier.
 */
export async function stabilizeFullPageScroll(
  driver: FullPageScrollDriver,
): Promise<FullPageScrollResult> {
  const viewportHeight = Math.max(1, driver.viewportHeight());
  const initialPageHeight = Math.max(viewportHeight, driver.scrollHeight());
  const step = Math.max(200, Math.floor(viewportHeight * 0.75));
  const captureFrontier = Math.max(driver.scrollY(), initialPageHeight - viewportHeight);
  const isAtCaptureFrontier = () => driver.scrollY() >= captureFrontier - 2;
  let downSteps = 0;
  let stagnantSteps = 0;

  while (!isAtCaptureFrontier()) {
    if (downSteps >= MAX_FULL_PAGE_SCROLL_STEPS) break;
    const before = driver.scrollY();
    driver.scrollBy(Math.min(step, captureFrontier - before));
    downSteps += 1;
    await driver.wait(FULL_PAGE_SCROLL_DELAY_MS);
    const after = driver.scrollY();
    stagnantSteps = after <= before + 1 ? stagnantSteps + 1 : 0;
    if (stagnantSteps >= 2 && !isAtCaptureFrontier()) break;
  }

  const reachedBottom = isAtCaptureFrontier();
  if (reachedBottom) await driver.wait(FULL_PAGE_BOTTOM_SETTLE_MS);
  const pageHeightAtFrontier = Math.max(viewportHeight, driver.scrollHeight());
  let upSteps = 0;
  while (driver.scrollY() > 1 && upSteps < MAX_FULL_PAGE_SCROLL_STEPS) {
    driver.scrollBy(-step);
    upSteps += 1;
    await driver.wait(FULL_PAGE_SCROLL_DELAY_MS);
  }
  driver.scrollTo(0);
  const pageHeightAfterReverse = Math.max(viewportHeight, driver.scrollHeight());
  const capturePageHeight =
    pageHeightAfterReverse > pageHeightAtFrontier
      ? Math.max(initialPageHeight, pageHeightAfterReverse)
      : initialPageHeight;

  return { reachedBottom, downSteps, upSteps, capturePageHeight };
}

export function restorePageScroll(
  position: ScrollPosition,
  target: ScrollTarget = window,
): void {
  const left = Number.isFinite(position.x) ? position.x : 0;
  const top = Number.isFinite(position.y) ? position.y : 0;
  try {
    target.scrollTo({ top, left, behavior: "instant" as ScrollBehavior });
  } catch {
    target.scrollTo(left, top);
  }
  if (target.document?.documentElement) {
    setElementScroll(target.document.documentElement, left, top);
  }
  if (target.document?.body) {
    setElementScroll(target.document.body, left, top);
  }
}

export function restorePageScrollToTop(target: ScrollTarget = window): void {
  restorePageScroll({ x: 0, y: 0 }, target);
}

function setElementScroll(
  element: { scrollTop: number; scrollLeft: number },
  left: number,
  top: number,
): void {
  element.scrollTop = top;
  element.scrollLeft = left;
}
