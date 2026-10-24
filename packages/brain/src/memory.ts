import type { ChatMessage } from "./types";

export interface Memory {
  add(message: ChatMessage): void;
  getRecent(n: number): ChatMessage[];
  clear(): void;
}

export class InMemoryMemory implements Memory {
  private readonly messages: ChatMessage[] = [];

  add(message: ChatMessage) {
    this.messages.push({ ...message });
  }

  getRecent(n: number) {
    if (n <= 0) {
      return [];
    }

    return this.messages.slice(-n).map((message) => ({ ...message }));
  }

  clear() {
    this.messages.length = 0;
  }
}
