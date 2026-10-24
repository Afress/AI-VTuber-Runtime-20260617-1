import type { Emotion, EmotionMood } from "./emotion";

const emotionKeywordRules: Array<{
  mood: EmotionMood;
  keywords: string[];
}> = [
  {
    mood: "happy",
    keywords: ["開心", "太棒", "哈哈", "讚", "喜歡", "happy", "great", "awesome", "lol"],
  },
  {
    mood: "surprised",
    keywords: ["哇", "竟然", "真的假的", "驚訝", "surprised", "wow", "what"],
  },
  {
    mood: "sad",
    keywords: ["難過", "糟糕", "失敗", "哭", "sad", "bad", "sorry"],
  },
  {
    mood: "angry",
    keywords: ["生氣", "可惡", "討厭", "angry", "mad"],
  },
  {
    mood: "thinking",
    keywords: ["為什麼", "怎麼辦", "想一下", "maybe", "why", "how"],
  },
  {
    mood: "calm",
    keywords: ["沒關係", "慢慢來", "冷靜", "calm", "relax"],
  },
];

export function evaluateEmotionFromText(text: string): Emotion {
  const normalizedText = text.toLowerCase();
  const matchedRule = emotionKeywordRules.find((rule) =>
    rule.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())),
  );
  const emphasisScore = getEmphasisScore(text);
  const baseIntensity = matchedRule ? 0.6 : 0.25;

  return {
    mood: matchedRule?.mood ?? "neutral",
    intensity: clampIntensity(Math.max(baseIntensity, emphasisScore)),
  };
}

function getEmphasisScore(text: string) {
  const strongSymbolCount = [
    countOccurrences(text, "!"),
    countOccurrences(text, "！"),
    countOccurrences(text, "??"),
    countOccurrences(text, "？？"),
  ].reduce((total, count) => total + count, 0);

  if (strongSymbolCount >= 2) {
    return 0.9;
  }

  if (strongSymbolCount === 1) {
    return 0.75;
  }

  return 0;
}

function countOccurrences(text: string, pattern: string) {
  if (pattern.length === 0) {
    return 0;
  }

  return text.split(pattern).length - 1;
}

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0, intensity));
}
