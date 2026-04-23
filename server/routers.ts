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

      const assistantNameFact = memoryFacts.find(
        (f: any) => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "Flow Guru";

      const locationFact = memoryFacts.find(
        (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const userLocation = locationFact?.factValue || null;

      type WeatherSnapshot = { tempC: number; feelsLikeC: number; label: string; locationName: string };
      type CalendarItem = { title: string; start: string | null; allDay: boolean };
      let weather: WeatherSnapshot | null = null;
      let todayEvents: CalendarItem[] = [];

      const weatherPromise = (async (): Promise<WeatherSnapshot | null> => {
        if (!userLocation) return null;
        try {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(userLocation)}&count=1`;
          const geoResp = await fetch(geoUrl);
          if (!geoResp.ok) return null;
          const geoData = await geoResp.json();
          const geo = geoData.results?.[0];
          if (!geo) return null;

          const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
          wxUrl.searchParams.set("latitude", String(geo.latitude));
          wxUrl.searchParams.set("longitude", String(geo.longitude));
          wxUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
          wxUrl.searchParams.set("timezone", "auto");
          const wxResp = await fetch(wxUrl.toString());
          if (!wxResp.ok) return null;
          const wxData = await wxResp.json();
          const c = wxData.current;
          if (!c || c.temperature_2m == null) return null;

          const code = c.weather_code ?? 99;
          let label = "unsettled weather";
          if (code <= 1) label = "clear skies";
          else if (code <= 3) label = "partly cloudy";
          else if (code <= 48) label = "foggy";
          else if (code <= 57) label = "drizzle";
          else if (code <= 65) label = "rainy";
          else if (code <= 77) label = "snowy";
          else if (code <= 86) label = "snow showers";
          else if (code <= 99) label = "thunderstorms";

          return { tempC: Math.round(c.temperature_2m), feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m), label, locationName: geo.name || userLocation };
        } catch { return null; }
      })();

      const calendarPromise = (async (): Promise<CalendarItem[]> => {
        try {
          const { listGoogleCalendarEvents } = await import("./_core/googleCalendar");
          const conn = providerConnections.find((c: any) => c.provider === "google-calendar" && c.status === "connected");
          if (!conn) return [];
          const now = new Date();
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);
          const result = await listGoogleCalendarEvents({ userId, timeMinIso: now.toISOString(), timeMaxIso: endOfDay.toISOString(), maxResults: 5 });
          return (result?.items ?? []).map((e: any) => ({ title: e.summary || "Untitled event", start: e.start?.dateTime || e.start?.date || null, allDay: !e.start?.dateTime }));
        } catch { return []; }
      })();

      [weather, todayEvents] = await Promise.all([weatherPromise, calendarPromise]);

      return {
        profile,
        memoryFacts,
        thread: safeThread,
        messages,
        providerConnections,
        assistantName,
        weather,
        todayEvents,
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

      // --- Name change detection (fast path, before planner) ---
      const nameChangeMatch = input.message.match(
        /(?:call\s+(?:you|yourself)|your\s+name\s+is|rename\s+(?:you|yourself)\s+(?:to)?|I(?:'ll| will)\s+call\s+you)\s+["']?([A-Za-z][A-Za-z0-9 ]{0,29})["']?/i
      );
      if (nameChangeMatch) {
        const newName = nameChangeMatch[1].trim();
        await createUserMemoryFacts(userId, [
          { category: "preference", factKey: "assistant_name", factValue: newName, confidence: 100 },
        ]);
        const reply = `Got it! From now on I'm ${newName} 😊`;
        await createConversationMessage({ threadId, userId, role: "assistant", content: reply });
        await touchConversationThread(threadId);
        const messages = await listConversationMessages(threadId);
        return {
          threadId,
          reply,
          messages,
          memoryUpdate: { profileUpdated: false, factsAdded: 1 },
          actionResult: null,
        };
      }

      // --- Resolve custom assistant name from memory ---
      const assistantNameFact = memoryFacts.find(
        f => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "Flow Guru";
      const userName = ctx.user?.name || "Brandon";

      const memoryContext = buildMemoryContext({
        userName,
        profile,
        facts: memoryFacts,
      });

      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
      const systemPrompt = [
        `You are ${assistantName}, ${userName}'s personal AI assistant. It is currently ${timeOfDay}.`,
        "",
        "PERSONALITY:",
        "You are warm, sharp, and human. You talk like a trusted friend who happens to be incredibly capable.",
        "Never sound like a customer service bot. Never sound like a generic AI.",
        "You have a subtle wit, you're encouraging, and you get straight to the point.",
        "",
        "HARD RULES — never break these:",
        "- Max 1-2 sentences. If you can say it in 5 words, say it in 5 words.",
        "- NEVER start with 'Sure!', 'Certainly!', 'Of course!', 'Great!', 'Absolutely!', or 'Happy to help'.",
        "- NEVER say 'I can help you with that' or list your capabilities.",
        "- NEVER ask permission before acting — just do it and report back.",
        "- NEVER use generic affirmations. Lead with the actual answer.",
        "- Use contractions (it's, you're, that's). Sound spoken, not written.",
        "- Reference the user's name and memory naturally — not every message, but when it fits.",
        "",
        "TONE EXAMPLES (match this energy):",
        `User: what's the weather like?`,
        `${assistantName}: 14°C and cloudy in Toronto right now — grab a jacket.`,
        "",
        `User: book physio at 9:30 tomorrow`,
        `${assistantName}: Done — physio is on your calendar for tomorrow at 9:30 AM.`,
        "",
        `User: what do I have this afternoon?`,
        `${assistantName}: Team sync at 2 PM and that's it — pretty light afternoon.`,
        "",
        `User: how's traffic to the office?`,
        `${assistantName}: About 28 minutes right now, slightly heavier than usual on the 401.`,
        "",
        `User: how are you?`,
        `${assistantName}: All good — what do you need?`,
        "",
        "TIME CONTEXT:",
        `It is ${timeOfDay}. Tailor your energy accordingly — calm and efficient in the morning, slightly looser in the evening.`,
        "",
        `${userName}'s saved memory:`,
        memoryContext,
      ].join("\n");

      let actionResult: AssistantActionResult | null = null;

      try {
        const plannedAction = await planAssistantAction({
          userName,
          memoryContext,
          message: input.message,
        });
        actionResult = await executeAssistantAction(plannedAction, {
          userId,
          userName,
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
          summary: "I hit a snag while trying to carry that out, so I'll respond conversationally instead.",
        };
      }

      let assistantReply = buildActionFallbackReply(actionResult);

      try {
        const actionSystemMessages: Array<{ role: "system"; content: string }> = [];

        if (actionResult && actionResult.action !== "none") {
          const resultJson = formatActionResultContext(actionResult);
          if (actionResult.status === "executed") {
            actionSystemMessages.push({
              role: "system" as const,
              content: [
                "TOOL RESULT — YOU MUST ACKNOWLEDGE THIS IN YOUR REPLY:",
                resultJson,
                "",
                "INSTRUCTION: The tool ran successfully. Your reply MUST confirm what happened using the data above.",
                "For music: say what's playing (e.g., 'Playing house music for you now 🔥').",
                "For weather: share the actual temperature and conditions.",
                "For calendar: confirm what was booked or list the events.",
                "For routes: share the estimated travel time.",
                "For news: briefly mention the top headline.",
                "Keep it short (1-2 sentences), warm, and enthusiastic. DO NOT ignore the tool result.",
              ].join("\n"),
            });
          } else if (actionResult.status === "needs_connection") {
            actionSystemMessages.push({
              role: "system" as const,
              content: [
                "TOOL RESULT — CONNECTION NEEDED:",
                resultJson,
                "",
                "The user wants to do something that requires connecting an account first.",
                "Warmly explain they need to connect the service and offer to help set it up.",
              ].join("\n"),
            });
          } else if (actionResult.status === "needs_input") {
            actionSystemMessages.push({
              role: "system" as const,
              content: [
                "TOOL RESULT — MORE INFO NEEDED:",
                resultJson,
                "",
                "The tool needs more information. Ask the user for the missing detail in a natural way.",
              ].join("\n"),
            });
          } else {
            actionSystemMessages.push({
              role: "system" as const,
              content: [
                "TOOL RESULT — FAILED:",
                resultJson,
                "",
                "The tool didn't work. Briefly acknowledge the issue and offer an alternative.",
              ].join("\n"),
            });
          }
        }

        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            ...actionSystemMessages,
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
          userName,
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
    briefing: publicProcedure.mutation(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const memoryFacts = await listUserMemoryFacts(userId);
      const profile = await getUserMemoryProfile(userId);

      const assistantNameFact = memoryFacts.find(
        (f: any) => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "Flow Guru";
      const userName = ctx.user?.name || "Brandon";

      const locationFact = memoryFacts.find(
        (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const location = locationFact?.factValue || null;

      // Dynamic import to keep the bundle lean
      const { generateBriefing } = await import("./_core/briefing");
      const result = await generateBriefing({
        userId,
        userName,
        assistantName,
        location,
        wakeUpTime: profile?.wakeUpTime ?? null,
      });

      return result;
    }),
    quickSound: publicProcedure
      .input(z.object({
        type: z.enum(["focus", "relax", "wake_up", "wind_down", "rain", "nature"]),
        durationSeconds: z.number().min(5).max(30).optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateQuickSound } = await import("./_core/briefing");
        return await generateQuickSound(input.type, input.durationSeconds ?? 15);
      }),
    speak: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(2000),
        voiceId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { textToSpeech } = await import("./_core/elevenLabs");
        const buffer = await textToSpeech({
          text: input.text,
          voiceId: input.voiceId,
          stability: 0.6,
          similarityBoost: 0.8,
        });
        return {
          audioDataUri: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;