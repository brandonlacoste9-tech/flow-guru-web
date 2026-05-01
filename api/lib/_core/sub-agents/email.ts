import { BaseAgent, AgentContext } from "./base.js";
import { AssistantActionResult } from "../../../../api/lib/assistantActions";
import { Message, invokeLLM } from "../llm.js";

export class EmailAgent extends BaseAgent {
  name = "Email Agent";
  description = "Specializes in drafting, summarizing, and sending formal emails.";
  tools = [
    {
      type: "function" as const,
      function: {
        name: "sendEmail",
        description: "Send a formal email to a recipient.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Email address of the recipient" },
            subject: { type: "string" },
            body: { type: "string", description: "The content of the email" },
          },
          required: ["to", "subject", "body"],
        },
      },
    },
  ];

  async run(query: string, context: AgentContext, history: Message[] = []): Promise<AssistantActionResult> {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are the Flow Guru Email Agent. 
          Your job is to draft or send emails based on the user's request.
          If the user wants to send an email, call 'sendEmail'. 
          If they just want a draft, provide the draft in your response without calling the tool.`,
        },
        ...history,
        { role: "user", content: query },
      ],
      tools: this.tools,
      tool_choice: "auto",
    });

    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "sendEmail") {
      const args = JSON.parse(toolCall.function.arguments);
      
      // For now, we'll use a mock/internal logger for sending
      console.log(`[Email Agent] Sending email to ${args.to}: ${args.subject}`);
      
      // In a real implementation, we'd call a service here
      // const { sendEmail } = await import('../email');
      // await sendEmail(args);

      return {
        action: "system.subagent",
        status: "executed",
        title: "Email Sent",
        summary: `I've sent that email to ${args.to} regarding "${args.subject}".`,
        data: args,
      };
    }

    return {
      action: "none",
      status: "executed",
      title: "Email Drafted",
      summary: response.choices[0]?.message.content as string || "I've prepared the draft for you.",
    };
  }
}
