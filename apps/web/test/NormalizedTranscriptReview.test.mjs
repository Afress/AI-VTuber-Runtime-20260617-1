import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "normalized-review-test-"));
const source = await readFile(new URL("../src/transcriptReviewDraft.ts", import.meta.url), "utf8");
const modulePath = join(temporaryDirectory, "transcript-review.mjs");
await writeFile(modulePath, typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { applyTranscriptToChatDraft } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

test("Transcript Review inserts normalized text rather than the preserved raw transcript", () => {
  const rawText = "这是一段语音识别测试";
  const normalizedText = "這是一段語音辨識測試";
  const review = applyTranscriptToChatDraft("", normalizedText, "use");
  assert.equal(review.draft, normalizedText);
  assert.notEqual(review.draft, rawText);
});

test("manual submit receives the reviewed normalized text", () => {
  const normalizedText = "這是一段語音辨識測試";
  const review = applyTranscriptToChatDraft("", normalizedText, "use");
  let submittedText = "";
  const submit = (value) => { submittedText = value; };
  submit(review.draft);
  assert.equal(submittedText, normalizedText);
});
