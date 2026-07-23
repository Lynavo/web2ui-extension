import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureDocument } from "../src/core/contracts/capture.js";
import type { RunCaptureCommand } from "../src/extension/types.js";

type ContentListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void;

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__web2uiLocalCaptureContentV1;
  vi.unstubAllGlobals();
  vi.doUnmock("../src/extension/content-capture.js");
  vi.resetModules();
});

function captureCommand(runId: string): RunCaptureCommand {
  return {
    type: "run-capture",
    runId,
    tabId: 9,
    documentId: `document_${runId}`,
    mode: "visible-area",
    options: {
      viewports: [{ id: "browser", label: "Browser", widthPx: null, source: "browser" }],
      themes: [{ id: "browser", label: "Browser", source: "browser" }],
    },
  };
}

function fakeDocument(captureId: `cap_${string}`): CaptureDocument {
  return { captureId } as CaptureDocument;
}

describe("content runtime", () => {
  it("installs exactly one listener when the bundle is injected repeatedly", async () => {
    const listeners: ContentListener[] = [];
    const addListener = vi.fn((listener: ContentListener) => listeners.push(listener));
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: { addListener },
        sendMessage: vi.fn(),
      },
    });

    await import("../src/extension/content.js");
    vi.resetModules();
    await import("../src/extension/content.js");

    expect(addListener).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(1);
  });

  it("echoes the complete run identity with a completed local capture", async () => {
    const executeContentCapture = vi.fn(async () => fakeDocument("cap_current"));
    vi.doMock("../src/extension/content-capture.js", () => ({ executeContentCapture }));
    const listeners: ContentListener[] = [];
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: { addListener: (listener: ContentListener) => listeners.push(listener) },
        sendMessage,
      },
    });
    vi.stubGlobal("window", { scrollX: 0, scrollY: 0 });
    await import("../src/extension/content.js");

    const command = captureCommand("run_current");
    const sendResponse = vi.fn();
    listeners[0]?.(command, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ accepted: true });
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "capture-done",
        runId: command.runId,
        tabId: command.tabId,
        documentId: command.documentId,
        document: fakeDocument("cap_current"),
      });
    });
  });

  it("never submits an older run after a new command replaces it", async () => {
    const pending = new Map<string, (document: CaptureDocument) => void>();
    const executeContentCapture = vi.fn(
      (command: RunCaptureCommand) =>
        new Promise<CaptureDocument>((resolve) => pending.set(command.runId, resolve)),
    );
    vi.doMock("../src/extension/content-capture.js", () => ({ executeContentCapture }));
    const listeners: ContentListener[] = [];
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: { addListener: (listener: ContentListener) => listeners.push(listener) },
        sendMessage,
      },
    });
    vi.stubGlobal("window", { scrollX: 0, scrollY: 0 });
    await import("../src/extension/content.js");

    listeners[0]?.(captureCommand("run_old"), {}, vi.fn());
    listeners[0]?.(captureCommand("run_new"), {}, vi.fn());
    pending.get("run_new")?.(fakeDocument("cap_new"));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    pending.get("run_old")?.(fakeDocument("cap_old"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "capture-done", runId: "run_new" }),
    );
  });
});
