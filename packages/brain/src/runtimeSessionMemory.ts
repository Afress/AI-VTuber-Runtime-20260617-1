export type RuntimeSessionMemory = {
  completedItems: string[];
  brainProvider: string;
  ttsProvider: string;
  characterName: string;
  lastError: string | null;
  lastSuccessfulTest: string | null;
  notes: string[];
};

export function createEmptyRuntimeSessionMemory(): RuntimeSessionMemory {
  return {
    completedItems: [],
    brainProvider: "",
    ttsProvider: "",
    characterName: "",
    lastError: null,
    lastSuccessfulTest: null,
    notes: [],
  };
}

export function formatRuntimeSessionMemorySummary(memory: RuntimeSessionMemory) {
  const lines = [
    formatListLine("Completed items", memory.completedItems),
    memory.brainProvider ? `Current Brain Provider: ${memory.brainProvider}` : "",
    memory.ttsProvider ? `Current TTS Provider: ${memory.ttsProvider}` : "",
    memory.characterName ? `Current Character Name: ${memory.characterName}` : "",
    memory.lastError ? `Last error: ${memory.lastError}` : "",
    memory.lastSuccessfulTest ? `Last successful test: ${memory.lastSuccessfulTest}` : "",
    formatListLine("Session notes", memory.notes),
  ].filter((line) => line.length > 0);

  return lines.length > 0 ? lines.join("\n") : "No runtime session memory yet.";
}

function formatListLine(label: string, values: string[]) {
  const normalizedValues = values.map((value) => value.trim()).filter((value) => value.length > 0);

  if (normalizedValues.length === 0) {
    return "";
  }

  return `${label}: ${normalizedValues.join("; ")}`;
}
