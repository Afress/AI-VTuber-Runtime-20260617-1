import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "chinese-normalizer-test-"));
const source = await readFile(new URL("../src/chineseTranscriptNormalizer.ts", import.meta.url), "utf8");
const fixtureImport = `const Converter = () => (text) => ({
  "这是一段语音识别测试": "這是一段語音辨識測試",
  "软件、视频、鼠标": "軟體、影片、滑鼠",
}[text] ?? text);`;
const modulePath = join(temporaryDirectory, "chinese-normalizer.mjs");
await writeFile(modulePath, typescript.transpileModule(source.replace('import { Converter } from "opencc-js";', fixtureImport), { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { createTaiwanTraditionalTranscriptNormalizer, shouldNormalizeChineseTranscript } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

test("s2twp policy uses normalized Taiwan Traditional text only for Chinese", () => {
  const normalize = createTaiwanTraditionalTranscriptNormalizer();
  assert.deepEqual(normalize("这是一段语音识别测试", { detectedLanguage: "zh", configuredLanguage: "auto" }), { text: "這是一段語音辨識測試", rawText: "这是一段语音识别测试" });
  assert.deepEqual(normalize("软件、视频、鼠标", { detectedLanguage: "zh-CN" }), { text: "軟體、影片、滑鼠", rawText: "软件、视频、鼠标" });
  assert.equal(normalize("This is a test.", { detectedLanguage: "en" }).text, "This is a test.");
  assert.equal(normalize("音声認識のテストです", { detectedLanguage: "ja" }).text, "音声認識のテストです");
  assert.equal(normalize("", { detectedLanguage: "zh" }).text, "");
  assert.equal(shouldNormalizeChineseTranscript("zh-TW"), true);
  assert.equal(shouldNormalizeChineseTranscript("ko"), false);
});

test("conversion errors preserve raw text as a non-fatal warning", () => {
  const normalize = createTaiwanTraditionalTranscriptNormalizer(() => { throw new Error("converter unavailable"); });
  const result = normalize("这是一段语音识别测试", { detectedLanguage: "zh" });
  assert.equal(result.text, "这是一段语音识别测试");
  assert.equal(result.rawText, "这是一段语音识别测试");
  assert.match(result.warning, /Traditional Chinese normalization unavailable/);
});
