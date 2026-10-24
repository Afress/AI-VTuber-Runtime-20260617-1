import path from "node:path";

export const DESKTOP_PROTOCOL = "app";
export const DESKTOP_HOST = "runtime";
export const DESKTOP_ORIGIN = `${DESKTOP_PROTOCOL}://${DESKTOP_HOST}`;

export type RendererTarget =
  | { kind: "development"; url: string }
  | { kind: "production"; url: string };

export type DesktopRuntimeApi = Readonly<{
  isDesktop: true;
  platform: string;
  appVersion: string;
}>;

export function getRendererTarget(options: {
  isPackaged: boolean;
  rendererUrl?: string;
}): RendererTarget {
  if (!options.isPackaged) {
    const url = options.rendererUrl?.trim();
    if (!url) {
      throw new Error(
        "ELECTRON_RENDERER_URL is required in development. Start Vite first, then set it to its URL.",
      );
    }

    return { kind: "development", url };
  }

  return { kind: "production", url: `${DESKTOP_ORIGIN}/index.html` };
}

export function resolveProductionAssetPath(webBuildDir: string, requestPath: string): string | null {
  const requestedPath = requestPath === "/" ? "/index.html" : requestPath;
  if (requestedPath.split("/").some((segment) => segment === "..")) {
    return null;
  }
  const normalized = path.posix.normalize(requestedPath);
  if (normalized.startsWith("/..") || normalized.includes("\\")) {
    return null;
  }

  const candidate = path.resolve(webBuildDir, `.${normalized}`);
  const root = path.resolve(webBuildDir);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

export function resolveProductionFallbackPath(webBuildDir: string, requestPath: string): string | null {
  const assetPath = resolveProductionAssetPath(webBuildDir, requestPath);
  if (!assetPath) {
    return null;
  }

  return path.extname(assetPath) ? assetPath : path.join(webBuildDir, "index.html");
}

export function isApiRequestPath(requestPath: string): boolean {
  return requestPath === "/api" || requestPath.startsWith("/api/");
}

export function isTrustedRendererUrl(url: string, developmentUrl?: string): boolean {
  if (url.startsWith(`${DESKTOP_ORIGIN}/`)) {
    return true;
  }

  if (!developmentUrl) {
    return false;
  }

  try {
    return new URL(url).origin === new URL(developmentUrl).origin;
  } catch {
    return false;
  }
}

export function isMediaPermissionAllowed(permission: string, rendererUrl: string, developmentUrl?: string): boolean {
  return permission === "media" && isTrustedRendererUrl(rendererUrl, developmentUrl);
}

export function getDesktopRuntimeApi(platform: string, appVersion: string): DesktopRuntimeApi {
  return Object.freeze({ isDesktop: true as const, platform, appVersion });
}
