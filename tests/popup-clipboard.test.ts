import { describe, expect, it, vi } from "vitest";
import { writeFigmaClipboardPayload } from "../src/extension/popup/clipboard.js";

const payload = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  html: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  text: '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

class FakeClipboardItem {
  constructor(readonly values: Record<string, Blob>) {}
}

describe("writeFigmaClipboardPayload", () => {
  it("writes SVG, HTML, and text from the explicit Copy user action", async () => {
    const write = vi.fn(async (items: unknown[]) => {
      void items;
    });
    const writeText = vi.fn(async () => undefined);

    await writeFigmaClipboardPayload(payload, { write, writeText }, FakeClipboardItem);

    expect(write).toHaveBeenCalledOnce();
    const item = write.mock.calls[0]?.[0]?.[0] as unknown as FakeClipboardItem;
    expect(Object.keys(item.values).sort()).toEqual(["image/svg+xml", "text/html", "text/plain"]);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to plain SVG text when rich clipboard MIME types are unavailable", async () => {
    const write = vi.fn(async (items: unknown[]) => {
      void items;
      throw new Error("rich clipboard unavailable");
    });
    const writeText = vi.fn(async () => undefined);

    await writeFigmaClipboardPayload(payload, { write, writeText }, FakeClipboardItem);

    expect(write).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenCalledWith(payload.text);
  });
});
