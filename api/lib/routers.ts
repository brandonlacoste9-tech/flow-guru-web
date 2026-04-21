import { COOKIE_NAME } from "./shared/const.js";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { invokeLLM } from "./_core/llm.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import {
  buildActionFallbackReply,
  executeAssistantAction,
  formatActionResultContext,
  planAssistantAction,
  type AssistantActionResult,
} from "./assistantActions.js";
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
} from "./db.js";

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
          "You are a dedicated memory engine for Flow Guru. Extract durable user facts (wake-up times, routine steps, name of health providers, food preferences, family details, etc.) that would make a personal assistant more helpful. Avoid generic fluff. return nulls/empty array if no new specific context is found.",
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

import { voiceRouter } from "./_core/voiceRouter.js";

export const appRouter = router({
  system: systemRouter,
  voice: voiceRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      (ctx.res as any).clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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

      await createConversationMessage({
        threadId,
        userId,
        role: "user",
        content: input.message,
      });

      const profile = await getUserMemoryProfile(userId);
      const memoryFacts = await listUserMemoryFacts(userId);
      const history = await listConversationMessages(threadId);
      const memoryContext = buildMemoryContext({
        userName: ctx.user?.name || "Brandon",
        profile,
        facts: memoryFacts,
      });

      const systemPrompt = [
        `You are Flow Guru, ${ctx.user?.name || "Brandon"}'s savvy, warm, and highly personal AI assistant.`,
        "Your personality is 'concise warmth'. You feel like a person who has known the user for years.",
        "VOICE & SPEECH: You have a high-quality human voice powered by ElevenLabs. You can generate speech and even change your voice identity if the user asks.",
        "CRITICAL RULES:",
        "1. NEVER list your features or explain what you can do. Just be helpful.",
        "2. Keep replies short (1-3 sentences max).",
        "3. Use the 'Saved Memory' below to deeply personalize every reply. If you know their routine or preferences, weave them in naturally.",
        "4. Always suggest ONE useful next step based on the context or their habits.",
        "5. No corporate speak. No bulleted lists of capabilities.",
        "Saved memory:",
        memoryContext,
      ].join("\n\n");

      let actionResult: AssistantActionResult | null = null;

      try {
        const plannedAction = await planAssistantAction({
          userName: ctx.user?.name || "Brandon",
          memoryContext,
          message: input.message,
        });
        actionResult = await executeAssistantAction(plannedAction, {
          userId,
          userName: ctx.user?.name || "Brandon",
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
                      "Incorporate this result into your warm, personal reply. Be conversational, not robotic.",
                    ].join("\n\n"),
                  },
                ]
              : []),
            ...history.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content as string,
            })),
          ],
        });

        assistantReply =
          extractAssistantText(llmResponse.choices[0]?.message.content ?? "") || assistantReply;
      } catch (error) {
        console.error("[Flow Guru] Chat generation failed. Falling back to a safe reply.", error);
      }

      await createConversationMessage({
        threadId,
        userId,
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
          userId,
          userName: ctx.user?.name || "Brandon",
          userMessage: input.message,
          assistantReply,
        });
      } catch (error) {
        console.warn("[Flow Guru] Memory extraction failed, but the message send completed.", error);
      }

      const messages = await listConversationMessages(threadId);

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
