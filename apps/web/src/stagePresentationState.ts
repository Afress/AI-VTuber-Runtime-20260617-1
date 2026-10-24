export type StageOverlay = "motion" | "transcript" | "developer" | "settings" | null;

export type StageMicrophoneState =
  | "idle"
  | "listening"
  | "capturing"
  | "processing"
  | "submitting"
  | "success"
  | "skipped"
  | "failed"
  | "unavailable";

export type StageMicrophoneControl = {
  ariaLabel: string;
  title: string;
  label: string;
  icon: "mic" | "stop" | "processing" | "unavailable";
  pressed: boolean;
  disabled: boolean;
  active: boolean;
};

export function getStageMicrophoneControl(
  state: StageMicrophoneState,
  captureActive: boolean,
  vadEnabled: boolean,
): StageMicrophoneControl {
  if (state === "unavailable") {
    return {
      ariaLabel: "Microphone unavailable",
      title: "麥克風不可用",
      label: "麥克風不可用",
      icon: "unavailable",
      pressed: false,
      disabled: true,
      active: false,
    };
  }

  if (captureActive && state === "capturing") {
    return {
      ariaLabel: "Stop recording",
      title: "停止錄音",
      label: "停止錄音",
      icon: "stop",
      pressed: true,
      disabled: false,
      active: true,
    };
  }

  if (captureActive) {
    return {
      ariaLabel: vadEnabled ? "Stop listening" : "Stop recording",
      title: vadEnabled ? "停止監聽" : "停止錄音",
      label: vadEnabled
        ? state === "processing"
          ? "正在辨識，停止監聽"
          : "停止監聽"
        : state === "processing"
          ? "正在辨識，停止錄音"
          : "停止錄音",
      icon: "stop",
      pressed: true,
      disabled: false,
      active: true,
    };
  }

  if (state === "processing" || state === "submitting") {
    return {
      ariaLabel: "Processing voice turn",
      title: "正在辨識",
      label: "正在辨識",
      icon: "processing",
      pressed: false,
      disabled: true,
      active: false,
    };
  }

  return {
    ariaLabel: vadEnabled ? "Start listening" : "Start recording",
    title: vadEnabled ? "開始監聽" : "開始錄音",
    label: vadEnabled ? "開始監聽" : "開始錄音",
    icon: "mic",
    pressed: false,
    disabled: false,
    active: false,
  };
}

export function getStageMicrophoneState(inputStatus: string, transcribing: boolean, captureEnabled: boolean): "idle" | "capturing" | "processing" | "unavailable" {
  if (inputStatus === "error") return "unavailable";
  if (transcribing) return "processing";
  return captureEnabled ? "capturing" : "idle";
}

export function getNextControlsExpanded(current: boolean): boolean {
  return !current;
}

export function getTopStageOverlay(open: { motion: boolean; transcript: boolean; developer: boolean; settings: boolean }): StageOverlay {
  if (open.motion) return "motion";
  if (open.transcript) return "transcript";
  if (open.developer) return "developer";
  if (open.settings) return "settings";
  return null;
}

export function shouldOpenTranscriptReview(lastHandledKey: string | null, completedCount: number, transcript: string | null): boolean {
  if (!transcript) return false;
  return lastHandledKey !== `${completedCount}:${transcript}`;
}

export function constrainStageMenuPosition(x: number, y: number, viewportWidth: number, viewportHeight: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, Math.max(8, viewportWidth - 220))),
    y: Math.max(8, Math.min(y, Math.max(8, viewportHeight - 160))),
  };
}
