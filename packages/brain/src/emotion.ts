export type EmotionMood =
  | "neutral"
  | "happy"
  | "surprised"
  | "sad"
  | "angry"
  | "thinking"
  | "calm";

export type Emotion = {
  mood: EmotionMood;
  intensity: number;
};

export const defaultEmotion: Emotion = {
  mood: "neutral",
  intensity: 0,
};
