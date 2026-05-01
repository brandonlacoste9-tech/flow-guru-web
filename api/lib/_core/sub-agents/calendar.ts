import { BaseAgent, AgentContext } from "./base.js";
import { AssistantActionResult, planAssistantAction, executeAssistantAction } from "../../assistantActions.js";
import { Message } from "../llm.js";

export class CalendarAgent extends BaseAgent {
  name = "Calendar Guru";
  description = "Specializes in managing schedules, booking events, and checking availability.";
  tools = []; // We can define specific LLM tools here later if we use native tool calling

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    // For now, we reuse the existing planner and executor but scoped to calendar tasks
    const plan = await planAssistantAction({
      userName: context.userName,
      memoryContext: context.memoryContext,
      message: query,
      language: context.language,
    });

    // If the planner picks something NOT calendar related, we should probably handle that
    // but in a federated model, the Orchestrator only calls this if it knows it's calendar related.
    
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
