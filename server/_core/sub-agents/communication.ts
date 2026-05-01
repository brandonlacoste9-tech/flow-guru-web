import { BaseAgent, AgentContext } from "./base";
import { AssistantActionResult } from "../../api/lib/assistantActions";
import { Message, invokeLLM } from "../llm";
import { sendPushNotification } from "../push";

export class CommunicationAgent extends BaseAgent {
  name = "Communication Agent";
  description = "Specializes in proactive notifications, messaging, and system alerts.";
  tools = [
    {
      type: "function" as const,
      function: {
        name: "sendPush",
        description: "Send a push notification to the user's mobile or web device.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            tag: { type: "string", description: "Optional category or ID for the notification" },
          },
          required: ["title", "body"],
        },
      },
    },
  ];

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    // For reactive requests, we use the LLM to decide if it should send a push
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are the Flow Guru Communication Agent. 
          Your job is to decide if a push notification should be sent based on the user's request.
          If the user explicitly asks to be reminded or notified on their phone/device, call 'sendPush'.`,
        },
        ...history,
        { role: "user", content: query },
      ],
      tools: this.tools,
      tool_choice: "auto",
    });

    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "sendPush") {
      const args = JSON.parse(toolCall.function.arguments);
      await sendPushNotification(context.userId, {
        title: args.title,
        body: args.body,
        tag: args.tag,
      });

      return {
        action: "system.subagent",
        status: "executed",
        title: "Notification Sent",
        summary: `I've sent that push notification: "${args.title} - ${args.body}"`,
        data: args,
      };
    }

    return {
      action: "none",
      status: "executed",
      title: "Communication Agent Idle",
      summary: "I didn't find a reason to send a notification for this request.",
    };
  }

  /**
   * Proactive logic: analyzed state (calendar + tasks) to decide on a nudge.
   */
  async generateProactiveNudge(context: AgentContext, state: { events: any[], lists: any[] }): Promise<void> {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are the Flow Guru Communication Agent. 
          Analyze the user's current schedule and task lists. 
          If you see a significant gap in their schedule or an overdue/important task, generate a PROACTIVE NUDGE.
          
          RULES:
          1. Only nudge if it's high value.
          2. Be brief and supportive.
          3. Format your response as a JSON object: { "shouldNudge": boolean, "title": string, "body": string }
          
          Current Time: ${new Date().toISOString()}
          User Name: ${context.userName}
          Context: ${context.memoryContext}`,
        },
        {
          role: "user",
          content: `Schedule: ${JSON.stringify(state.events)}\nLists: ${JSON.stringify(state.lists)}`,
        },
      ],
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0]?.message.content;
    const result = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));

    if (result.shouldNudge) {
      await sendPushNotification(context.userId, {
        title: result.title,
        body: result.body,
        tag: "proactive-nudge",
      });
    }
  }
}
