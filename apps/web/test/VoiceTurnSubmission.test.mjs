import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js";

const directory = await mkdtemp(join(tmpdir(), "voice-turn-test-"));
const source = await readFile(new URL("../src/voiceTurnSubmission.ts", import.meta.url), "utf8");
const modulePath = join(directory, "voice-turn.mjs");
await writeFile(modulePath, typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2020 } }).outputText, "utf8");
const { addBoundedVoiceTurnKey, evaluateVoiceTurnSubmission } = await import(pathToFileURL(modulePath).href);
after(() => rm(directory, { recursive: true, force: true }));

const base = { text: "這是繁體中文語音辨識測試", segmentId: "segment-A", requestId: "request-A", chatDraft: "", chatBusy: false, submittedKeys: [] };

test("valid VAD/manual transcript submits exactly once with normalized text", () => {
  const first = evaluateVoiceTurnSubmission(base);
  assert.deepEqual(first, { allowed: true, key: "segment-A:request-A" });
  const keys = addBoundedVoiceTurnKey([], first.key);
  assert.equal(evaluateVoiceTurnSubmission({ ...base, submittedKeys: keys }).reason, "duplicate");
  assert.equal(evaluateVoiceTurnSubmission({ ...base, segmentId: "segment-B", requestId: "request-B" }).allowed, true);
});

test("empty, draft, and busy gates skip without a queue", () => {
  assert.equal(evaluateVoiceTurnSubmission({ ...base, text: "  " }).reason, "empty-transcript");
  assert.equal(evaluateVoiceTurnSubmission({ ...base, chatDraft: "未送出草稿" }).reason, "draft-not-empty");
  assert.equal(evaluateVoiceTurnSubmission({ ...base, chatBusy: true }).reason, "chat-busy");
  assert.equal(addBoundedVoiceTurnKey(Array.from({ length: 50 }, (_, index) => String(index)), "new").length, 50);
});
