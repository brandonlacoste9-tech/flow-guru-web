import { BaseAgent, AgentContext } from "./base.js";
import { AssistantActionResult, planAssistantAction, executeAssistantAction } from "../../assistantActions.js";
import { Message } from "../llm.js";

export class TaskAgent extends BaseAgent {
  name = "Task Master";
  description = "Specializes in managing todos, shopping lists, and reminders.";
  tools = [];

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    const plan = await planAssistantAction({
      userName: context.userName,
      memoryContext: context.memoryContext,
      message: query,
      language: context.language,
    });

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
