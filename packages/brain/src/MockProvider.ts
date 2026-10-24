import type { ChatMessage } from "./types";
import type { ILLMProvider } from "./providers";

export class MockProvider implements ILLMProvider {
  constructor(private readonly response = "Mock response") {}

  async chat(messages: ChatMessage[]): Promise<ChatMessage> {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

    return {
      role: "assistant",
      content: lastUserMessage ? `${this.response}: ${lastUserMessage.content}` : this.response,
    };
  }
}
