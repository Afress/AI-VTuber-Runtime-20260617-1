import type { ChatMessage } from "./types";
import type { ILLMProvider } from "./providers";
import { InMemoryMemory, type Memory } from "./memory";
import { defaultPersonality, type Personality } from "./personality";
import { defaultEmotion, type Emotion } from "./emotion";
import { defaultBodyState, type BodyState } from "./bodyState";
import { evaluateEmotionFromText } from "./emotionEvaluator";

type BrainOptions = {
  memory?: Memory;
  memoryContextSize?: number;
  personality?: Personality;
  emotion?: Emotion;
  bodyState?: BodyState;
};

type BrainState = {
  memory: ChatMessage[];
  emotion: Emotion;
  bodyState: BodyState;
};

export class Brain {
  private readonly memory: Memory;
  private readonly memoryContextSize: number;
  private readonly personality: Personality;
  private emotion: Emotion;
  private bodyState: BodyState;

  constructor(
    private readonly llmProvider: ILLMProvider,
    options: BrainOptions = {},
  ) {
    this.memory = options.memory ?? new InMemoryMemory();
    this.memoryContextSize = options.memoryContextSize ?? 10;
    this.personality = options.personality ?? defaultPersonality;
    this.emotion = normalizeEmotion(options.emotion ?? defaultEmotion);
    this.bodyState = options.bodyState ?? defaultBodyState;
  }

  async chat(messages: ChatMessage[]) {
    this.bodyState = "thinking";
    const reply = await this.llmProvider.chat(this.withMemoryContext(messages));
    this.rememberExchange(messages, reply);
    this.updateEmotion(messages, reply);
    this.updateBodyState(reply);
    return reply;
  }

  async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    this.bodyState = "thinking";
    const messagesWithMemory = this.withMemoryContext(messages);

    if (this.llmProvider.streamChat) {
      let content = "";

      for await (const chunk of this.llmProvider.streamChat(messagesWithMemory)) {
        content += chunk;
        this.bodyState = "talking";
        yield chunk;
      }

      const reply: ChatMessage = {
        role: "assistant",
        content,
      };

      this.rememberExchange(messages, reply);
      this.updateEmotion(messages, reply);
      this.updateBodyState(reply);
      return;
    }

    const reply = await this.chat(messages);
    yield reply.content;
  }

  clearMemory() {
    this.memory.clear();
  }

  getState(): BrainState {
    return {
      memory: this.memory.getRecent(this.memoryContextSize),
      emotion: { ...this.emotion },
      bodyState: this.bodyState,
    };
  }

  private withMemoryContext(messages: ChatMessage[]) {
    const recentMemory = this.memory.getRecent(this.memoryContextSize);
    const systemPrompt = formatSystemPrompt(this.personality, recentMemory, this.emotion);

    if (!systemPrompt) {
      return messages;
    }

    return [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages,
    ] satisfies ChatMessage[];
  }

  private rememberExchange(messages: ChatMessage[], reply: ChatMessage) {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (latestUserMessage) {
      this.memory.add(latestUserMessage);
    }

    this.memory.add(reply);
  }

  private updateEmotion(messages: ChatMessage[], reply: ChatMessage) {
    const latestUserMessage = getLatestUserMessage(messages);
    this.emotion = evaluateEmotionFromText(
      [latestUserMessage?.content, reply.content].filter(Boolean).join("\n"),
    );
  }

  private updateBodyState(reply: ChatMessage) {
    this.bodyState = inferBodyState(this.emotion, reply.content);
  }
}

function formatSystemPrompt(
  personality: Personality,
  memoryMessages: ChatMessage[],
  emotion: Emotion,
) {
  const sections = [
    formatPersonalityContext(personality),
    formatEmotionContext(emotion),
    formatMemoryContext(memoryMessages),
  ].filter((section) => section.length > 0);

  return sections.join("\n\n");
}

function formatPersonalityContext(personality: Personality) {
  const sections = [];

  if (personality.name) {
    sections.push(`Name: ${personality.name}`);
  }

  if (personality.systemPrompt) {
    sections.push(personality.systemPrompt);
  }

  if (personality.styleRules.length > 0) {
    sections.push(`Style rules:\n${personality.styleRules.map((rule) => `- ${rule}`).join("\n")}`);
  }

  return sections.join("\n");
}

function formatEmotionContext(emotion: Emotion) {
  return [
    `Current emotion: ${emotion.mood} (${emotion.intensity.toFixed(2)})`,
    `Tone modifier: ${formatToneModifier(emotion)}`,
    `Response style rules:\n${formatEmotionStyleRules(emotion).map((rule) => `- ${rule}`).join("\n")}`,
  ].join("\n");
}

function formatMemoryContext(messages: ChatMessage[]) {
  if (messages.length === 0) {
    return "";
  }

  const transcript = messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return `Recent memory:\n${transcript}`;
}

function formatToneModifier(emotion: Emotion) {
  if (emotion.mood === "happy") {
    return "warm and upbeat";
  }

  if (emotion.mood === "thinking") {
    return "careful and reflective";
  }

  if (emotion.mood === "surprised") {
    return "alert and curious";
  }

  return "balanced and calm";
}

function formatEmotionStyleRules(emotion: Emotion) {
  const intensity = emotion.intensity.toFixed(2);

  if (emotion.mood === "happy") {
    return [`Let warmth show with intensity ${intensity}.`, "Keep the reply grounded and useful."];
  }

  if (emotion.mood === "thinking") {
    return [`Use a thoughtful pace with intensity ${intensity}.`, "Prefer clarity over flourish."];
  }

  if (emotion.mood === "surprised") {
    return [`Allow curiosity with intensity ${intensity}.`, "Do not overreact."];
  }

  return [`Stay neutral with intensity ${intensity}.`, "Use plain, steady wording."];
}

function normalizeEmotion(emotion: Emotion): Emotion {
  return {
    mood: emotion.mood,
    intensity: clampIntensity(emotion.intensity),
  };
}

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0, intensity));
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function inferBodyState(emotion: Emotion, content: string): BodyState {
  if (emotion.mood === "surprised" || emotion.intensity >= 0.7 || content.includes("!")) {
    return "reacting";
  }

  if (content.trim().length > 0) {
    return "talking";
  }

  return "idle";
}
