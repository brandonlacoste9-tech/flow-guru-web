import { CalendarAgent } from "./calendar.js";
import { TaskAgent } from "./task.js";
import { CommunicationAgent } from "./communication.js";
import { ResearchAgent } from "./research.js";
import { EmailAgent } from "./email.js";
import { BaseAgent, AgentContext } from "./base";
import { invokeLLM, Message } from "../_core/llm";
import { AssistantActionResult } from "../../api/lib/assistantActions";

export class MasterOrchestrator {
  private agents: Record<string, BaseAgent> = {
    calendar: new CalendarAgent(),
    task: new TaskAgent(),
    communication: new CommunicationAgent(),
    research: new ResearchAgent(),
    email: new EmailAgent(),
  };

  async route(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult[]> {
    // 1. Identify which agents are needed using the LLM
    const identificationResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are the Flow Guru Orchestrator. Your job is to delegate the user's request to specialized sub-agents.
          
AVAILABLE AGENTS:
- calendar: Handles scheduling, appointments, checking availability.
- task: Handles lists (grocery, todo), reminders, and chores.
- communication: Handles sending push notifications, reminders, and proactive alerts to the user's phone or device.
- research: Handles fetching real-time information, weather, news, and general knowledge questions.
- email: Handles drafting, summarizing, and sending formal emails.

RESPONSE FORMAT: Return a JSON object with an "agents" key containing an array of agent names to invoke.
Example: { "agents": ["calendar"] } or { "agents": ["calendar", "email"] }.
If no agent fits, return { "agents": [] }.`,
        },
        {
          role: "user",
          content: `Query: ${query}`,
        },
      ],
      response_format: { type: "json_object" }
    });

    const rawContent = identificationResponse.choices[0]?.message.content;
    const contentText = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    
    let agentNames: string[] = [];
    try {
      const parsed = JSON.parse(contentText);
      agentNames = Array.isArray(parsed) ? parsed : parsed.agents || [];
    } catch (e) {
      // Fallback: heuristic search if JSON fails
      if (query.toLowerCase().includes("calendar") || query.toLowerCase().includes("book") || query.toLowerCase().includes("schedule")) agentNames.push("calendar");
      if (query.toLowerCase().includes("list") || query.toLowerCase().includes("todo") || query.toLowerCase().includes("reminder")) agentNames.push("task");
    }

    // 2. Invoke selected agents in parallel
    const uniqueNames = [...new Set(agentNames)].filter(name => this.agents[name]);
    
    if (uniqueNames.length === 0) {
        // Default to a generic plan if no sub-agent is clearly identified
        // Or we could have a 'GeneralAgent'
        return [];
    }

    const results = await Promise.all(
      uniqueNames.map(name => this.agents[name].run(query, context, history))
    );

    return results;
  }
}
