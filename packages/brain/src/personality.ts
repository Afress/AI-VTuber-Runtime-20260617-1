export interface Personality {
  name: string;
  systemPrompt: string;
  styleRules: string[];
}

export const defaultPersonality: Personality = {
  name: "",
  systemPrompt: "",
  styleRules: [],
};
