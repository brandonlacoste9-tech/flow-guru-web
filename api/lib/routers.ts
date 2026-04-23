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
  calendar: router({
    list: publicProcedure
      .input(z.object({
        startAt: z.string(),
        endAt: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        return await listLocalEvents(userId, new Date(input.startAt), new Date(input.endAt));
      }),
    create: publicProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        startAt: z.string(),
        endAt: z.string(),
        location: z.string().optional(),
        allDay: z.boolean().default(false),
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
        });
        return { id };
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        location: z.string().nullable().optional(),
        allDay: z.boolean().optional(),
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
    delete: publicProcedure
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

      // Find user's assistant name
      const assistantNameFact = memoryFacts.find(
        f => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "Flow Guru";

      // Find user's location from memory
      const locationFact = memoryFacts.find(
        f => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const userLocation = locationFact?.factValue || null;

      // Fetch weather + calendar in parallel (non-blocking)
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

          return {
            tempC: Math.round(c.temperature_2m),
            feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
            label,
            locationName: geo.name || userLocation,
          };
        } catch { return null; }
      })();

      const calendarPromise = (async (): Promise<CalendarItem[]> => {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const results: CalendarItem[] = [];

        // Local events (always available)
        try {
          const localEvts = await listLocalEvents(userId, startOfDay, endOfDay);
          for (const e of localEvts) {
            results.push({
              title: e.title,
              start: e.startAt ? e.startAt.toISOString() : null,
              allDay: Boolean(e.allDay ?? false),
            });
          }
        } catch { /* ignore */ }

        // Google Calendar events (if connected)
        try {
          const { listGoogleCalendarEvents } = await import("./_core/googleCalendar.js");
          const conn = providerConnections.find((c: any) => c.provider === "google-calendar" && c.status === "connected");
          if (conn) {
            const result = await listGoogleCalendarEvents({
              userId,
              timeMinIso: now.toISOString(),
              timeMaxIso: endOfDay.toISOString(),
              maxResults: 5,
            });

            for (const e of result?.items ?? []) {
              results.push({
                title: (e as any).summary || "Untitled event",
                start: (e as any).start?.dateTime || (e as any).start?.date || null,
                allDay: !(e as any).start?.dateTime,
              });
            }
          }
        } catch { /* ignore */ }

        // Sort by start time
        results.sort((a, b) => {
          if (!a.start) return 1;
          if (!b.start) return -1;
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        });

        return results;
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

      const now = new Date();
      const userTimeZone = input.timeZone || "UTC";
      const dateStr = now.toLocaleDateString("en-US", { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: userTimeZone
      });
      const timeStr = now.toLocaleTimeString("en-US", { 
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: userTimeZone
      });

      const isGoogleConnected = (await listProviderConnections(userId)).some(c => c.provider === "google-calendar" && c.status === "connected");
      const isSpotifyConnected = (await listProviderConnections(userId)).some(c => c.provider === "spotify" && c.status === "connected");

      const systemPrompt = [
        `You are ${assistantName}, ${userName}'s personal Flow Guru and loyal buddy.`,
        `Current Time: ${timeStr} on ${dateStr}`,
        `User Timezone: ${input.timeZone || "UTC"}`,
        `Integrations: Google Calendar: ${isGoogleConnected ? 'CONNECTED' : 'NOT CONNECTED'}, Spotify: ${isSpotifyConnected ? 'CONNECTED' : 'NOT CONNECTED'}`,
        "",
        "PERSONALITY & TONE:",
        "- Be encouraging, high-energy, and effortlessly smooth. You're here to keep them in the zone.",
        "- Speak with a natural, conversational flow. Avoid robotic lists or choppy structures.",
        "- Use the user's name naturally. Reference their habits and saved memory (preferences, routine) in almost every reply.",
        "- Use human fillers like 'Ah', 'Got it', 'Actually', or 'Honestly' occasionally to keep the vibe casual and smooth.",
        "- If an integration is NOT CONNECTED and the user asks for related info, politely suggest they click the 'Connect' link in their dashboard.",
        "- Use contractions and occasional emojis. You're a buddy, not a bot.",
        "",
        "RULES:",
        "- Reply in 1-2 sentences max. Extreme brevity is key.",
        "- NEVER say 'I can help with...' or 'As an AI...'. Just do the work.",
        "- When you book or check something, confirm with enthusiasm: 'Done! Physio with Rick is in for 9:30 AM tomorrow. You got this!'",
        "",
        "THINGS YOU CAN DO (but never mention these to the user):",
        "- Book events on Google Calendar",
        "- List upcoming calendar events",
        "- Check weather for any city",
        "- Get directions and travel times",
        "- Set reminders (via calendar)",
        "- Play music, playlists, and artists on Spotify or via sound generation",
        "- Browse the live web to find answers or perform tasks",
        "- Delegate complex or multi-step system tasks (shell, files, script execution) to an autonomous sub-agent",
        "",
        "AUTONOMOUS AGENT PROTOCOL (The Manus Loop):",
        "1. ANALYZE: Process the user intent and current project state.",
        "2. SELECT: Choose the precise tool (Browser or Sub-Agent) for the next step.",
        "3. OBSERVE: You must wait for the tool output. Do not hallucinate results.",
        "4. ITERATE: If the sub-agent needs more steps, delegate them one by one until the goal is finished.",
        "",
        `The user's saved memory:`,
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
        console.error("[Flow Guru] SYSTEM FAILURE:", error);
        if (error instanceof Error) {
          console.error("[Flow Guru] Stack:", error.stack);
        }
        actionResult = {
          action: "none",
          status: "failed",
          title: "Action unavailable",
          summary: "I hit a snag while trying to carry that out, so I’ll respond conversationally instead.",
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
                "For music: say what's playing (e.g., 'Playing Drake on Spotify now 🔥').",
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
        f => f.factKey === "assistant_name" && f.category === "preference"
      );
      const assistantName = assistantNameFact?.factValue || "Flow Guru";
      const userName = ctx.user?.name || "Brandon";

      // Find location from memory
      const locationFact = memoryFacts.find(
        f => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
      );
      const location = locationFact?.factValue || null;

      const { generateBriefing } = await import("./_core/briefing.js");
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
        const { generateQuickSound } = await import("./_core/briefing.js");
        return await generateQuickSound(input.type, input.durationSeconds ?? 15);
      }),
    speak: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(2000),
        voiceId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = await resolveAssistantUserId(ctx.user);
        const memoryFacts = await listUserMemoryFacts(userId);
        const voiceFact = memoryFacts.find(f => f.factKey === "voice_id" || f.factKey === "preferred_voice");
        
        const { textToSpeech } = await import("./_core/elevenLabs.js");
        const buffer = await textToSpeech({
          text: input.text,
          voiceId: input.voiceId || voiceFact?.factValue,
          stability: 0.75, // Higher stability for smoother, less jittery delivery
          similarityBoost: 0.75,
        });
        return {
          audioDataUri: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
        };
      }),
  }),
  news: router({
    topHeadlines: publicProcedure
      .input(z.object({
        locale: z.string().optional().default("us"),
        categories: z.string().optional().default("general,technology,business"),
        limit: z.number().min(1).max(20).optional().default(10),
      }))
      .query(async ({ input }) => {
        const { ENV } = await import("./_core/env.js");
        const key = ENV.theNewsApiKey;
        if (!key) throw new Error("TheNewsAPI key not configured");
        const url = new URL("https://api.thenewsapi.com/v1/news/top");
        url.searchParams.set("api_token", key);
        url.searchParams.set("locale", input.locale);
        url.searchParams.set("categories", input.categories);
        url.searchParams.set("limit", String(input.limit));
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`TheNewsAPI error: ${res.status}`);
        const data = await res.json();
        return {
          articles: (data.data ?? []).map((a: any) => ({
            uuid: a.uuid,
            title: a.title,
            description: a.description ?? "",
            url: a.url,
            imageUrl: a.image_url ?? null,
            source: a.source ?? "",
            publishedAt: a.published_at ?? "",
            categories: a.categories ?? [],
          })),
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
