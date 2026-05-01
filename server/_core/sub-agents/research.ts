import { BaseAgent, AgentContext } from "./base";
import { AssistantActionResult, planAssistantAction, executeAssistantAction } from "../../../api/lib/assistantActions";
import { Message } from "../llm";

export class ResearchAgent extends BaseAgent {
  name = "Research Agent";
  description = "Specializes in fetching real-time information, including weather, news, and general knowledge.";
  tools = [];

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    const plan = await planAssistantAction({
      userName: context.userName,
      memoryContext: context.memoryContext,
      message: query,
      language: context.language,
    });

    // Ensure we only handle research-related tasks
    if (!["weather.get", "news.get", "browser.use"].includes(plan.action)) {
      // If the orchestrator routed incorrectly, we could either handle it or return 'none'
      // For now, we'll try to execute anyway to be helpful.
    }

    return await executeAssistantAction(plan, {
      userId: context.userId,
      userName: context.userName,
      message: query,
      memoryContext: context.memoryContext,
      timeZone: context.timeZone,
      language: context.language,
    });
  }
}
