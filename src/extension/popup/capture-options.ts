import type { CaptureOptions, CaptureTheme } from "../../core/contracts/capture-options.js";

export type ViewportChoice = "browser" | "1920" | "1440" | "1024" | "768" | "390";
export type ThemeChoice = CaptureTheme;
export type OptionIcon =
  | "monitor"
  | "laptop"
  | "tablet"
  | "smartphone"
  | "sun"
  | "moon";

export interface ViewportOption {
  id: ViewportChoice;
  label: string;
  widthPx: number | null;
  icon: Extract<OptionIcon, "monitor" | "laptop" | "tablet" | "smartphone">;
}

export interface ThemeOption {
  id: ThemeChoice;
  label: string;
  icon: Extract<OptionIcon, "monitor" | "sun" | "moon">;
}

export const VIEWPORT_OPTIONS: readonly ViewportOption[] = [
  { id: "browser", label: "Browser", widthPx: null, icon: "monitor" },
  { id: "1920", label: "1920 px", widthPx: 1920, icon: "monitor" },
  { id: "1440", label: "1440 px", widthPx: 1440, icon: "laptop" },
  { id: "1024", label: "1024 px", widthPx: 1024, icon: "tablet" },
  { id: "768", label: "768 px", widthPx: 768, icon: "smartphone" },
  { id: "390", label: "390 px", widthPx: 390, icon: "smartphone" },
];

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: "browser", label: "Browser", icon: "monitor" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
];

export function buildCaptureOptions(
  viewportId: ViewportChoice,
  themeId: ThemeChoice,
): CaptureOptions {
  const viewport =
    VIEWPORT_OPTIONS.find(({ id }) => id === viewportId) ?? VIEWPORT_OPTIONS[0]!;
  const theme = THEME_OPTIONS.find(({ id }) => id === themeId) ?? THEME_OPTIONS[0]!;
  return {
    viewports: [
      {
        id: viewport.id,
        label: viewport.label,
        widthPx: viewport.widthPx,
        source: viewport.id === "browser" ? "browser" : "preset",
      },
    ],
    themes: [
      {
        id: theme.id,
        label: theme.label,
        source: theme.id === "browser" ? "browser" : "forced",
      },
    ],
  };
}

export function formatViewportChip(
  id: ViewportChoice,
  browserWidthPx: number | null,
): string {
  if (id === "browser") return browserWidthPx === null ? "Browser" : `${browserWidthPx}px`;
  const viewport = VIEWPORT_OPTIONS.find((option) => option.id === id);
  return `${viewport?.widthPx ?? id}px`;
}

export function formatThemeChip(id: ThemeChoice): string {
  return (THEME_OPTIONS.find((option) => option.id === id)?.label ?? "Browser").toUpperCase();
}
