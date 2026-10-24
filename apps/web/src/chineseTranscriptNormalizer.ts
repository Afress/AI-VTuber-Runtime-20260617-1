import { Converter } from "opencc-js";
import type { TranscriptNormalizer } from "@runtime/stt-core";

type TextConverter = (text: string) => string;

const taiwanTraditionalConverter = Converter({ from: "cn", to: "twp" }) as TextConverter;

export function shouldNormalizeChineseTranscript(
  detectedLanguage?: string,
  configuredLanguage?: string,
): boolean {
  return isChineseLanguage(detectedLanguage) || isChineseLanguage(configuredLanguage);
}

export function createTaiwanTraditionalTranscriptNormalizer(
  converter: TextConverter = taiwanTraditionalConverter,
): TranscriptNormalizer {
  return (text, context) => {
    if (!text || !shouldNormalizeChineseTranscript(context.detectedLanguage, context.configuredLanguage)) {
      return { text, rawText: text };
    }

    try {
      return { text: converter(text), rawText: text };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        text,
        rawText: text,
        warning: `Traditional Chinese normalization unavailable: ${detail.replace(/\s+/g, " ").slice(0, 160)}`,
      };
    }
  };
}

export const taiwanTraditionalTranscriptNormalizer = createTaiwanTraditionalTranscriptNormalizer();

function isChineseLanguage(value?: string): boolean {
  return /^zh(?:[-_]|$)/i.test(value?.trim() ?? "");
}
