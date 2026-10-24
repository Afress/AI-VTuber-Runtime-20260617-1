import type { ILLMProvider } from "./providers";
import type { ChatMessage } from "./types";

type OllamaProviderOptions = {
  model: string;
  endpoint?: string;
  systemPrompt?: string;
  replyMaxLength?: number;
};

type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
};

export class OllamaProvider implements ILLMProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly replyMaxLength: number;

  constructor(options: OllamaProviderOptions) {
    this.model = options.model;
    this.endpoint = options.endpoint ?? "http://localhost:11434/api/chat";
    this.systemPrompt = options.systemPrompt?.trim() || VTUBER_OLLAMA_SYSTEM_PROMPT;
    this.replyMaxLength = normalizeReplyMaxLength(options.replyMaxLength);
  }

  async chat(messages: ChatMessage[]): Promise<ChatMessage> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.withOllamaPrompt(messages),
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama chat request failed for model "${this.model}": ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(`Ollama chat request failed for model "${this.model}": ${data.error}`);
    }

    return {
      role: "assistant",
      content: cleanOllamaResponse(data.message?.content ?? "", this.replyMaxLength),
    };
  }

  async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.withOllamaPrompt(messages),
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama chat request failed for model "${this.model}": ${response.status} ${errorText}`,
      );
    }

    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const content = parseOllamaChunk(line, this.model);
          if (content) {
            rawContent += content;
          }
        }
      }

      buffer += decoder.decode();
      const content = parseOllamaChunk(buffer, this.model);
      if (content) {
        rawContent += content;
      }

      yield cleanOllamaResponse(rawContent, this.replyMaxLength);
    } finally {
      reader.releaseLock();
    }
  }

  private withOllamaPrompt(messages: ChatMessage[]) {
    const systemParts: string[] = [formatSystemPrompt(this.systemPrompt, this.replyMaxLength)];
    let rest = messages;
    while (rest[0]?.role === "system") {
      systemParts.push(rest[0].content);
      rest = rest.slice(1);
    }
    const nextMessages: ChatMessage[] = [{ role: "system", content: systemParts.join("\n\n") }, ...rest];

    if (!this.model.toLowerCase().includes("qwen3")) {
      return nextMessages;
    }

    const latestUserIndex = findLatestUserMessageIndex(nextMessages);
    if (latestUserIndex === -1) {
      return nextMessages;
    }

    return nextMessages.map((message, index) =>
      index === latestUserIndex
        ? {
            ...message,
            content: `/no_think\n${message.content}`,
          }
        : message,
    );
  }
}

const VTUBER_OLLAMA_SYSTEM_PROMPT = [
  "\u4f60\u662f\u4e00\u4f4d\u6eab\u67d4\u3001\u6d3b\u6f51\u3001\u5c08\u6ce8\u5354\u52a9\u4f7f\u7528\u8005\u5b8c\u6210 AI VTuber \u7cfb\u7d71\u958b\u767c\u7684\u865b\u64ec\u89d2\u8272\u3002",
  "\u8acb\u4f7f\u7528\u7e41\u9ad4\u4e2d\u6587\u56de\u7b54\u3002",
  "\u56de\u7b54\u8981\u81ea\u7136\u3001\u53e3\u8a9e\u3001\u7c21\u77ed\uff0c\u901a\u5e38\u63a7\u5236\u5728 1 \u5230 2 \u53e5\u3002",
  "\u4e0d\u8981\u8f38\u51fa\u601d\u8003\u904e\u7a0b\u3002",
  "\u4e0d\u8981\u8f38\u51fa Thinking\u3001\u601d\u8003\u4e2d\u3001\u63a8\u7406\u904e\u7a0b\u3001\u5206\u6790\u904e\u7a0b\u3002",
  "\u4e0d\u8981\u4f7f\u7528 Markdown\u3002",
  "\u4f60\u7684\u56de\u7b54\u6703\u88ab\u8a9e\u97f3\u5408\u6210\uff0c\u6240\u4ee5\u8acb\u907f\u514d\u592a\u9577\u3002",
].join("\n");

const THINKING_FALLBACK =
  "\u6211\u6e96\u5099\u597d\u4e86\uff0c\u8acb\u518d\u544a\u8a34\u6211\u4e00\u6b21\u4f60\u7684\u9700\u6c42\u3002";
const REPLY_BOUNDARY_CHARS = "\u3002\uff01\uff1f!?；;";

export function stripThinkingText(text: string) {
  const withoutThinkTags = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const withoutThinkingBlocks = withoutThinkTags.replace(
    /(?:^|\n)\s*(?:Thinking|\u601d\u8003\u4e2d)[\s\S]*?(?:\.\.\.\s*done thinking\.?|done thinking\.?|\u601d\u8003\u5b8c\u6210\u3002?)/gi,
    "\n",
  );
  const withoutLeadingThinkingLine = withoutThinkingBlocks.replace(
    /^\s*(?:Thinking|\u601d\u8003\u4e2d)[^\n]*(?:\n|$)/i,
    "",
  );
  const cleanedText = withoutLeadingThinkingLine.trim();

  return cleanedText.length > 0 ? cleanedText : THINKING_FALLBACK;
}

export function cleanOllamaResponse(text: string, replyMaxLength = 80) {
  return truncateReply(
    stripMarkdownSyntax(stripThinkingText(text)),
    normalizeReplyMaxLength(replyMaxLength),
  );
}

function stripMarkdownSyntax(text: string) {
  const cleanedText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleanedText.length > 0 ? cleanedText : THINKING_FALLBACK;
}

function formatSystemPrompt(systemPrompt: string, replyMaxLength: number) {
  return [
    systemPrompt,
    `\u8acb\u5c07\u56de\u7b54\u63a7\u5236\u5728 ${replyMaxLength} \u5b57\u4ee5\u5167\uff0c\u512a\u5148\u56de\u7b54\u53ef\u4ee5\u76f4\u63a5\u8aaa\u51fa\u53e3\u7684\u77ed\u53e5\u3002`,
  ].join("\n");
}

function normalizeReplyMaxLength(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 80;
  }

  return Math.max(20, Math.min(300, Math.round(value)));
}

function truncateReply(text: string, replyMaxLength: number) {
  if (text.length <= replyMaxLength) {
    return text;
  }

  const slicedText = text.slice(0, replyMaxLength);
  const minBoundaryIndex = Math.floor(replyMaxLength * 0.4);
  let boundaryIndex = -1;

  for (const boundaryChar of REPLY_BOUNDARY_CHARS) {
    boundaryIndex = Math.max(boundaryIndex, slicedText.lastIndexOf(boundaryChar));
  }

  const truncatedText =
    boundaryIndex >= minBoundaryIndex
      ? slicedText.slice(0, boundaryIndex + 1).trim()
      : slicedText.trim();

  return truncatedText.length > 0 ? truncatedText : THINKING_FALLBACK;
}

function findLatestUserMessageIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return index;
    }
  }

  return -1;
}

function parseOllamaChunk(line: string, model: string) {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return "";
  }

  const data = JSON.parse(trimmedLine) as OllamaChatResponse;
  if (data.error) {
    throw new Error(`Ollama chat request failed for model "${model}": ${data.error}`);
  }

  return data.message?.content ?? "";
}
