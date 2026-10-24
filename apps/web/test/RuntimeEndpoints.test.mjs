import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "runtime-endpoints-test-"));
const source = await readFile(new URL("../src/runtimeEndpoints.ts", import.meta.url), "utf8");
const modulePath = join(temporaryDirectory, "runtime-endpoints.mjs");
await writeFile(
  modulePath,
  typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 },
  }).outputText,
  "utf8",
);
const { resolveRuntimeEndpoints } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

test("uses the Vite STT proxy for browser and Electron development renderers", () => {
  assert.equal(resolveRuntimeEndpoints({ isDesktop: false, protocol: "http:" }).localStt, "/api/local-stt");
  assert.equal(resolveRuntimeEndpoints({ isDesktop: true, protocol: "http:" }).localStt, "/api/local-stt");
});

test("uses the direct Local STT service for the packaged app protocol or desktop fallback", () => {
  const endpoints = resolveRuntimeEndpoints({ isDesktop: true, protocol: "app:" });
  assert.equal(endpoints.localStt, "http://127.0.0.1:7890");
  assert.equal(endpoints.tts, "http://localhost:7861/tts");
  assert.equal(endpoints.ollama, "http://localhost:11434");
  assert.equal(resolveRuntimeEndpoints({ isDesktop: true, protocol: "file:" }).localStt, "http://127.0.0.1:7890");
});
