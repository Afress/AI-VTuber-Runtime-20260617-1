export type TranscriptDraftAction = "use" | "append" | "replace";
export type TranscriptDraftReviewResult = {
  draft: string;
  changed: boolean;
  reason: "empty-transcript" | "inserted" | "requires-choice" | "appended" | "replaced" | "duplicate";
};

export function applyTranscriptToChatDraft(
  draft: string,
  transcript: string,
  action: TranscriptDraftAction,
): TranscriptDraftReviewResult {
  const nextTranscript = transcript.trim();
  if (!nextTranscript) return { draft, changed: false, reason: "empty-transcript" };
  if (!draft.trim()) return { draft: nextTranscript, changed: true, reason: "inserted" };
  if (sameText(draft, nextTranscript)) return { draft, changed: false, reason: "duplicate" };
  if (action === "use") return { draft, changed: false, reason: "requires-choice" };
  if (action === "append") {
    if (normalized(draft).endsWith(normalized(nextTranscript))) return { draft, changed: false, reason: "duplicate" };
    return { draft: `${draft}${/\s$/.test(draft) ? "" : " "}${nextTranscript}`, changed: true, reason: "appended" };
  }
  return { draft: nextTranscript, changed: true, reason: "replaced" };
}

function sameText(left: string, right: string): boolean { return normalized(left) === normalized(right); }
function normalized(value: string): string { return value.trim().replace(/\s+/g, " "); }
