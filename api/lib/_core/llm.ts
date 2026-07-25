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
  /** Sampling temperature (chat-friendly defaults to provider default if omitted). */
  temperature?: number;
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

/**
 * Provider policy (Grok-first):
 * - Default: **xAI Grok only** when XAI_API_KEY is set.
 * - Fallbacks (DeepSeek / Moonshot / Forge) only if LLM_ALLOW_FALLBACKS=true
 *   OR LLM_PROVIDER=auto with no XAI key.
 * - LLM_PROVIDER=xai|deepseek|moonshot|forge forces a single provider.
 */
function listChatProviders(): LlmProvider[] {
  const forced = cleanProviderName(process.env.LLM_PROVIDER);
  const allowFallbacks =
    process.env.LLM_ALLOW_FALLBACKS === "true" || forced === "auto";

  const xai: LlmProvider | null = (() => {
    const xaiKey = getXaiApiKey();
    if (!xaiKey) return null;
    return {
      name: "xai",
      apiUrl: "https://api.x.ai/v1/chat/completions",
      apiKey: xaiKey,
      model: getXaiModel(),
      stripJsonSchema: true,
    };
  })();

  const deepseek: LlmProvider | null =
    ENV.deepSeekApiKey &&
    process.env.SKIP_DEEPSEEK !== "true" &&
    process.env.LLM_SKIP_DEEPSEEK !== "true"
      ? {
          name: "deepseek",
          apiUrl: "https://api.deepseek.com/v1/chat/completions",
          apiKey: ENV.deepSeekApiKey,
          model: "deepseek-chat",
          stripJsonSchema: true,
        }
      : null;

  const moonshot: LlmProvider | null = ENV.moonshotApiKey
    ? {
        name: "moonshot",
        apiUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: ENV.moonshotApiKey,
        model: "moonshot-v1-8k",
        stripJsonSchema: false,
      }
    : null;

  const forge: LlmProvider | null = ENV.forgeApiKey
    ? (() => {
        const base =
          ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
            ? ENV.forgeApiUrl.trim().replace(/\/$/, "")
            : "https://forge.manus.im";
        const versionPrefix = base.endsWith("/v1") ? "" : "/v1";
        return {
          name: "forge" as const,
          apiUrl: `${base}${versionPrefix}/chat/completions`,
          apiKey: ENV.forgeApiKey,
          model: "gemini-1.5-flash",
          stripJsonSchema: false,
        };
      })()
    : null;

  if (forced && forced !== "auto") {
    const map = { xai, deepseek, moonshot, forge } as const;
    const one = map[forced as keyof typeof map];
    return one ? [one] : [];
  }

  // Grok-first product mode: if Grok is configured, use only Grok unless fallbacks allowed
  if (xai && !allowFallbacks) {
    return [xai];
  }

  const providers: LlmProvider[] = [];
  if (xai) providers.push(xai);
  if (allowFallbacks || !xai) {
    if (deepseek) providers.push(deepseek);
    if (moonshot) providers.push(moonshot);
    if (forge) providers.push(forge);
  }
  return providers;
}

function cleanProviderName(val: string | undefined): string {
  return (val ?? "").trim().toLowerCase();
}

function resolveChatProvider(): LlmProvider | null {
  return listChatProviders()[0] ?? null;
}

function providerFailureHint(
  provider: LlmProvider,
  status: number,
  tried: string[]
): string {
  if (status === 402) {
    if (provider.name === "deepseek") {
      return (
        "DeepSeek returned 402 (payment / out of credits). " +
        (getXaiApiKey()
          ? "Grok key is present but was not used first — check logs."
          : "Grok is not configured on this server yet. In Vercel → Environment Variables add XAI_API_KEY (and XAI_MODEL=grok-4.3), enable Production, then Redeploy.")
      );
    }
    return `${provider.name} returned 402 (billing). Tried: ${tried.join(" → ")}.`;
  }
  if (status === 401 || status === 403) {
    return `${provider.name} rejected the API key (${status}). Check that key in Vercel.`;
  }
  if (status === 429) {
    return `${provider.name} rate-limited the request. Try again shortly.`;
  }
  return `Provider ${provider.name} returned ${status}. Tried: ${tried.join(" → ") || provider.name}.`;
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
  const providers = listChatProviders();

  if (providers.length === 0) {
    const hasDeepseekOnly = Boolean(ENV.deepSeekApiKey) && !getXaiApiKey();
    console.warn(
      "[Flow Guru] No usable LLM provider. XAI configured:",
      Boolean(getXaiApiKey()),
      "DeepSeek present:",
      hasDeepseekOnly
    );
    return {
      id: "mock-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: "mock-guru-1.0",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: hasDeepseekOnly
            ? "This build is Grok-first. DeepSeek is installed but disabled unless LLM_ALLOW_FALLBACKS=true. Add XAI_API_KEY (Grok) in Vercel → Environment Variables, set XAI_MODEL=grok-4.3, redeploy — then I can talk properly."
            : "I'm offline until Grok is configured. Set XAI_API_KEY in Vercel (Production), XAI_MODEL=grok-4.3, redeploy, and try again.",
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
    temperature,
    maxTokens,
    max_tokens,
  } = params;

  const basePayload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
    max_tokens: maxTokens ?? max_tokens ?? 4096,
  };
  if (typeof temperature === "number" && Number.isFinite(temperature)) {
    basePayload.temperature = Math.min(2, Math.max(0, temperature));
  }

  if (tools && tools.length > 0) {
    basePayload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    basePayload.tool_choice = normalizedToolChoice;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const tried: string[] = [];
  let lastFailure: { provider: LlmProvider; status: number; body: string } | null =
    null;

  for (const provider of providers) {
    const payload: Record<string, unknown> = {
      ...basePayload,
      model: provider.model,
    };

    if (normalizedResponseFormat) {
      if (provider.stripJsonSchema && normalizedResponseFormat.type === "json_schema") {
        // rely on prompt
      } else {
        payload.response_format = normalizedResponseFormat;
      }
    }

    try {
      console.info(
        `[Flow Guru] LLM try provider=${provider.name} model=${provider.model}`
      );
      tried.push(provider.name);

      let result = await postChatCompletions(provider, payload);

      if (!result.ok && result.status === 400 && payload.response_format) {
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
        result = await postChatCompletions(provider, {
          ...payload,
          model: "grok-4.3",
        });
      }

      if (result.ok) {
        return result.data;
      }

      lastFailure = {
        provider,
        status: result.status,
        body: result.body,
      };
      console.error(
        `[Flow Guru] LLM failed provider=${provider.name} status=${result.status}:`,
        result.body.slice(0, 300)
      );

      // Billing / auth failures: try next provider
      if ([402, 401, 403, 429].includes(result.status)) {
        continue;
      }
      // Other errors: still try next if available
      continue;
    } catch (error) {
      console.error(`[Flow Guru] LLM exception provider=${provider.name}:`, error);
      lastFailure = {
        provider,
        status: 0,
        body: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const hint = lastFailure
    ? providerFailureHint(lastFailure.provider, lastFailure.status, tried)
    : "No LLM provider succeeded.";

  return {
    id: "error-fallback-" + Date.now(),
    created: Math.floor(Date.now() / 1000),
    model: "fallback-guru-1.0",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: `I'm having trouble reaching an AI provider right now. ${hint}`,
      },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
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