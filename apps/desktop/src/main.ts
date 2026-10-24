import { app, BrowserWindow, net, protocol, session } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DESKTOP_HOST,
  DESKTOP_PROTOCOL,
  getRendererTarget,
  isApiRequestPath,
  isMediaPermissionAllowed,
  isTrustedRendererUrl,
  type RendererTarget,
  resolveProductionFallbackPath,
} from "./runtimeConfig";

protocol.registerSchemesAsPrivileged([
  {
    scheme: DESKTOP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function getWebBuildDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "../../web/dist");
}

function registerProductionProtocol(): void {
  protocol.handle(DESKTOP_PROTOCOL, async (request) => {
    const url = new URL(request.url);
    if (url.host !== DESKTOP_HOST) {
      return new Response("Not found", { status: 404 });
    }

    let requestPath: string;
    try {
      requestPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    if (isApiRequestPath(requestPath)) {
      return new Response("API routes are unavailable from the packaged renderer", { status: 404 });
    }

    const target = resolveProductionFallbackPath(getWebBuildDir(), requestPath);
    if (!target || !existsSync(target)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(target).toString());
  });
}

function configureSessionPermissions(developmentUrl?: string): void {
  const defaultSession = session.defaultSession;
  const isAllowed = (permission: string, requestingUrl: string) =>
    isMediaPermissionAllowed(permission, requestingUrl, developmentUrl);

  defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isAllowed(permission, requestingOrigin),
  );
  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isAllowed(permission, webContents.getURL()));
  });
}

function createWindow(): BrowserWindow {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: [`--desktop-app-version=${app.getVersion()}`],
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, developmentUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    if (errorCode !== -3) {
      console.error("[Desktop] renderer load failed", { errorCode, errorDescription, validatedUrl });
    }
  });

  let rendererTarget: RendererTarget;
  try {
    rendererTarget = getRendererTarget({
      isPackaged: app.isPackaged,
      rendererUrl: developmentUrl,
    });
  } catch (error) {
    console.error("[Desktop] renderer configuration failed", error);
    void window.loadURL(
      `data:text/html,${encodeURIComponent(`<main><h1>Desktop renderer unavailable</h1><pre>${String(error)}</pre></main>`)}`,
    );
    return window;
  }

  void window.loadURL(rendererTarget.url).catch((error) => {
    console.error("[Desktop] unable to load renderer", error);
    void window.loadURL(
      `data:text/html,${encodeURIComponent(`<main><h1>Desktop renderer unavailable</h1><pre>${String(error)}</pre></main>`)}`,
    );
  });

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

app.whenReady().then(() => {
  registerProductionProtocol();
  configureSessionPermissions(process.env.ELECTRON_RENDERER_URL);
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
