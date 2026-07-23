export const EXTENSION_STATUSES = [
  "idle",
  "capturing",
  "converting",
  "ready",
  "preparing-clipboard",
  "error",
] as const;

export type ExtensionStatus = (typeof EXTENSION_STATUSES)[number];
export type CaptureMode = "visible-area" | "full-page";

export interface CaptureRunIdentity {
  runId: string;
  tabId: number;
  documentId: string;
}

interface ActiveStateBase extends CaptureRunIdentity {
  mode: CaptureMode;
}

export interface IdleExtensionState {
  status: "idle";
}

export interface CapturingExtensionState extends ActiveStateBase {
  status: "capturing";
  startedAt: number;
  progress: number;
  label: string;
}

export interface ConvertingExtensionState extends ActiveStateBase {
  status: "converting";
  startedAt: number;
}

export interface ReadyExtensionState extends ActiveStateBase {
  status: "ready";
  createdAt: number;
  expiresAt: number;
  warningCount: number;
  copyResult?: "copied" | "failed";
  copyError?: string;
}

export interface PreparingClipboardExtensionState extends ActiveStateBase {
  status: "preparing-clipboard";
  createdAt: number;
  expiresAt: number;
  warningCount: number;
}

export type ExtensionErrorCode =
  | "unsupported-page"
  | "permission-denied"
  | "page-changed"
  | "tab-closed"
  | "capture-failed"
  | "invalid-capture"
  | "conversion-failed"
  | "plan-too-large"
  | "storage-failed";

export interface ErrorExtensionState {
  status: "error";
  code: ExtensionErrorCode;
  message: string;
}

export type ExtensionState =
  | IdleExtensionState
  | CapturingExtensionState
  | ConvertingExtensionState
  | ReadyExtensionState
  | PreparingClipboardExtensionState
  | ErrorExtensionState;

export type ExtensionEvent =
  | {
      type: "start-capture";
      identity: CaptureRunIdentity;
      mode: CaptureMode;
      startedAt: number;
    }
  | {
      type: "capture-progress";
      identity: CaptureRunIdentity;
      progress: number;
      label: string;
    }
  | { type: "capture-complete"; identity: CaptureRunIdentity }
  | {
      type: "conversion-complete";
      identity: CaptureRunIdentity;
      createdAt: number;
      expiresAt: number;
      warningCount: number;
    }
  | { type: "prepare-clipboard"; identity: CaptureRunIdentity }
  | { type: "clipboard-complete"; identity: CaptureRunIdentity }
  | { type: "clipboard-failed"; identity: CaptureRunIdentity; message: string }
  | {
      type: "run-failed";
      identity: CaptureRunIdentity;
      code: ExtensionErrorCode;
      message: string;
    }
  | { type: "clear" };

export function initialExtensionState(): IdleExtensionState {
  return { status: "idle" };
}

export function reduceExtensionState(
  state: ExtensionState,
  event: ExtensionEvent,
): ExtensionState {
  if (event.type === "clear") return initialExtensionState();

  if (event.type === "start-capture") {
    return {
      status: "capturing",
      ...event.identity,
      mode: event.mode,
      startedAt: event.startedAt,
      progress: 0,
      label: "Capturing page",
    };
  }

  if (!hasMatchingIdentity(state, event.identity)) return state;

  switch (event.type) {
    case "capture-progress":
      if (state.status !== "capturing") return state;
      return {
        ...state,
        progress: Math.min(1, Math.max(0, event.progress)),
        label: event.label,
      };
    case "capture-complete":
      if (state.status !== "capturing") return state;
      return {
        status: "converting",
        runId: state.runId,
        tabId: state.tabId,
        documentId: state.documentId,
        mode: state.mode,
        startedAt: state.startedAt,
      };
    case "conversion-complete":
      if (state.status !== "converting") return state;
      return {
        status: "ready",
        runId: state.runId,
        tabId: state.tabId,
        documentId: state.documentId,
        mode: state.mode,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
        warningCount: event.warningCount,
      };
    case "prepare-clipboard":
      if (state.status !== "ready") return state;
      return {
        status: "preparing-clipboard",
        runId: state.runId,
        tabId: state.tabId,
        documentId: state.documentId,
        mode: state.mode,
        createdAt: state.createdAt,
        expiresAt: state.expiresAt,
        warningCount: state.warningCount,
      };
    case "clipboard-complete":
      if (state.status !== "preparing-clipboard") return state;
      return readyFromClipboardState(state, { copyResult: "copied" });
    case "clipboard-failed":
      if (state.status !== "preparing-clipboard") return state;
      return readyFromClipboardState(state, {
        copyResult: "failed",
        copyError: event.message,
      });
    case "run-failed":
      if (state.status !== "capturing" && state.status !== "converting") return state;
      return { status: "error", code: event.code, message: event.message };
  }
}

function hasMatchingIdentity(
  state: ExtensionState,
  identity: CaptureRunIdentity,
): state is Exclude<ExtensionState, IdleExtensionState | ErrorExtensionState> {
  return (
    "runId" in state &&
    state.runId === identity.runId &&
    state.tabId === identity.tabId &&
    state.documentId === identity.documentId
  );
}

function readyFromClipboardState(
  state: PreparingClipboardExtensionState,
  copy: Pick<ReadyExtensionState, "copyResult" | "copyError">,
): ReadyExtensionState {
  return {
    status: "ready",
    runId: state.runId,
    tabId: state.tabId,
    documentId: state.documentId,
    mode: state.mode,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
    warningCount: state.warningCount,
    ...copy,
  };
}
