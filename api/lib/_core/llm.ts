import { ENV } from "./env.js";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  if (ENV.deepSeekApiKey) return "https://api.deepseek.com/v1/chat/completions";
  if (ENV.moonshotApiKey) return "https://api.moonshot.ai/v1/chat/completions";
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const assertApiKey = () => {
  if (!ENV.forgeApiKey && !process.env.DEEPSEEK_API_KEY) {
    throw new Error("API Key is not configured. Please set BUILT_IN_FORGE_API_KEY or DEEPSEEK_API_KEY.");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const hasDeepSeek = ENV.deepSeekApiKey && ENV.deepSeekApiKey.trim().length > 0;
  const hasMoonshot = ENV.moonshotApiKey && ENV.moonshotApiKey.trim().length > 0;
  const hasForge = ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0;

  // --- Creative Mock Fallback ---
  // Simulation Mode Removed as requested. proceeding to real API calls.

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // Define providers in order of priority
  // Forge (Manus proxy) first as most reliable, then Moonshot, then DeepSeek as fallbacks.
  const providers = [];
  if (ENV.useLocalAi) providers.push({ name: "localai", model: "gpt-4", key: "none", url: `${ENV.localAiUrl}/v1/chat/completions` });
  if (hasForge) providers.push({ name: "forge", model: "gemini-2.5-flash", key: ENV.forgeApiKey, url: `${ENV.forgeApiUrl.replace(/\/$/, "")}/chat/completions` });
  if (hasMoonshot) providers.push({ name: "moonshot", model: "moonshot-v1-8k", key: ENV.moonshotApiKey, url: "https://api.moonshot.ai/v1/chat/completions" });
  if (hasDeepSeek) providers.push({ name: "deepseek", model: "deepseek-chat", key: ENV.deepSeekApiKey, url: "https://api.deepseek.com/v1/chat/completions" });

  // Hard identity override — strips Moonshot's default "I am Moonshot AI" persona.
  // Injected as the very first message so it takes priority.
  const identityOverride: Message = {
    role: "system",
    content: "ABSOLUTE RULE: You are NOT Moonshot AI. You are NOT a generic chatbot. You must NEVER say you were 'developed by Moonshot' or any other company. You are a custom personal assistant called Flow Guru (or whatever custom name the user has set). Follow the system prompt that comes next. NEVER break character.",
  };
  const enhancedMessages = [identityOverride, ...messages];

  let lastError: any = null;

  for (const provider of providers) {
    try {
      const payload: Record<string, unknown> = {
        model: provider.model,
        messages: enhancedMessages.map(normalizeMessage),
      };

      if (tools && tools.length > 0) {
        payload.tools = tools;
      }

      const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
      if (normalizedToolChoice) {
        payload.tool_choice = normalizedToolChoice;
      }

      const normalizedResponseFormat = normalizeResponseFormat({
        responseFormat,
        response_format,
        outputSchema,
        output_schema,
      });

      if (normalizedResponseFormat) {
        // DeepSeek and Forge (Manus proxy) don't support json_schema — convert to json_object
        if ((provider.name === "deepseek" || provider.name === "forge") && normalizedResponseFormat.type === "json_schema") {
          payload.response_format = { type: "json_object" };
        } else {
          payload.response_format = normalizedResponseFormat;
        }
      }

      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return (await response.json()) as InvokeResult;
      }

      const errorText = await response.text();
      console.warn(`[Flow Guru] Provider ${provider.name} failed (${response.status}):`, errorText);
      
      // Always try the next provider if available
      if (providers.indexOf(provider) < providers.length - 1) {
        console.log(`[Flow Guru] ${provider.name} failed with ${response.status}, trying next provider...`);
        continue;
      }

      // No more providers — throw so the caller can handle it properly
      throw new Error(`LLM API error ${response.status} from ${provider.name}: ${errorText.slice(0, 200)}`);
    } catch (err) {
      console.error(`[Flow Guru] Critical error with provider ${provider.name}:`, err);
      lastError = err;
    }
  }

  // If we get here, all providers failed with exceptions
  throw lastError ?? new Error("All LLM providers failed with no error details.");
}
