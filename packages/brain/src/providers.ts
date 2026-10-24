import type { ChatMessage } from "./types";

export interface ILLMProvider {
  chat(messages: ChatMessage[]): Promise<ChatMessage>;
  streamChat?(messages: ChatMessage[]): AsyncGenerator<string>;
}
