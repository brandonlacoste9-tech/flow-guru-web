import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM, type Tool, type ToolCall } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  buildActionFallbackReply,
  executeAssistantAction,
  formatActionResultContext,
  planAssistantAction,
  type AssistantActionResult,
} from "./assistantActions";
import {
  createConversationMessage,
  createConversationThread,
  createUserMemoryFacts,
  findLatestConversationThread,
  getConversationThreadById,
  getUserMemoryProfile,
  listConversationMessages,
  listProviderConnections,
  listUserMemoryFacts,
  resolveAssistantUserId,
  touchConversationThread,
  upsertUserMemoryProfile,
} from "./db";

const sendMessageInput = z.object({
  message: z.string().trim().min(1).max(5000),
  timeZone: z.string().trim().min(1).max(100).optional(),
  threadId: z.number().int().positive().optional(),
});

const MEMORY_FACT_CATEGORIES = [
  "wake_up_time",
  "daily_routine",
  "preference",
  "recurring_event",
  "general",
] as const;

type MemoryFactCategory = (typeof MEMORY_FACT_CATEGORIES)[number];

const extractionSchema = z.object({
  profile_updates: z.object({
    wakeUpTime: z.string().nullable(),
    dailyRoutine: z.string().nullable(),
    preferencesSummary: z.string().nullable(),
    recurringEventsSummary: z.string().nullable(),
  }),
  facts: z.array(
    z.object({
      category: z.enum(MEMORY_FACT_CATEGORIES),
      factKey: z.string().nullable(),
      factValue: z.string(),
      confidence: z.number().int().min(1).max(100),
    }),
  ),
});

type ExtractionResult = z.infer<typeof extractionSchema>;

// ─── Tool definitions ─────────────────────────────────────────────────────────

const ASSISTANT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "playMusic",
      description: "Play music for the user based on genre, mood, or playlist name",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Genre, mood, or playlist name (e.g. 'house music', 'morning playlist', 'lo-fi')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCalendarEvent",
      description: "Create a calendar event or reminder for the user",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          time: { type: "string", description: "ISO 8601 or natural language like 'tomorrow 9am'" },
          description: { type: "string" },
        },
        required: ["title", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get current weather for the user's saved location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City or location, use user's saved location if available",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setReminder",
      description: "Set a one-time or recurring reminder for the user",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          time: { type: "string" },
          recurring: { type: "boolean", description: "Whether this repeats daily" },
        },
        required: ["message", "time"],
      },
    },
  },
];

// ─── Tool stub handler ────────────────────────────────────────────────────────

function executeToolStub(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "playMusic":
      return `🎵 Playing ${args.query} now!`;
    case "createCalendarEvent":
      return `📅 Event '${args.title}' scheduled for ${args.time}!`;
    case "getWeather":
      return `🌤 Fetching weather for ${args.location}...`;
    case "setReminder":
      return `⏰ Reminder set: '${args.message}' at ${args.time}`;
    default:
      return "Tool executed successfully.";
  }
}

// ─── Assistant name helpers ───────────────────────────────────────────────────

/**
 * Detects patterns like "call you X", "your name is X", "rename yourself X".
 * Returns the new name string, or null if no match.
 */
