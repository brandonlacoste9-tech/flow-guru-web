import { Tool, AssistantActionResult } from "../../assistantActions.js";
import { invokeLLM, Message } from "../llm.js";

export interface AgentContext {
  userId: number;
  userName: string;
  memoryContext: string;
  timeZone?: string | null;
  language: 'en' | 'fr';
  deviceLatitude?: number;
  deviceLongitude?: number;
}

export abstract class BaseAgent {
  abstract name: string;
  abstract description: string;
  abstract tools: Tool[];

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    // Default implementation: just call the tool logic
    // Subclasses can override this for more complex multi-step reasoning
    throw new Error("Method not implemented.");
  }
}
