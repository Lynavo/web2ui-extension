export type CaptureTheme = "browser" | "light" | "dark";

export interface CaptureViewportPreference {
  id: string;
  label: string;
  widthPx: number | null;
  source: "browser" | "preset";
}

export interface CaptureThemePreference {
  id: CaptureTheme;
  label: string;
  source: "browser" | "forced";
}

export interface CaptureOptions {
  viewports: CaptureViewportPreference[];
  themes: CaptureThemePreference[];
}
