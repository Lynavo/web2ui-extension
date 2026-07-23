import { describe, expect, it, vi } from "vitest";
import {
  restorePageScroll,
  restorePageScrollToTop,
  stabilizeFullPageScroll,
} from "../src/extension/content-scroll.js";

describe("content scroll stabilization", () => {
  it("restores the exact original page position", () => {
    const target = {
      scrollTo: vi.fn(),
      document: {
        documentElement: { scrollTop: 0, scrollLeft: 0 },
        body: { scrollTop: 0, scrollLeft: 0 },
      },
    };

    restorePageScroll({ x: 17, y: 642 }, target);
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 642, left: 17, behavior: "instant" });
    expect(target.document.documentElement).toEqual({ scrollTop: 642, scrollLeft: 17 });
    restorePageScrollToTop(target);
    expect(target.document.body).toEqual({ scrollTop: 0, scrollLeft: 0 });
  });

  it("sweeps a narrow long page beyond the old 60-step cutoff", async () => {
    const viewportHeight = 600;
    const scrollHeight = 60_000;
    let scrollY = 0;
    const visited: number[] = [];
    const result = await stabilizeFullPageScroll({
      viewportHeight: () => viewportHeight,
      scrollHeight: () => scrollHeight,
      scrollY: () => scrollY,
      scrollBy: (deltaY) => {
        scrollY = Math.min(scrollHeight - viewportHeight, Math.max(0, scrollY + deltaY));
        visited.push(scrollY);
      },
      scrollTo: (top) => {
        scrollY = top;
      },
      wait: async () => undefined,
    });

    expect(result.reachedBottom).toBe(true);
    expect(result.downSteps).toBeGreaterThan(60);
    expect(visited).toContain(scrollHeight - viewportHeight);
    expect(scrollY).toBe(0);
  });

  it("does not chase an infinite feed beyond the initial frontier", async () => {
    const viewportHeight = 500;
    let scrollHeight = 2_000;
    let scrollY = 0;
    const visited: number[] = [];
    const result = await stabilizeFullPageScroll({
      viewportHeight: () => viewportHeight,
      scrollHeight: () => scrollHeight,
      scrollY: () => scrollY,
      scrollBy: (deltaY) => {
        scrollY = Math.min(scrollHeight - viewportHeight, Math.max(0, scrollY + deltaY));
        visited.push(scrollY);
      },
      scrollTo: (top) => {
        scrollY = top;
      },
      wait: async (durationMs) => {
        if (durationMs === 250) scrollHeight = 3_000;
      },
    });

    expect(result.reachedBottom).toBe(true);
    expect(result.capturePageHeight).toBe(2_000);
    expect(visited).not.toContain(2_500);
    expect(scrollY).toBe(0);
  });
});