function detectAssistantNameChange(message: string): string | null {
  const lower = message.toLowerCase().trim();

  const patterns = [
    /(?:call\s+you|your\s+name\s+(?:is|should\s+be)|rename\s+yourself?|you\s+are\s+now\s+called?|go\s+by)\s+([A-Za-z][A-Za-z0-9 _-]{0,39})/i,
  ];

  for (const re of patterns) {
    const match = re.exec(lower);
    if (match) {
      // Capitalise the first letter of each word
      return match[1]
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return null;
}

/**
 * Reads assistant_name from the user's memory facts.
 * Takes the last occurrence in case the user renamed it multiple times.
 */
function getAssistantName(facts: Array<{ factKey: string | null; factValue: string }>): string {
  const nameFacts = facts.filter(f => f.factKey === "assistant_name");
  return nameFacts.length > 0 ? nameFacts[nameFacts.length - 1].factValue : "Flow Guru";
}

// ─── Memory helpers ───────────────────────────────────────────────────────────

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractAssistantText(content: string | Array<{ type: string; text?: string }>) {
  if (typeof content === "string") {
    return content.trim();
  }

  return content
    .map(part => (part.type === "text" && part.text ? part.text : ""))
    .join("\n")
    .trim();
}

function buildMemoryContext(params: {
  userName: string | null | undefined;
  profile:
    | {
        wakeUpTime: string | null;
        dailyRoutine: string | null;
        preferencesSummary: string | null;
        recurringEventsSummary: string | null;
      }
    | null
    | undefined;
  facts: Array<{
    category: string;
    factKey: string | null;
    factValue: string;
  }>;
}) {
  const factLines = params.facts.length
    ? params.facts
        .slice(0, 20)
        .map(fact => `- [${fact.category}] ${fact.factKey ? `${fact.factKey}: ` : ""}${fact.factValue}`)
        .join("\n")
    : "- No saved personal facts yet.";

  return [
    `User name: ${params.userName ?? "Unknown"}`,
    `Wake-up time: ${params.profile?.wakeUpTime ?? "Unknown"}`,
    `Daily routine: ${params.profile?.dailyRoutine ?? "Unknown"}`,
    `Preferences summary: ${params.profile?.preferencesSummary ?? "Unknown"}`,
    `Recurring events summary: ${params.profile?.recurringEventsSummary ?? "Unknown"}`,
    "Known memory facts:",
    factLines,
  ].join("\n");
}

async function getOrCreateThreadId(userId: number, requestedThreadId?: number) {
  if (requestedThreadId) {
    const requestedThread = (await getConversationThreadById(requestedThreadId)) as any;
    if (requestedThread && requestedThread.userId === userId) {
      return requestedThread.id;
    }
  }

  const existingThread = (await findLatestConversationThread(userId)) as any;
  if (existingThread && existingThread.userId === userId) {
    return existingThread.id;
  }

  const threadId = await createConversationThread({
    userId,
    title: "Flow Guru Chat",
  });

  if (!threadId) {
    throw new Error("Failed to create conversation thread");
  }

  return threadId;
}

async function extractAndPersistMemory(params: {
  userId: number;
  userName: string | null | undefined;
  userMessage: string;
  assistantReply: string;
}) {
  const existingProfile = (await getUserMemoryProfile(params.userId)) as any;
  const existingFacts = await listUserMemoryFacts(params.userId);

  const extractionResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You extract durable user memory from conversations. Only capture facts about the user that are likely to remain useful in future conversations. Do not invent details. If nothing new appears, return nulls and an empty facts array.",
      },
      {
        role: "user",
        content: [
          "Existing profile:",
          `Wake-up time: ${existingProfile?.wakeUpTime ?? "Unknown"}`,
          `Daily routine: ${existingProfile?.dailyRoutine ?? "Unknown"}`,
          `Preferences summary: ${existingProfile?.preferencesSummary ?? "Unknown"}`,
          `Recurring events summary: ${existingProfile?.recurringEventsSummary ?? "Unknown"}`,
          "Existing facts:",
          existingFacts.length
            ? existingFacts
                .slice(0, 20)
                .map(fact => `- [${fact.category}] ${fact.factKey ? `${fact.factKey}: ` : ""}${fact.factValue}`)
                .join("\n")
            : "- None",
          "Latest exchange:",
          `User: ${params.userMessage}`,
          `Assistant: ${params.assistantReply}`,
          `User name: ${params.userName ?? "Unknown"}`,
        ].join("\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "memory_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            profile_updates: {
              type: "object",
              properties: {
                wakeUpTime: { type: ["string", "null"] },
                dailyRoutine: { type: ["string", "null"] },
                preferencesSummary: { type: ["string", "null"] },
                recurringEventsSummary: { type: ["string", "null"] },
              },
              required: [
                "wakeUpTime",
                "dailyRoutine",
                "preferencesSummary",
                "recurringEventsSummary",
              ],
              additionalProperties: false,
            },
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: [...MEMORY_FACT_CATEGORIES],
                  },
                  factKey: {
                    type: ["string", "null"],
                  },
                  factValue: {
                    type: "string",
                  },
                  confidence: {
                    type: "integer",
                    minimum: 1,
                    maximum: 100,
                  },
                },
                required: ["category", "factKey", "factValue", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["profile_updates", "facts"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = extractionResponse.choices[0]?.message.content;
  const extractionText =
    typeof rawContent === "string"
      ? rawContent
      : rawContent
          .map(part => (part.type === "text" && "text" in part ? part.text : ""))
          .join("\n");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractionText || "{}");
  } catch (error) {
    console.warn("[Flow Guru] Memory extraction returned invalid JSON.", error);
    return {
      profileUpdated: false,
      factsAdded: 0,
    };
  }

  const parsedResult = extractionSchema.safeParse(parsedJson);
  if (!parsedResult.success) {
    console.warn("[Flow Guru] Memory extraction did not match schema.", parsedResult.error.flatten());
    return {
      profileUpdated: false,
      factsAdded: 0,
    };
  }

  const parsed = parsedResult.data as ExtractionResult;

  const mergedProfile = {
    userId: params.userId,
    wakeUpTime: normalizeText(parsed.profile_updates.wakeUpTime) ?? existingProfile?.wakeUpTime ?? null,
    dailyRoutine: normalizeText(parsed.profile_updates.dailyRoutine) ?? existingProfile?.dailyRoutine ?? null,
    preferencesSummary:
      normalizeText(parsed.profile_updates.preferencesSummary) ?? existingProfile?.preferencesSummary ?? null,
    recurringEventsSummary:
      normalizeText(parsed.profile_updates.recurringEventsSummary) ?? existingProfile?.recurringEventsSummary ?? null,
  };

  const hasProfileContent = [
    mergedProfile.wakeUpTime,
    mergedProfile.dailyRoutine,
    mergedProfile.preferencesSummary,
    mergedProfile.recurringEventsSummary,
  ].some(Boolean);

  if (hasProfileContent) {
    await upsertUserMemoryProfile(params.userId, mergedProfile);
  }

  const seenFacts = new Set(
    existingFacts.map(fact => `${fact.category}::${(fact.factKey ?? "").toLowerCase()}::${fact.factValue.trim().toLowerCase()}`),
  );

  const newFacts = parsed.facts
    .map(fact => ({
      userId: params.userId,
      category: fact.category,
      factKey: normalizeText(fact.factKey),
      factValue: fact.factValue.trim(),
      confidence: Math.max(1, Math.min(100, fact.confidence)),
    }))
    .filter(fact => fact.factValue.length > 0)
    .filter(fact => {
      const key = `${fact.category}::${(fact.factKey ?? "").toLowerCase()}::${fact.factValue.toLowerCase()}`;
      if (seenFacts.has(key)) {
        return false;
      }
      seenFacts.add(key);
      return true;
    });

  await createUserMemoryFacts(params.userId, newFacts);

  return {
    profileUpdated: hasProfileContent,
    factsAdded: newFacts.length,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  assistant: router({
    bootstrap: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const profile = await getUserMemoryProfile(userId);
      const memoryFacts = await listUserMemoryFacts(userId);
      const thread = await findLatestConversationThread(userId);
      const safeThread = thread && thread.userId === userId ? thread : null;
      const messages = safeThread ? await listConversationMessages(safeThread.id) : [];
      const providerConnections = await listProviderConnections(userId);

      return {
        profile,
        memoryFacts,
        thread: safeThread,
        messages,
        providerConnections,
      };
    }),
    startFresh: publicProcedure.mutation(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const threadId = await createConversationThread({
        userId,
        title: "Flow Guru Chat",
      });

      if (!threadId) {
        throw new Error("Failed to create conversation thread");
      }

      const thread = await getConversationThreadById(threadId);
      const providerConnections = await listProviderConnections(userId);

      return {
        thread,
        messages: [],
        providerConnections,
      };
    }),
    history: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const thread = await findLatestConversationThread(userId);
      if (!thread || thread.userId !== userId) {
        return {
          thread: null,
          messages: [],
        } as const;
      }

      const messages = await listConversationMessages(thread.id);
      return {
        thread,
        messages,
      };
    }),
    send: publicProcedure.input(sendMessageInput).mutation(async ({ ctx, input }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const threadId = await getOrCreateThreadId(userId, input.threadId);

      // Save user message first
      await createConversationMessage({
        threadId,
        userId,
        role: "user",
        content: input.message,
      });

      // Load memory
      const profile = await getUserMemoryProfile(userId);
      const memoryFacts = await listUserMemoryFacts(userId);
      const history = await listConversationMessages(threadId);

      // ── Feature A: Detect assistant name change ──────────────────────────────
      const newAssistantName = detectAssistantNameChange(input.message);
      if (newAssistantName) {
        await c