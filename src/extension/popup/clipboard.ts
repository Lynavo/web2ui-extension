import type { FigmaClipboardPayload } from "../types.js";

export interface ClipboardWriter {
  write?: (items: unknown[]) => Promise<void>;
  writeText: (text: string) => Promise<void>;
}

export type ClipboardItemConstructor = new (values: Record<string, Blob>) => unknown;

export async function writeFigmaClipboardPayload(
  payload: FigmaClipboardPayload,
  clipboard: ClipboardWriter = navigator.clipboard as unknown as ClipboardWriter,
  ClipboardItemType: ClipboardItemConstructor | undefined = globalThis.ClipboardItem,
): Promise<void> {
  const svg = new Blob([payload.svg], { type: "image/svg+xml" });
  const html = new Blob([payload.html], { type: "text/html" });
  const text = new Blob([payload.text], { type: "text/plain" });

  if (clipboard.write && ClipboardItemType) {
    try {
      await clipboard.write([
        new ClipboardItemType({
          "image/svg+xml": svg,
          "text/html": html,
          "text/plain": text,
        }),
      ]);
      return;
    } catch {
      try {
        await clipboard.write([
          new ClipboardItemType({
            "text/html": html,
            "text/plain": text,
          }),
        ]);
        return;
      } catch {
        // Chromium versions differ in rich MIME support; plain SVG text is portable.
      }
    }
  }
  await clipboard.writeText(payload.text);
}
