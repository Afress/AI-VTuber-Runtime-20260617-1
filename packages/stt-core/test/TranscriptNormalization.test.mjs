import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "transcript-normalization-test-"));
const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const modulePath = join(temporaryDirectory, "stt-core.mjs");
await writeFile(modulePath, typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { SpeechRecognitionService } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

function wav() {
  const buffer = new ArrayBuffer(48);
  const view = new DataView(buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"]]) for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint16(34, 16, true);
  return buffer;
}

function segment(id) {
  return { metadata: { segmentId: id, durationMs: 800, sampleRate: 16000, channelCount: 1, endReason: "silence", vadValidSpeech: true, truncated: false }, wav: wav() };
}

function createService(text, language, normalizer, configuredLanguage = "auto") {
  return new SpeechRecognitionService(
    { providerId: "test", async transcribe(request) { return { requestId: request.requestId, segmentId: request.segmentId, text, language, processingTimeMs: 1, provider: "test" }; } },
    { transcriptNormalizer: normalizer },
  ).transcribeSegment(segment(`segment-${language || "unknown"}`), { language: configuredLanguage });
}

const taiwanFixtureNormalizer = (text, context) => {
  if (!/^zh(?:[-_]|$)/i.test(context.detectedLanguage || context.configuredLanguage || "")) return { text, rawText: text };
  const conversions = {
    "这是一段语音识别测试": "這是一段語音辨識測試",
    "软件、视频、鼠标": "軟體、影片、滑鼠",
  };
  return { text: conversions[text] || text, rawText: text };
};

test("Chinese normalization preserves raw text and exposes the Taiwan Traditional result", async () => {
  const result = await createService("这是一段语音识别测试", "zh", taiwanFixtureNormalizer);
  assert.equal(result.rawText, "这是一段语音识别测试");
  assert.equal(result.text, "這是一段語音辨識測試");
});

test("Taiwan phrase conversion remains available through the normalizer hook", async () => {
  const result = await createService("软件、视频、鼠标", "zh-CN", taiwanFixtureNormalizer);
  assert.equal(result.text, "軟體、影片、滑鼠");
});

test("Traditional Chinese, English, Japanese, and empty text do not receive destructive conversion", async () => {
  const traditional = await createService("這是一段語音辨識測試", "zh-TW", taiwanFixtureNormalizer);
  const english = await createService("This is a test.", "en", taiwanFixtureNormalizer);
  const japanese = await createService("音声認識のテストです", "ja", taiwanFixtureNormalizer);
  assert.equal(traditional.text, "這是一段語音辨識測試");
  assert.equal(english.text, "This is a test.");
  assert.equal(japanese.text, "音声認識のテストです");
  assert.deepEqual(taiwanFixtureNormalizer("", { detectedLanguage: "zh" }), { text: "", rawText: "" });
});

test("normalizer failure falls back to raw text without failing STT", async () => {
  const result = await createService("这是一段语音识别测试", "zh", () => { throw new Error("fixture unavailable"); });
  assert.equal(result.text, "这是一段语音识别测试");
  assert.equal(result.rawText, "这是一段语音识别测试");
  assert.match(result.normalizationWarning, /Transcript normalization failed/);
});
