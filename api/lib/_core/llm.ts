import { ENV, getXaiApiKey, getXaiModel } from "./env.js";

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
  tool_calls?: ToolCall[];
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
  const { role, name, tool_call_id, tool_calls } = message;

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
    const result: Record<string, unknown> = {
      role,
      name,
      content: contentParts[0].text,
    };
    if (tool_calls && tool_calls.length > 0) result.tool_calls = tool_calls;
    return result;
  }

  const result: Record<string, unknown> = {
    role,
    name,
    content: contentParts,
  };
  if (tool_calls && tool_calls.length > 0) result.tool_calls = tool_calls;
  return result;
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

const resolveApiUrl = (type: "chat" | "embeddings") => {
  if (ENV.xaiApiKey && type === "chat") return "https://api.x.ai/v1/chat/completions";
  if (ENV.deepSeekApiKey && type === "chat") return "https://api.deepseek.com/v1/chat/completions";
  if (ENV.moonshotApiKey && type === "chat") return "https://api.moonshot.cn/v1/chat/completions";

  const base = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? ENV.forgeApiUrl.trim().replace(/\/$/, "")
    : "https://forge.manus.im";
  
  const suffix = type === "chat" ? "/chat/completions" : "/embeddings";
  
  // Avoid double /v1 if already present in base URL
  const versionPrefix = base.endsWith("/v1") ? "" : "/v1";
  return `${base}${versionPrefix}${suffix}`;
};

const assertApiKey = () => {
  if (!ENV.xaiApiKey && !ENV.forgeApiKey && !ENV.deepSeekApiKey && !ENV.moonshotApiKey) {
    throw new Error(
      "API Key is not configured. Please set XAI_API_KEY (Grok), DEEPSEEK_API_KEY, MOONSHOT_API_KEY, or BUILT_IN_FORGE_API_KEY."
    );
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

type LlmProvider = {
  name: "xai" | "deepseek" | "moonshot" | "forge";
  apiUrl: string;
  apiKey: string;
  model: string;
  stripJsonSchema: boolean;
};

function resolveChatProvider(): LlmProvider | null {
  const xaiKey = getXaiApiKey();
  if (xaiKey) {
    return {
      name: "xai",
      apiUrl: "https://api.x.ai/v1/chat/completions",
      apiKey: xaiKey,
      model: getXaiModel(),
      stripJsonSchema: true,
    };
  }
  if (ENV.deepSeekApiKey) {
    return {
      name: "deepseek",
      apiUrl: "https://api.deepseek.com/v1/chat/completions",
      apiKey: ENV.deepSeekApiKey,
      model: "deepseek-chat",
      stripJsonSchema: true,
    };
  }
  if (ENV.moonshotApiKey) {
    return {
      name: "moonshot",
      apiUrl: "https://api.moonshot.cn/v1/chat/completions",
      apiKey: ENV.moonshotApiKey,
      model: "moonshot-v1-8k",
      stripJsonSchema: false,
    };
  }
  if (ENV.forgeApiKey) {
    const base =
      ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
        ? ENV.forgeApiUrl.trim().replace(/\/$/, "")
        : "https://forge.manus.im";
    const versionPrefix = base.endsWith("/v1") ? "" : "/v1";
    return {
      name: "forge",
      apiUrl: `${base}${versionPrefix}/chat/completions`,
      apiKey: ENV.forgeApiKey,
      model: "gemini-1.5-flash",
      stripJsonSchema: false,
    };
  }
  return null;
}

async function postChatCompletions(
  provider: LlmProvider,
  payload: Record<string, unknown>
): Promise<{ ok: true; data: InvokeResult } | { ok: false; status: number; body: string }> {
  const response = await fetch(provider.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, status: response.status, body };
  }
  return { ok: true, data: (await response.json()) as InvokeResult };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const provider = resolveChatProvider();

  if (!provider) {
    console.warn(
      "[Flow Guru] Simulation Mode: no XAI_API_KEY / DEEPSEEK_API_KEY / MOONSHOT_API_KEY / BUILT_IN_FORGE_API_KEY"
    );
    return {
      id: "mock-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: "mock-guru-1.0",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content:
            "I'm in simulation mode — no AI API key is configured on this server. Set XAI_API_KEY (Grok) in Vercel Environment Variables (Production + Preview), redeploy, and try again.",
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

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

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: messages.map(normalizeMessage),
    max_tokens: 4096,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
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
    if (provider.stripJsonSchema && normalizedResponseFormat.type === "json_schema") {
      // rely on prompt
    } else {
      payload.response_format = normalizedResponseFormat;
    }
  }

  try {
    console.info(
      `[Flow Guru] LLM provider=${provider.name} model=${provider.model} url=${provider.apiUrl}`
    );

    let result = await postChatCompletions(provider, payload);

    if (!result.ok && result.status === 400 && payload.response_format) {
      console.warn("[Flow Guru] Retrying LLM without response_format…");
      const retryPayload = { ...payload };
      delete retryPayload.response_format;
      result = await postChatCompletions(provider, retryPayload);
    }

    if (
      !result.ok &&
      provider.name === "xai" &&
      result.status === 400 &&
      /model/i.test(result.body) &&
      provider.model !== "grok-4.3"
    ) {
      console.warn(`[Flow Guru] Retrying xAI with grok-4.3 (was ${provider.model})…`);
      result = await postChatCompletions(provider, {
        ...payload,
        model: "grok-4.3",
      });
    }

    if (!result.ok) {
      console.error(
        `[Flow Guru] LLM API failed (${result.status}) provider=${provider.name}:`,
        result.body.slice(0, 400)
      );
      const hint =
        result.status === 401 || result.status === 403
          ? "API key rejected — check XAI_API_KEY in Vercel."
          : result.status === 429
            ? "Rate limited — try again in a moment."
            : `Provider ${provider.name} returned ${result.status}.`;
      return {
        id: "error-fallback-" + Date.now(),
        created: Math.floor(Date.now() / 1000),
        model: "fallback-guru-1.0",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: `I'm having trouble reaching Grok right now. ${hint}`,
          },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    }

    return result.data;
  } catch (error) {
    console.error(`[Flow Guru] LLM API Exception provider=${provider.name}:`, error);
    return {
      id: "error-fallback-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: "fallback-guru-1.0",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content:
            "I'm having trouble reaching Grok right now (network error). Check server logs and that XAI_API_KEY is set for this deployment.",
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const hasForge = ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0;

  if (!hasForge) {
    // No embedding-capable provider found. Fall back to simulation mode.
    return new Array(1536).fill(0).map(() => Math.random());
  }

  const apiUrl = resolveApiUrl("embeddings");
  const apiKey = ENV.forgeApiKey;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Flow Guru] Embedding API failed (${response.status}) at ${apiUrl}. Falling back to simulation mode.`, errorText);
      return new Array(1536).fill(0).map(() => Math.random());
    }

    const result = await response.json();
    if (!result.data || !result.data[0] || !result.data[0].embedding) {
        throw new Error("Unexpected embedding response format");
    }
    return result.data[0].embedding;
  } catch (error) {
    console.error(`[Flow Guru] Embedding API exception at ${apiUrl}:`, error);
    return new Array(1536).fill(0).map(() => Math.random());
  }
}