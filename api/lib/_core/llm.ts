import { ENV, getXaiApiKey, getXaiModel } from "./env.js";

const clean = (val: string | undefined) =>
  (val ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");

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

/** Live DeepSeek key (don't freeze at module load — Vercel/env timing). */
function getDeepSeekApiKey() {
  return clean(
    process.env.DEEPSEEK_API_KEY ||
      process.env.DeepSeek_API_KEY ||
      process.env.DEEP_SEEK_API_KEY ||
      ENV.deepSeekApiKey,
  );
}

/**
 * Provider policy (Grok-first, DeepSeek backup when Grok missing/fails):
 * - Prefer xAI when XAI_API_KEY is set.
 * - If Grok is missing, always use DeepSeek when DEEPSEEK_API_KEY is set.
 * - If Grok is set and LLM_ALLOW_FALLBACKS=true, try DeepSeek after Grok fails.
 * - LLM_PROVIDER=xai|deepseek|moonshot|forge|auto (aliases: grok, grok-first → xai)
 * - Invalid force names do NOT wipe the provider list.
 */
function listChatProviders(): LlmProvider[] {
  const forcedRaw = cleanProviderName(process.env.LLM_PROVIDER);
  const forced =
    forcedRaw === "grok" || forcedRaw === "grok-first" || forcedRaw === "x-ai"
      ? "xai"
      : forcedRaw;
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

  const skipDeepseek =
    process.env.SKIP_DEEPSEEK === "true" ||
    process.env.LLM_SKIP_DEEPSEEK === "true";
  const deepseekKey = getDeepSeekApiKey();
  const deepseek: LlmProvider | null =
    deepseekKey && !skipDeepseek
      ? {
          name: "deepseek",
          apiUrl: "https://api.deepseek.com/v1/chat/completions",
          apiKey: deepseekKey,
          model: "deepseek-chat",
          stripJsonSchema: true,
        }
      : null;

  const moonshot: LlmProvider | null = (() => {
    const key = clean(process.env.MOONSHOT_API_KEY || ENV.moonshotApiKey);
    if (!key) return null;
    return {
      name: "moonshot",
      apiUrl: "https://api.moonshot.cn/v1/chat/completions",
      apiKey: key,
      model: "moonshot-v1-8k",
      stripJsonSchema: false,
    };
  })();

  const forge: LlmProvider | null = (() => {
    const key = clean(process.env.BUILT_IN_FORGE_API_KEY || ENV.forgeApiKey);
    if (!key) return null;
    const base =
      ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
        ? ENV.forgeApiUrl.trim().replace(/\/$/, "")
        : "https://forge.manus.im";
    const versionPrefix = base.endsWith("/v1") ? "" : "/v1";
    return {
      name: "forge" as const,
      apiUrl: `${base}${versionPrefix}/chat/completions`,
      apiKey: key,
      model: "gemini-1.5-flash",
      stripJsonSchema: false,
    };
  })();

  const available = { xai, deepseek, moonshot, forge } as const;

  if (forced && forced !== "auto") {
    const one = available[forced as keyof typeof available];
    if (one) return [one];
    // Forced provider missing key → don't return empty; fall through to whatever works
    console.warn(
      `[Flow Guru] LLM_PROVIDER=${forced} has no key; using available providers instead.`,
    );
  }

  // Grok only when present and fallbacks off
  if (xai && !allowFallbacks) {
    return [xai];
  }

  const providers: LlmProvider[] = [];
  if (xai) providers.push(xai);
  // No Grok → always allow DeepSeek/others. With Grok + fallbacks → include them too.
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

/** Exported for /api/health diagnostics */
export function describeLlmProviders() {
  const list = listChatProviders();
  return {
    providers: list.map((p) => ({ name: p.name, model: p.model })),
    hasXaiKey: Boolean(getXaiApiKey()),
    hasDeepseekKey: Boolean(getDeepSeekApiKey()),
    allowFallbacks: process.env.LLM_ALLOW_FALLBACKS === "true",
    llmProviderEnv: process.env.LLM_PROVIDER || null,
  };
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

/** Safe extract of assistant text from any InvokeResult-like payload. */
export function getChoiceText(
  result: InvokeResult | null | undefined,
): string {
  try {
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: string }).text ?? "")
            : "",
        )
        .join("\n")
        .trim();
    }
    return "";
  } catch {
    return "";
  }
}

function ensureInvokeResult(
  data: InvokeResult,
  provider: LlmProvider,
): InvokeResult {
  if (!data || typeof data !== "object") {
    return {
      id: "empty-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: provider.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "stop",
        },
      ],
    };
  }
  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    return {
      ...data,
      model: data.model || provider.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "stop",
        },
      ],
    };
  }
  return data;
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
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: `Invalid JSON from ${provider.name}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return {
    ok: true,
    data: ensureInvokeResult(raw as InvokeResult, provider),
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const providers = listChatProviders();

  if (providers.length === 0) {
    const hasDs = Boolean(getDeepSeekApiKey());
    const hasXai = Boolean(getXaiApiKey());
    console.warn(
      "[Flow Guru] No usable LLM provider. XAI:",
      hasXai,
      "DeepSeek:",
      hasDs,
      "LLM_PROVIDER:",
      process.env.LLM_PROVIDER,
    );
    return {
      id: "mock-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: "mock-guru-1.0",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: !hasXai && !hasDs
            ? "I'm offline: no AI keys on the server. In Vercel → Environment Variables add XAI_API_KEY (recommended) or DEEPSEEK_API_KEY for Production, then Redeploy."
            : !hasXai && hasDs
              ? "Grok key is missing and DeepSeek couldn't be selected. Set XAI_API_KEY or check DEEPSEEK_API_KEY / SKIP_DEEPSEEK in Vercel, then redeploy."
              : "I'm offline until a chat provider is configured. Set XAI_API_KEY (Grok) in Vercel Production and redeploy.",
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

  let normalizedMessages: ReturnType<typeof normalizeMessage>[];
  try {
    normalizedMessages = messages.map(normalizeMessage);
  } catch (err) {
    console.error("[Flow Guru] Message normalize failed:", err);
    return {
      id: "normalize-error-" + Date.now(),
      created: Math.floor(Date.now() / 1000),
      model: "fallback-guru-1.0",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              "I hit a glitch reading chat history. Start a new chat and try again.",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const basePayload: Record<string, unknown> = {
    messages: normalizedMessages,
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
        // Always return a shape with choices[0] so callers never crash on [0]
        return ensureInvokeResult(result.data, provider);
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