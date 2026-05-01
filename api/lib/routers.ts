import { COOKIE_NAME } from "./shared/const.js";
import { displayFirstName } from "../../shared/userDisplay.js";
import fs from "fs";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { invokeLLM, type Tool, type ToolCall } from "./_core/llm.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router, rateLimitedProcedure, protectedRateLimitedProcedure } from "./_core/trpc.js";
import {
  buildActionFallbackReply,
  executeAssistantAction,
  formatActionResultContext,
  planAssistantAction,
  type AssistantActionResult,
  type AssistantActionPlan,
} from "./assistantActions.js";
import {
  createConversationMessage,
  createConversationThread,
  createUserMemoryFacts,
  createLocalEvent,
  deleteLocalEvent,
  listLocalEvents,
  updateLocalEvent,
  findLatestConversationThread,
  getConversationThreadById,
  getUserMemoryProfile,
  listConversationMessages,
  listProviderConnections,
  listUserMemoryFacts,
  resolveAssistantUserId,
  touchConversationThread,
  upsertUserMemoryProfile,
  getUserById,
  listUserLists,
  getListItems,
  createList,
  addListItem,
  toggleListItem,
  deleteListItem,
  deleteList,
  updateList,
  updateListItem,
  setListItemReminder,
  deleteUserMemoryFact,
  updateUserPersona,
  upsertPushSubscription,
  countUserMessagesSince,
  getSubscriptionStatus,
  getSubscription,
} from "./db.js";
import { generateBriefing, generateQuickSound } from "./_core/briefing.js";
import { textToSpeech, getVoices } from "./_core/elevenLabs.js";
import { listGoogleCalendarEvents } from "./_core/googleCalendar.js";
import { detectDialogflowCxReply, isDialogflowCxConfigured } from "./_core/dialogflowCx.js";
import { MasterOrchestrator } from "../../server/_core/sub-agents/orchestrator.js";
import { searchMemories, storeMemory } from "./memory.js";

const sendMessageInput = z.object({
  message: z.string().trim().min(1).max(5000),
  timeZone: z.string().trim().min(1).max(100).optional(),
  threadId: z.number().int().positive().optional(),
  language: z.enum(['en', 'fr']).optional(),
  /** Browser geolocation — used as route.get origin when the user omits a starting place. */
  deviceLatitude: z.number().finite().gte(-90).lte(90).optional(),
  deviceLongitude: z.number().finite().gte(-180).lte(180).optional(),
  /** Per-install ID from the Expo app — maps to fg_users.openId mobile:<uuid>. */
  guestDeviceId: z.string().uuid().optional(),
});

