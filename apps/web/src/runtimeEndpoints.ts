export type DesktopRuntimeInfo = Readonly<{
  isDesktop: true;
  platform: string;
  appVersion: string;
}>;

declare global {
  interface Window {
    desktopRuntime?: DesktopRuntimeInfo;
  }
}

export type RuntimeEndpoints = Readonly<{
  localStt: string;
  tts: string;
  ollama: string;
}>;

export type RuntimeEndpointEnvironment = Readonly<{
  isDesktop: boolean;
  protocol: string;
}>;

const WEB_ENDPOINTS: RuntimeEndpoints = {
  localStt: "/api/local-stt",
  tts: "/api/tts",
  ollama: "/api/chat",
};

const DESKTOP_ENDPOINTS: RuntimeEndpoints = {
  localStt: "http://127.0.0.1:7890",
  tts: "http://localhost:7861/tts",
  ollama: "http://localhost:11434",
};

export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && window.desktopRuntime?.isDesktop === true;
}

export function resolveRuntimeEndpoints(
  environment: RuntimeEndpointEnvironment = {
    isDesktop: isDesktopRuntime(),
    protocol: typeof window === "undefined" ? "" : window.location.protocol,
  },
): RuntimeEndpoints {
  const isWebRenderer = environment.protocol === "http:" || environment.protocol === "https:";
  const isPackagedDesktopRenderer = environment.protocol === "app:" || (environment.isDesktop && !isWebRenderer);
  return isPackagedDesktopRenderer ? DESKTOP_ENDPOINTS : WEB_ENDPOINTS;
}
