export type VoiceTurnSkipReason = "empty-transcript" | "duplicate" | "draft-not-empty" | "chat-busy";

export type VoiceTurnGateInput = {
  text: string;
  segmentId: string;
  requestId: string;
  chatDraft: string;
  chatBusy: boolean;
  submittedKeys: readonly string[];
};

export type VoiceTurnGateResult =
  | { allowed: true; key: string }
  | { allowed: false; key: string; reason: VoiceTurnSkipReason };

export function createVoiceTurnKey(segmentId: string, requestId: string): string {
  return `${segmentId}:${requestId}`;
}

export function evaluateVoiceTurnSubmission(input: VoiceTurnGateInput): VoiceTurnGateResult {
  const key = createVoiceTurnKey(input.segmentId, input.requestId);
  if (!input.text.trim()) return { allowed: false, key, reason: "empty-transcript" };
  if (input.submittedKeys.includes(key)) return { allowed: false, key, reason: "duplicate" };
  if (input.chatDraft.trim()) return { allowed: false, key, reason: "draft-not-empty" };
  if (input.chatBusy) return { allowed: false, key, reason: "chat-busy" };
  return { allowed: true, key };
}

export function addBoundedVoiceTurnKey(keys: readonly string[], key: string, maximum = 50): string[] {
  return [...keys, key].slice(-maximum);
}
