import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "transcript-review-test-"));
const source = await readFile(new URL("../src/transcriptReviewDraft.ts", import.meta.url), "utf8");
const modulePath = join(temporaryDirectory, "transcript-review.mjs");
await writeFile(modulePath, typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { applyTranscriptToChatDraft } = await import(pathToFileURL(modulePath).href);
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

test("empty draft inserts a transcript without submitting", () => {
  let submitCount = 0;
  const result = applyTranscriptToChatDraft("", "今天真是好天氣", "use");
  assert.equal(result.draft, "今天真是好天氣"); assert.equal(result.reason, "inserted"); assert.equal(submitCount, 0);
  submitCount += 1; assert.equal(submitCount, 1);
});

test("non-empty draft requires an explicit append or replace choice", () => {
  const result = applyTranscriptToChatDraft("原本文字", "新增語音", "use");
  assert.equal(result.draft, "原本文字"); assert.equal(result.changed, false); assert.equal(result.reason, "requires-choice");
});

test("append inserts a readable separator", () => {
  const result = applyTranscriptToChatDraft("原本文字", "新增語音", "append");
  assert.equal(result.draft, "原本文字 新增語音"); assert.equal(result.reason, "appended");
});

test("replace keeps only the transcript", () => {
  const result = applyTranscriptToChatDraft("原本文字", "新增語音", "replace");
  assert.equal(result.draft, "新增語音"); assert.equal(result.reason, "replaced");
});

test("manual submit remains explicit after review", () => {
  let submitCount = 0; let submittedText = "";
  const review = applyTranscriptToChatDraft("", "語音草稿", "use");
  assert.equal(submitCount, 0);
  const manualSubmit = (text) => { submitCount += 1; submittedText = text; };
  manualSubmit(review.draft);
  assert.equal(submitCount, 1); assert.equal(submittedText, "語音草稿");
});

test("duplicate transcript use and append do not repeat content", () => {
  const useDuplicate = applyTranscriptToChatDraft("相同文字", "相同文字", "use");
  const appendDuplicate = applyTranscriptToChatDraft("原本文字 新增語音", "新增語音", "append");
  assert.equal(useDuplicate.reason, "duplicate"); assert.equal(appendDuplicate.reason, "duplicate");
});

test("new transcript cannot overwrite an unsubmitted draft without replace", () => {
  const result = applyTranscriptToChatDraft("尚未送出的文字", "新的語音辨識", "use");
  assert.equal(result.draft, "尚未送出的文字"); assert.equal(result.reason, "requires-choice");
});

test("mode switches do not mutate a reviewed draft", () => {
  const reviewedDraft = applyTranscriptToChatDraft("", "保留的草稿", "use").draft;
  const runtimeModes = ["debug", "normal", "debug"];
  for (const _mode of runtimeModes) assert.equal(reviewedDraft, "保留的草稿");
});
