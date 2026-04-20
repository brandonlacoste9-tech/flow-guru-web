import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
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
    const requestedThread = await getConversationThreadById(requestedThreadId);
    if (requestedThread && requestedThread.userId === userId) {
      return requestedThread.id;
    }
  }

  const existingThread = await findLatestConversationThread(userId);
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
  const existingProfile = await getUserMemoryProfile(params.userId);
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
    await upsertUserMemoryProfile(mergedProfile);
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

  await createUserMemoryFacts(newFacts);

  return {
    profileUpdated: hasProfileContent,
    factsAdded: newFacts.length,
  };
}

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
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getUserMemoryProfile(ctx.user.id);
      const memoryFacts = await listUserMemoryFacts(ctx.user.id);
      const thread = await findLatestConversationThread(ctx.user.id);
      const safeThread = thread && thread.userId === ctx.user.id ? thread : null;
      const messages = safeThread ? await listConversationMessages(safeThread.id, ctx.user.id) : [];
      const providerConnections = await listProviderConnections(ctx.user.id);

      return {
        profile,
        memoryFacts,
        thread: safeThread,
        messages,
        providerConnections,
      };
    }),
    startFresh: protectedProcedure.mutation(async ({ ctx }) => {
      const threadId = await createConversationThread({
        userId: ctx.user.id,
        title: "Flow Guru Chat",
      });

      if (!threadId) {
        throw new Error("Failed to create conversation thread");
      }

      const thread = await getConversationThreadById(threadId);
      const providerConnections = await listProviderConnections(ctx.user.id);

      return {
        thread,
        messages: [],
        providerConnections,
      };
    }),
    history: protectedProcedure.query(async ({ ctx }) => {
      const thread = await findLatestConversationThread(ctx.user.id);
      if (!thread || thread.userId !== ctx.user.id) {
        return {
          thread: null,
          messages: [],
        } as const;
      }

      const messages = await listConversationMessages(thread.id, ctx.user.id);
      return {
        thread,
        messages,
      };
    }),
    send: protectedProcedure.input(sendMessageInput).mutation(async ({ ctx, input }) => {
      const threadId = await getOrCreateThreadId(ctx.user.id, input.threadId);

      await createConversationMessage({
        threadId,
        userId: ctx.user.id,
        role: "user",
        content: input.message,
      });

      const profile = await getUserMemoryProfile(ctx.user.id);
      const memoryFacts = await listUserMemoryFacts(ctx.user.id);
      const history = await listConversationMessages(threadId, ctx.user.id);
      const memoryContext = buildMemoryContext({
        userName: ctx.user.name,
        profile,
        facts: memoryFacts,
      });

      const systemPrompt = [
        "You are Flow Guru, a calm and capable personal AI assistant.",
        "Speak with quiet confidence, warmth, and concise clarity.",
        "Use the saved memory below to personalize your responses so the assistant feels familiar with the user.",
        "When an external action result is provided, rely on it faithfully and do not pretend an action succeeded if it did not.",
        "Never claim to know facts that are not present in memory, the current conversation, or an action result.",
        "Do not mention that you are reading a memory store unless the user explicitly asks.",
        "When useful, gently reference routines, preferences, or recurring events from memory.",
        "Keep the tone minimal, grounded, and supportive.",
        "Saved memory:",
        memoryContext,
      ].join("\n\n");

      let actionResult: AssistantActionResult | null = null;

      try {
        const plannedAction = await planAssistantAction({
          userName: ctx.user.name,
          memoryContext,
          message: input.message,
        });
        actionResult = await executeAssistantAction(plannedAction, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          message: input.message,
          memoryContext,
          timeZone: input.timeZone ?? null,
        });
      } catch (error) {
        console.warn("[Flow Guru] Action planning or execution failed. Continuing with standard chat.", error);
        actionResult = {
          action: "none",
          status: "failed",
          title: "Action unavailable",
          summary: "I hit a snag while trying to carry that out, so I’ll respond conversationally instead.",
        };
      }

      let assistantReply = buildActionFallbackReply(actionResult);
      const shouldUseDirectActionReply =
        actionResult?.status === "executed" &&
        (actionResult.action === "calendar.create_event" ||
          actionResult.action === "calendar.list_events");

      if (!shouldUseDirectActionReply) {
        try {
          const llmResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              ...(actionResult
                ? [
                    {
                      role: "system" as const,
                      content: [
                        "External action result for the current turn:",
                        formatActionResultContext(actionResult),
                        "Use the result directly. If the action needs a missing connection or missing details, explain that plainly and briefly.",
                      ].join("\n\n"),
                    },
                  ]
                : []),
              ...history.slice(-20).map(message => ({
                role: message.role,
                content: message.content,
              })),
            ],
          });

          assistantReply =
            extractAssistantText(llmResponse.choices[0]?.message.content ?? "") || assistantReply;
        } catch (error) {
          console.error("[Flow Guru] Chat generation failed. Falling back to a safe reply.", error);
        }
      }

      await createConversationMessage({
        threadId,
        userId: ctx.user.id,
        role: "assistant",
        content: assistantReply,
      });
      await touchConversationThread(threadId);

      let memoryUpdate = {
        profileUpdated: false,
        factsAdded: 0,
      };

      try {
        memoryUpdate = await extractAndPersistMemory({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userMessage: input.message,
          assistantReply,
        });
      } catch (error) {
        console.warn("[Flow Guru] Memory extraction failed, but the message send completed.", error);
      }

      const messages = await listConversationMessages(threadId, ctx.user.id);

      return {
        threadId,
        reply: assistantReply,
        messages,
        memoryUpdate,
        actionResult,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
