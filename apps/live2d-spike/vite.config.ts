import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type PreviewServer, type ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const live2dAssetRoot = path.resolve(__dirname, "../web/public/live2d");

export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: "serve-web-live2d-assets",
      configureServer(server) {
        installLive2dAssetMiddleware(server);
      },
      configurePreviewServer(server) {
        installLive2dAssetMiddleware(server);
      },
    },
  ],
});

function installLive2dAssetMiddleware(server: ViteDevServer | PreviewServer) {
  server.middlewares.use("/live2d", (request, response, next) => {
    if (!request.url) {
      next();
      return;
    }

    const requestedPath = safeResolveLive2dPath(request.url);
    if (!requestedPath) {
      response.statusCode = 403;
      response.end("Forbidden");
      return;
    }

    if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
      response.statusCode = 404;
      response.end("Live2D asset not found");
      return;
    }

    response.setHeader("Content-Type", getContentType(requestedPath));
    createReadStream(requestedPath).pipe(response);
  });
}

function safeResolveLive2dPath(requestUrl: string) {
  const pathname = decodeURIComponent(requestUrl.split("?")[0] ?? "");
  const relativePath = pathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(live2dAssetRoot, relativePath);

  if (resolvedPath !== live2dAssetRoot && !resolvedPath.startsWith(live2dAssetRoot + path.sep)) {
    return null;
  }

  return resolvedPath;
}

function getContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".moc3":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}