const FREE_DAILY_ASSISTANT_MESSAGES = 10;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

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
      description: "Play music on the internal radio (Focus, Chill, Energy, Sleep, or Space stations)",
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
  {
    type: "function",
    function: {
      name: "manageList",
      description: "Manage personal lists (e.g., Grocery, Todo, Ideas)",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "add", "remove", "clear", "list", "rename", "update", "remind"], description: "The action to perform" },
          listName: { type: "string", description: "Name of the list (e.g. 'Grocery')" },
          itemContent: { type: "string", description: "The item to add, remove, or set reminder for" },
          time: { type: "string", description: "Natural language time (e.g. '5pm', 'tomorrow at 9am')" },
        },
        required: ["action", "listName"],
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
  return nameFacts.length > 0 ? nameFacts[nameFacts.length - 1].factValue : "FLO GURU";
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
        buddyPersonality: string | null;
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

  let context = [
    `User name: ${params.userName ?? "Unknown"}`,
    `Wake-up time: ${params.profile?.wakeUpTime ?? "Unknown"}`,
    `Daily routine: ${params.profile?.dailyRoutine ?? "Unknown"}`,
  ].join("\n");

  if (params.profile?.preferencesSummary) context += `\nPreferences: ${params.profile.preferencesSummary}`;
  if (params.profile?.buddyPersonality) context += `\nYour Assigned Personality: ${params.profile.buddyPersonality}`;
  if (params.profile?.recurringEventsSummary) context += `\nRecurring Events: ${params.profile.recurringEventsSummary}`;

  return [
    context,
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
    title: "FLO GURU Chat",
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
          "You extract durable user memory from conversations. Only capture facts about the user that are likely to remain useful in future conversations. Do not invent details. If nothing new appears, return nulls and an empty facts array.\n\nWhen the user shares a phone number or email for someone (e.g. \"my wife's number is …\", \"mom's email is …\"), save it as a memory fact with factKey contact_phone_wife or contact_email_mom using a short lowercase slug for the person (wife, jenny, mom). Prefer category preference or general.",
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
        strict: false,
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
                  factKey: { type: ["string", "null"] },
                  factValue: { type: "string" },
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

  // Robust JSON Extraction
  let jsonString = extractionText;
  const jsonMatch = extractionText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonString || "{}");
  } catch (error) {
    console.warn("[Flow Guru] Memory extraction returned invalid JSON.", error, "Raw text:", extractionText);
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

  // Store the full exchange in semantic memory (Vector Soul)
  await storeMemory(params.userId, `User: ${params.userMessage}\nAssistant: ${params.assistantReply}`, {
    timestamp: new Date().toISOString(),
    type: "conversation_exchange",
  });

  return {
    profileUpdated: hasProfileContent,
    factsAdded: newFacts.length,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  calendar: router({
    list: rateLimitedProcedure
      .input(z.object({
        startAt: z.string(),
        endAt: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        return await listLocalEvents(userId, new Date(input.startAt), new Date(input.endAt));
      }),
    create: rateLimitedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        startAt: z.string(),
        endAt: z.string(),
        location: z.string().optional(),
        allDay: z.boolean().default(false),
        color: z.string().optional(),
        reminderMinutes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const id = await createLocalEvent({
          userId,
          title: input.title,
          description: input.description ?? null,
          startAt: new Date(input.startAt),
          endAt: new Date(input.endAt),
          location: input.location ?? null,
          allDay: input.allDay ? 1 : 0,
          color: input.color ?? 'blue',
          reminderMinutes: input.reminderMinutes ?? '30,15,5',
        });
        return { id };
      }),
    update: rateLimitedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        location: z.string().nullable().optional(),
        allDay: z.boolean().optional(),
        color: z.string().optional(),
        reminderMinutes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const { id, allDay, startAt, endAt, ...rest } = input;
        await updateLocalEvent(userId, id, {
          ...rest,
          ...(startAt ? { startAt: new Date(startAt) } : {}),
          ...(endAt ? { endAt: new Date(endAt) } : {}),
          ...(allDay !== undefined ? { allDay: allDay ? 1 : 0 } : {}),
        });
        return { success: true };
      }),
    delete: rateLimitedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await deleteLocalEvent(userId, input.id);
        return { success: true };
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req as any);
      (ctx.res as any).clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  assistant: router({
    bootstrap: rateLimitedProcedure
      .input(z.object({ language: z.enum(["en", "fr"]).optional(), guestDeviceId: z.string().uuid().optional() }).default({}))
      .query(async ({ ctx, input }) => {
      const userId = await resolveAssistantUserId(ctx.user, input.guestDeviceId);
      const [profile, memoryFacts, thread, providerConnections, subscription] = await Promise.all([
        getUserMemoryProfile(userId),
        listUserMemoryFacts(userId),
        findLatestConversationThread(userId),
        listProviderConnections(userId),
        getSubscription(userId),
      ]);
      const safeThread = thread && thread.userId === userId ? thread : null;
      const messages = safeThread ? await listConversationMessages(safeThread.id) : [];

      const assistantNameFact = memoryFacts.find(
        (f: any) => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "FLO GURU";

      const locationFact = memoryFacts.find(
        (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const userLocation = locationFact?.factValue || null;

      type WeatherSnapshot = { tempC: number; feelsLikeC: number; label: string; locationName: string; lat?: number; lon?: number };
      type CalendarItem = { title: string; start: string | null; allDay: boolean };
      let weather: WeatherSnapshot | null = null;
      let todayEvents: CalendarItem[] = [];

      const weatherPromise = (async () => {
        if (!userLocation) return null;
        try {
          const plan = await planAssistantAction({ userName: displayFirstName(ctx.user) || undefined, memoryContext: `Location: ${userLocation}`, message: "current weather", language: input.language ?? 'en' });
          const result = await executeAssistantAction(plan, { userId, userName: displayFirstName(ctx.user) || undefined, message: "current weather", memoryContext: `Location: ${userLocation}`, language: input.language ?? 'en' });
          if (result.status === "executed" && result.data) {
            const data = result.data as Record<string, any>;
            const c = data.current as any;
            if (c) return {
              tempC: c.temperatureC,
              feelsLikeC: c.apparentTemperatureC,
              label: c.weatherLabel,
              locationName: data.location as string,
              lat: data.lat as number | undefined,
              lon: data.lon as number | undefined,
            };
          }
        } catch (e) {
          console.error("[Flow Guru] Weather bootstrap failed:", e);
        }
        return null;
      })();

      const calendarPromise = (async () => {
        const results: CalendarItem[] = [];
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        try {
          const local = await listLocalEvents(userId, now, endOfDay);
          for (const e of local) {
            results.push({ title: e.title, start: e.startAt ? e.startAt.toISOString() : null, allDay: !!e.allDay });
          }
        } catch { /* ignore */ }

        try {
          const conn = providerConnections.find((c: any) => c.provider === "google-calendar" && c.status === "connected");
          if (conn) {
            const result = await listGoogleCalendarEvents({ userId, timeMinIso: now.toISOString(), timeMaxIso: endOfDay.toISOString(), maxResults: 5 });
            for (const e of result?.items ?? []) {
              results.push({ title: (e as any).summary || "Untitled event", start: (e as any).start?.dateTime || (e as any).start?.date || null, allDay: !(e as any).start?.dateTime });
            }
          }
        } catch { /* ignore */ }

        results.sort((a, b) => (!a.start ? 1 : !b.start ? -1 : new Date(a.start).getTime() - new Date(b.start).getTime()));
        return results;
      })();

      [weather, todayEvents] = await Promise.all([weatherPromise, calendarPromise]);

      // --- Generate Proactive Greeting ---
      let proactiveGreeting: string | null = null;
      if (messages.length === 0) {
        try {
          const userName = displayFirstName(ctx.user) || (input.language === 'fr' ? "toi" : "there");
          const language = input.language ?? 'en';
          const weatherContext = weather ? `${weather.tempC}°C and ${weather.label} in ${weather.locationName}` : "";
          
          const timeGreeting = language === 'en' 
            ? (new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening")
            : (new Date().getHours() < 12 ? "Bonjour" : new Date().getHours() < 17 ? "Bon après-midi" : "Bonsoir");
          
          if (language === 'en') {
            const eventsContext = todayEvents.length > 0 
              ? `You have ${todayEvents.length} event${todayEvents.length > 1 ? 's' : ''} today.`
              : "Your schedule is clear today.";
            proactiveGreeting = `${timeGreeting}, ${userName}. ${weatherContext ? `It's currently ${weatherContext}. ` : ''}${eventsContext}`;
          } else {
            const weatherContextFr = weather ? `${weather.tempC}°C et ${weather.label === 'clear' ? 'ciel dégagé' : weather.label} à ${weather.locationName}` : "";
            const eventsContextFr = todayEvents.length > 0 
              ? `Vous avez ${todayEvents.length} événement${todayEvents.length > 1 ? 's' : ''} aujourd'hui.`
              : "Votre emploi du temps est libre aujourd'hui.";
            proactiveGreeting = `${timeGreeting}, ${userName}. ${weatherContextFr ? `Il fait actuellement ${weatherContextFr}. ` : ''}${eventsContextFr}`;
          }
        } catch (e) {
          console.error("[Flow Guru] Failed to generate proactive greeting", e);
        }
      }

      return {
        profile,
        memoryFacts,
        thread: safeThread,
        messages,
        providerConnections,
        assistantName,
        weather,
        todayEvents,
        proactiveGreeting,
        subscription,
      };
    }),
    startFresh: rateLimitedProcedure
      .input(z.object({ guestDeviceId: z.string().uuid().optional() }).default({}))
      .mutation(async ({ ctx, input }) => {
      const userId = await resolveAssistantUserId(ctx.user, input.guestDeviceId);
      const threadId = await createConversationThread({
        userId,
        title: "FLO GURU Chat",
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
    getUserContext: rateLimitedProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const [profile, memoryFacts, providerConnections, subscription] = await Promise.all([
        getUserMemoryProfile(userId),
        listUserMemoryFacts(userId),
        listProviderConnections(userId),
        getSubscription(userId),
      ]);

      const thread = await findLatestConversationThread(userId);
      const messages = thread ? await listConversationMessages(thread.id) : [];

      // Get current weather if location is known
      const locationFact = memoryFacts.find(
        (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const userLocation = locationFact?.factValue || null;
      
      let weather = null;
      if (userLocation) {
        try {
          const plan = await planAssistantAction({ 
            userName: ctx.user?.name, 
            memoryContext: `Location: ${userLocation}`, 
            message: "current weather", 
            language: 'en' 
          });
          const result = await executeAssistantAction(plan, { 
            userId, 
            userName: ctx.user?.name, 
            message: "current weather", 
            memoryContext: `Location: ${userLocation}`, 
            language: 'en' 
          });
          if (result.status === "executed" && result.data) {
            weather = result.data;
          }
        } catch (e) {}
      }

      // Get today's events
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const todayEvents = await listLocalEvents(userId, now, endOfDay);

      return {
        profile,
        memoryFacts,
        providerConnections,
        subscription,
        thread,
        messages,
        weather,
        todayEvents,
      };
    }),
    history: rateLimitedProcedure
      .input(z.object({ guestDeviceId: z.string().uuid().optional() }).default({}))
      .query(async ({ ctx, input }) => {
      const userId = await resolveAssistantUserId(ctx.user, input.guestDeviceId);
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
    send: rateLimitedProcedure
      .input(sendMessageInput).mutation(async ({ ctx, input }) => {
      const userId = await resolveAssistantUserId(ctx.user, input.guestDeviceId);
      const threadId = await getOrCreateThreadId(userId, input.threadId);

      const subscription = await getSubscriptionStatus(userId);
      const isPro = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
      if (!isPro) {
        const dailyMessages = await countUserMessagesSince(userId, startOfUtcDay());
        if (dailyMessages >= FREE_DAILY_ASSISTANT_MESSAGES) {
          const reply = input.language === 'fr'
            ? "Ton palier gratuit est termine pour aujourd'hui. Passe a Flow Guru Monthly pour continuer sans attendre."
            : "Your free tier is over for today. Upgrade to Flow Guru Monthly to keep chatting without waiting.";
          await createConversationMessage({ threadId, userId, role: "assistant", content: reply });
          await touchConversationThread(threadId);
          const messages = await listConversationMessages(threadId);
          return {
            threadId,
            reply,
            messages,
            memoryUpdate: { profileUpdated: false, factsAdded: 0 },
            actionResult: null,
            billing: {
              plan: "free",
              limit: FREE_DAILY_ASSISTANT_MESSAGES,
              used: dailyMessages,
              limitReached: true,
            },
          };
        }
      }

      await createConversationMessage({
        threadId,
        userId,
        role: "user",
        content: input.message,
      });

      const [profile, memoryFacts, history] = await Promise.all([
        getUserMemoryProfile(userId),
        listUserMemoryFacts(userId),
        listConversationMessages(threadId),
      ]);

      // --- Name change detection (fast path, before planner) ---
      const nameChangeMatch = input.message.match(
        /(?:call\s+(?:you|yourself)|your\s+name\s+is|rename\s+(?:you|yourself)\s+(?:to)?|I(?:'ll| will)\s+call\s+you|appelle-moi|ton\s+nom\s+est|nomme-toi|je\s+t'appellerai)\s+["']?([A-Za-z][A-Za-z0-9 ]{0,29})["']?/i
      );
      if (nameChangeMatch) {
        const newName = nameChangeMatch[1].trim();
        await createUserMemoryFacts(userId, [
          { category: "preference", factKey: "assistant_name", factValue: newName, confidence: 100 },
        ]);
        const reply = input.language === 'fr' ? `C'est noté ! Désormais, je m'appelle ${newName} 😊` : `Got it! From now on I'm ${newName} 😊`;
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
      const assistantName = assistantNameFact?.factValue || "FLO GURU";
      const userFirstName = displayFirstName(ctx.user);
      const userName = userFirstName || "Unknown";

      // --- Semantic Memory Search (New Soul Phase) ---
      const semanticMemories = await searchMemories(userId, input.message, 5);
      const memoryRecallContext = semanticMemories.length > 0 
        ? `\nRECALLED MEMORIES (based on user query):\n${semanticMemories.map((m: any) => `- ${m.content}`).join("\n")}`
        : "";

      let memoryContext = buildMemoryContext({
        userName,
        profile,
        facts: memoryFacts,
      }) + memoryRecallContext;

      if (
        input.deviceLatitude != null &&
        input.deviceLongitude != null &&
        Number.isFinite(input.deviceLatitude) &&
        Number.isFinite(input.deviceLongitude)
      ) {
        memoryContext += `\n\nApproximate current device location (latitude, longitude): ${input.deviceLatitude}, ${input.deviceLongitude}. For route.get, if the user asks for directions or driving time without naming where they start (e.g. only 'to the airport', 'how far to X'), leave route.origin null so the route starts from this position.`;
      }

      const systemPrompt = [
        userFirstName
          ? `You are ${assistantName}, ${userFirstName}'s personal assistant.`
          : `You are ${assistantName}, this user's personal assistant.`,
        profile?.buddyPersonality ? `Your personality profile: ${profile.buddyPersonality}` : "You sound like a close friend. Short, warm, direct. Never robotic.",
        "",
        "RULES:",
        "- Reply in 1-2 sentences max. Be concise.",
        "- NEVER list what you can do. NEVER say 'I can help with...' or 'Would you like me to...'",
        "- When you book something, confirm briefly: 'Done — physio with Rick is on your calendar for tomorrow at 9:30 AM.'",
        "- When you check weather, share the actual data: 'It's 18°C and partly cloudy in Toronto right now.'",
        "- When the user mentions a time or event, just book it. Don't ask for confirmation.",
        "- Use the user's name and saved memory naturally. Reference their habits.",
        "- Sound human: contractions, casual tone, occasional emoji.",
        "",
        `CRITICAL: You MUST reply in ${input.language === 'fr' ? 'FRENCH' : 'ENGLISH'}. All confirmations and conversational text must be in this language.`,
        "",
        "THINGS YOU CAN DO (but never mention these to the user):",
        "- Book events on Google Calendar",
        "- List upcoming calendar events",
        "- Check weather for any city",
        "- Get directions and travel times",
        "- Call, text, or email saved contacts when their numbers or emails are stored in memory",
        "- Set reminders (via calendar)",
        "",
        `The user's saved memory:`,
        memoryContext,
      ].join("\n");

      let actionResults: AssistantActionResult[] = [];
      const actionSystemMessages: Array<{ role: "system"; content: string }> = [];

      try {
        const orchestrator = new MasterOrchestrator();
        const currentMemoryContext = buildMemoryContext({
          userName,
          profile,
          facts: memoryFacts,
        });

        actionResults = await orchestrator.route(input.message, {
          userId,
          userName,
          memoryContext: currentMemoryContext,
          timeZone: input.timeZone ?? null,
          language: input.language ?? 'en',
          deviceLatitude: input.deviceLatitude,
          deviceLongitude: input.deviceLongitude,
        }, history.slice(-10).map(m => ({ role: m.role as any, content: m.content })));

        for (const result of actionResults) {
          const resultJson = formatActionResultContext(result);
          if (result.status === "executed") {
            actionSystemMessages.push({
              role: "system" as const,
              content: `TOOL RESULT (${result.action}):\n${resultJson}`,
            });
          } else {
            actionSystemMessages.push({
              role: "system" as const,
              content: `TOOL NOTIFY (${result.action}): ${result.status === "needs_connection" ? "Connection required" : result.status === "needs_input" ? "More info needed" : "Failed"}\n${resultJson}`,
            });
          }
        }
        
        // If no specialized agents were called, fallback to the generic planner for basic chat actions (weather, news, etc.)
        if (actionResults.length === 0) {
          const plannedAction = await planAssistantAction({
            userName,
            memoryContext: currentMemoryContext,
            message: input.message,
            language: input.language ?? 'en',
          });
          
          if (plannedAction.action !== "none") {
            const result = await executeAssistantAction(plannedAction, {
              userId,
              userName,
              message: input.message,
              memoryContext: currentMemoryContext,
              timeZone: input.timeZone ?? null,
              language: input.language ?? 'en',
            });
            actionResults.push(result);
            actionSystemMessages.push({
              role: "system" as const,
              content: `TOOL RESULT (${plannedAction.action}):\n${formatActionResultContext(result)}`,
            });
          }
        }
      } catch (error) {
        console.error("[Flow Guru] ORCHESTRATION ERROR:", error);
      }

      let assistantReply = buildActionFallbackReply(actionResults[0] || null);

      try {
        // PERF: Dialogflow CX (optional) vs LLM for conversational replies
        let usedDialogflowCx = false;
        if (
          isDialogflowCxConfigured() &&
          actionResults.length === 0
        ) {
          const cxReply = await detectDialogflowCxReply({
            threadId,
            message: input.message,
            language: input.language,
          });
          if (cxReply) {
            assistantReply = cxReply;
            usedDialogflowCx = true;
          }
        }

        if (!usedDialogflowCx) {
          const llmResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              ...actionSystemMessages,
              ...history.slice(-15).map((m: any) => ({
                role: m.role as "user" | "assistant",
                content: m.content as string,
              })),
            ],
          });

          assistantReply = extractAssistantText(llmResponse.choices[0]?.message.content ?? "") || assistantReply;
        }
      } catch (error) {
        console.error("[Flow Guru] Chat generation failed.", error);
      }

      await createConversationMessage({
        threadId,
        userId,
        role: "assistant",
        content: assistantReply,
      });
      await touchConversationThread(threadId);

      // PERF: Fire-and-forget memory extraction to return response immediately
      extractAndPersistMemory({
        userId,
        userName: userFirstName || null,
        userMessage: input.message,
        assistantReply,
      }).catch(err => console.warn("[Flow Guru] Background memory extraction failed:", err));

      const updatedMessages = await listConversationMessages(threadId);

      return {
        threadId,
        reply: assistantReply,
        messages: updatedMessages,
        memoryUpdate: { profileUpdated: false, factsAdded: 0 }, // Backgrounded
        actionResult: actionResults[0] || null, // Return first result for UI compatibility
      };
    }),
    briefing: publicProcedure.mutation(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const memoryFacts = await listUserMemoryFacts(userId);
      const profile = await getUserMemoryProfile(userId);

      const assistantNameFact = memoryFacts.find(
        (f: any) => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "FLO GURU";
      const userName = displayFirstName(ctx.user);

      const locationFact = memoryFacts.find(
        (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const location = locationFact?.factValue || null;

      // Dynamic import to keep the bundle lean
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
      return await generateQuickSound(input.type, input.durationSeconds ?? 15);
      }),
    speak: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(2000),
        voiceId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
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
    getBriefing: publicProcedure
      .query(async ({ ctx }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const [profile, memoryFacts, allLists] = await Promise.all([
          getUserMemoryProfile(userId),
          listUserMemoryFacts(userId),
          listUserLists(userId),
        ]);

        const locationFact = memoryFacts.find(f => f.factKey === "location" || f.factKey === "city");
        const userLocation = locationFact?.factValue || null;

        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        // Weather
        let weather = null;
        if (userLocation) {
          try {
            const { planAssistantAction, executeAssistantAction } = await import("./assistantActions.js");
            const plan = await planAssistantAction({ userName: displayFirstName(ctx.user) || undefined, message: "current weather", memoryContext: `Location: ${userLocation}`, language: 'en' });
            const result = await executeAssistantAction(plan, { userId, userName: displayFirstName(ctx.user) || undefined, message: "current weather", memoryContext: `Location: ${userLocation}`, language: 'en' });
            if (result.status === "executed") weather = result.data;
          } catch {}
        }

        // Calendar
        const calendar = await listLocalEvents(userId, now, endOfDay);

        // Lists
        const listSnapshots = [];
        for (const list of allLists) {
          const items = await getListItems(userId, list.id);
          const pending = items.filter(i => !i.completed);
          if (pending.length > 0) {
            listSnapshots.push({ name: list.name, items: pending.map(i => i.content) });
          }
        }

        return {
          weather,
          calendar: calendar.map(e => ({ title: e.title, start: e.startAt })),
          lists: listSnapshots,
          assistantName: getAssistantName(memoryFacts),
          userName: displayFirstName(ctx.user),
        };
      }),
  }),
  settings: router({
    getProfile: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const profile = await getUserMemoryProfile(userId);
      const facts = await listUserMemoryFacts(userId);
      const customInstructions = facts.find((f: any) => f.factKey === 'custom_instructions')?.factValue ?? '';
      return {
        wakeUpTime: (profile as any)?.wakeUpTime ?? '',
        dailyRoutine: (profile as any)?.dailyRoutine ?? '',
        preferencesSummary: (profile as any)?.preferencesSummary ?? '',
        customInstructions,
        alarmSound: (profile as any)?.alarmSound ?? 'chime',
        alarmDays: (profile as any)?.alarmDays ?? '0,1,2,3,4,5,6',
        voiceId: (profile as any)?.voiceId ?? '',
        buddyPersonality: (profile as any)?.buddyPersonality ?? '',
      };
    }),
    saveProfile: publicProcedure
      .input(z.object({
        wakeUpTime: z.string().optional(),
        dailyRoutine: z.string().optional(),
        preferencesSummary: z.string().optional(),
        alarmSound: z.string().optional(),
        alarmDays: z.string().optional(),
        voiceId: z.string().optional(),
        buddyPersonality: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await upsertUserMemoryProfile(userId, {
          wakeUpTime: input.wakeUpTime ?? null,
          dailyRoutine: input.dailyRoutine ?? null,
          preferencesSummary: input.preferencesSummary ?? null,
          alarmSound: input.alarmSound ?? null,
          alarmDays: input.alarmDays ?? null,
          voiceId: input.voiceId ?? null,
          buddyPersonality: input.buddyPersonality ?? null,
        });
        return { success: true };
      }),
    getVoices: publicProcedure.query(async () => {
      return await getVoices();
    }),
    getMemoryFacts: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      return await listUserMemoryFacts(userId);
    }),
    deleteMemoryFact: publicProcedure
      .input(z.object({ factId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await deleteUserMemoryFact(userId, input.factId);
        return { success: true };
      }),
    addMemoryFact: publicProcedure
      .input(z.object({ factKey: z.string(), factValue: z.string(), category: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await createUserMemoryFacts(userId, [{
          factKey: input.factKey,
          factValue: input.factValue,
          category: (input.category as any) ?? 'general',
          confidence: 100,
        }]);
        return { success: true };
      }),
    getPersona: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const user = await getUserById(userId);
      return {
        personaName: user?.personaName ?? '',
        personaStyle: user?.personaStyle ?? '',
      };
    }),
    savePersona: publicProcedure
      .input(z.object({ personaName: z.string(), personaStyle: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await updateUserPersona(userId, input.personaName, input.personaStyle);
        return { success: true };
      }),
    getReferralInfo: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      const user = await getUserById(userId);
      return {
        referralCode: (user as any)?.referralCode ?? '',
        credits: (user as any)?.credits ?? 0,
      };
    }),
    saveCustomInstructions: publicProcedure
      .input(z.object({ instructions: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await createUserMemoryFacts(userId, [{
          factKey: 'custom_instructions',
          factValue: input.instructions,
          category: 'preference',
          confidence: 100,
        }]);
        return { success: true };
      }),
  }),
  news: router({
    topHeadlines: publicProcedure
      .input(z.object({
        limit: z.number().optional(),
        locale: z.string().optional(),
        categories: z.string().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const url = new URL("https://actually-relevant-api.onrender.com/api/stories");
          // Map common categories to issueSlugs if needed
          const cat = input.categories?.toLowerCase() || "";
          if (cat.includes("tech")) url.searchParams.set("issueSlug", "science-technology");
          else if (cat.includes("science")) url.searchParams.set("issueSlug", "science-technology");
          else if (cat.includes("planet") || cat.includes("climate")) url.searchParams.set("issueSlug", "planet-climate");
          
          const resp = await fetch(url.toString());
          if (!resp.ok) return { articles: [] };
          const payload = await resp.json() as any;
          const stories = payload.data || [];
          return {
            articles: stories.map((s: any) => ({
              uuid: s.id,
              title: s.title,
              description: s.summary || s.blurb || "",
              url: s.sourceUrl || "#",
              imageUrl: s.imageUrl || null,
              source: s.sourceTitle || "News",
              publishedAt: s.datePublished || new Date().toISOString(),
              categories: [s.slug],
            }))
          };
        } catch (e) {
          return { articles: [] };
        }
      }),
  }),
  push: router({
    register: publicProcedure
      .input(z.object({
        subscription: z.object({
          endpoint: z.string(),
          keys: z.object({
            p256dh: z.string(),
            auth: z.string(),
          }),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await upsertPushSubscription(userId, input.subscription);
        return { success: true };
      }),
  }),
  list: router({
    all: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      return await listUserLists(userId);
    }),
    items: publicProcedure
      .input(z.object({ listId: z.number() }))
      .query(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        return await getListItems(userId, input.listId);
      }),
    create: publicProcedure
      .input(z.object({ name: z.string().min(1).max(100), icon: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const id = await createList(userId, input.name, input.icon);
        return { id };
      }),
    addItem: publicProcedure
      .input(z.object({ listId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const id = await addListItem(userId, input.listId, input.content);
        return { id };
      }),
    toggleItem: publicProcedure
      .input(z.object({ itemId: z.number(), completed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await toggleListItem(userId, input.itemId, input.completed);
        return { success: true };
      }),
    deleteItem: publicProcedure
      .input(z.object({ itemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await deleteListItem(userId, input.itemId);
        return { success: true };
      }),
    deleteList: publicProcedure
      .input(z.object({ listId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await deleteList(userId, input.listId);
        return { success: true };
      }),
    updateList: publicProcedure
      .input(z.object({ listId: z.number(), name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await updateList(userId, input.listId, input.name);
        return { success: true };
      }),
    updateItem: publicProcedure
      .input(z.object({ itemId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await updateListItem(userId, input.itemId, input.content);
        return { success: true };
      }),
    setReminder: publicProcedure
      .input(z.object({ itemId: z.number(), reminderAt: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        await setListItemReminder(userId, input.itemId, input.reminderAt ? new Date(input.reminderAt) : null);
        return { success: true };
      }),
    getSubscription: publicProcedure.query(async ({ ctx }) => {
      const userId = await resolveAssistantUserId(ctx.user);
      return await getSubscription(userId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
