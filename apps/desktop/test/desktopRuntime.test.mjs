import assert from "node:assert/strict";
import test from "node:test";
import {
  DESKTOP_ORIGIN,
  getDesktopRuntimeApi,
  getRendererTarget,
  isApiRequestPath,
  isMediaPermissionAllowed,
  isTrustedRendererUrl,
  resolveProductionAssetPath,
  resolveProductionFallbackPath,
} from "../dist/runtimeConfig.js";

test("chooses the configured Vite URL in development", () => {
  assert.deepEqual(getRendererTarget({ isPackaged: false, rendererUrl: "http://localhost:5173" }), {
    kind: "development",
    url: "http://localhost:5173",
  });
  assert.throws(() => getRendererTarget({ isPackaged: false }), /ELECTRON_RENDERER_URL/);
});

test("chooses the app protocol in production", () => {
  assert.deepEqual(getRendererTarget({ isPackaged: true }), {
    kind: "production",
    url: `${DESKTOP_ORIGIN}/index.html`,
  });
});

test("exposes only the minimal preload API shape", () => {
  assert.deepEqual(getDesktopRuntimeApi("win32", "30.5.1"), {
    isDesktop: true,
    platform: "win32",
    appVersion: "30.5.1",
  });
});

test("blocks untrusted navigation and media permission origins", () => {
  const devUrl = "http://localhost:5173";
  assert.equal(isTrustedRendererUrl(`${DESKTOP_ORIGIN}/index.html`, devUrl), true);
  assert.equal(isTrustedRendererUrl("http://localhost:5173/settings", devUrl), true);
  assert.equal(isTrustedRendererUrl("https://example.com", devUrl), false);
  assert.equal(isMediaPermissionAllowed("media", `${DESKTOP_ORIGIN}/index.html`, devUrl), true);
  assert.equal(isMediaPermissionAllowed("notifications", `${DESKTOP_ORIGIN}/index.html`, devUrl), false);
  assert.equal(isMediaPermissionAllowed("media", "https://example.com", devUrl), false);
});

test("resolves production assets without allowing traversal and falls back for routes", () => {
  const root = "C:\\runtime\\web";
  assert.equal(resolveProductionAssetPath(root, "/assets/app.js"), "C:\\runtime\\web\\assets\\app.js");
  assert.equal(resolveProductionAssetPath(root, "/../../secret.txt"), null);
  assert.equal(resolveProductionFallbackPath(root, "/chat"), "C:\\runtime\\web\\index.html");
  assert.equal(isApiRequestPath("/api/local-stt/health"), true);
  assert.equal(isApiRequestPath("/assets/app.js"), false);
});
