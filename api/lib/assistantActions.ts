import fs from "fs";
import { z } from "zod";
import { getProviderConnection, createLocalEvent } from "./db.js";
import {
  createGoogleCalendarEvent,
  listGoogleCalendarEvents,
} from "./_core/googleCalendar.js";
import { invokeLLM } from "./_core/llm.js";
import { DirectionsResult, GeocodingResult, makeRequest, type TravelMode } from "./_core/map.js";
import { searchAndPlaySpotify } from "./_core/spotify.js";

const ACTION_NAMES = [
  "none",
  "calendar.create_event",
  "calendar.list_events",
  "music.play",
  "route.get",
  "weather.get",
  "news.get",
  "browser.use",
  "system.subagent",
  "list.manage",
] as const;

const NEWS_ISSUE_SLUGS = [
  "human-development",
  "planet-climate",
  "existential-threats",
  "science-technology",
] as const;

const plannerSchema = z.object({
  action: z.enum(ACTION_NAMES),
  rationale: z.string().optional().nullable(),
  browser: z
    .object({
      task: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  subagent: z
    .object({
      task: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  route: z
    .object({
      origin: z.string().optional().nullable(),
      destination: z.string().optional().nullable(),
      mode: z.enum(["driving", "walking", "bicycling", "transit"]).optional().nullable(),
    })
    .optional()
    .nullable(),
  weather: z
    .object({
      location: z.string().optional().nullable(),
      timeframe: z.enum(["current", "today", "tomorrow", "next_days"]).optional().nullable(),
    })
    .optional()
    .nullable(),
  news: z
    .object({
      issueSlug: z.enum(NEWS_ISSUE_SLUGS).optional().nullable(),
      interestLabel: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(5).optional().nullable(),
    })
    .optional()
    .nullable(),
  calendar: z
    .object({
      title: z.string().optional().nullable(),
      startDescription: z.string().optional().nullable(),
      endDescription: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  music: z
    .object({
      query: z.string().optional().nullable(),
      targetType: z.enum(["playlist", "artist", "album", "track", "liked"]).optional().nullable(),
    })
    .optional()
    .nullable(),
  list: z
    .object({
      action: z.enum(["create", "add", "remove", "clear", "list", "rename", "update", "remind"]).optional().nullable(),
      listName: z.string().optional().nullable(),
      itemContent: z.string().optional().nullable(),
      newName: z.string().optional().nullable(),
      time: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const calendarResolutionSchema = z.object({
  title: z.string().nullable(),
  startIso: z.string().nullable(),
  endIso: z.string().nullable(),
  timeMinIso: z.string().nullable(),
  timeMaxIso: z.string().nullable(),
  searchQuery: z.string().nullable(),
});

export type AssistantActionPlan = z.infer<typeof plannerSchema>;

export type AssistantActionResult = {
  action: (typeof ACTION_NAMES)[number];
  status: "executed" | "needs_input" | "needs_connection" | "failed";
  title: string;
  summary: string;
  provider?: string;
  data?: Record<string, unknown>;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractTextContent(content: string | Array<{ type: string; text?: string }>) {
  if (typeof content === "string") {
    return content.trim();
  }

  return content
    .map(part => (part.type === "text" && part.text ? part.text : ""))
    .join("\n")
    .trim();
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toJsonSchemaEnum<T extends readonly string[]>(values: T) {
  return [...values];
}

function weatherCodeToLabel(code: number | null | undefined) {
  const labels: Record<number, string> = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
  };

  return labels[code ?? -1] ?? "Unspecified conditions";
}

type ActuallyRelevantStory = {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  blurb?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  datePublished?: string;
};

type ActuallyRelevantResponse = {
  data?: ActuallyRelevantStory[];
};

type OpenMeteoResponse = {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

type ExtendedDirectionsResult = DirectionsResult & {
  routes: Array<
    DirectionsResult["routes"][number] & {
      legs: Array<
        DirectionsResult["routes"][number]["legs"][number] & {
          duration_in_traffic?: { text: string; value: number };
        }
      >;
    }
  >;
};

function deriveNewsIssueSlug(input: { interestLabel: string | null; memoryContext?: string | null }) {
  const label = [input.interestLabel ?? "", input.memoryContext ?? ""].join(" \n ").toLowerCase().trim();

  if (!label) {
    return null;
  }

  if (/(ai|technology|tech|product|software|startup|science|robot|future)/.test(label)) {
    return "science-technology" as const;
  }

  if (/(climate|environment|energy|sustainability|weather|planet|earth)/.test(label)) {
    return "planet-climate" as const;
  }

  if (/(health|education|workplace|policy|housing|equity|community|wellbeing|well-being)/.test(label)) {
    return "human-development" as const;
  }

  if (/(risk|safety|security|war|conflict|biosecurity|pandemic|threat)/.test(label)) {
    return "existential-threats" as const;
  }

  return null;
}

export async function planAssistantAction(params: {
  userName: string | null | undefined;
  memoryContext: string;
  message: string;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "You are Flow Guru's intent classifier. Your ONLY job is to decide which tool to call.",
          "ALWAYS choose an action when possible — err on the side of calling a tool rather than returning 'none'.",
          "",
          "AVAILABLE TOOLS:",
          "- calendar.create_event: For scheduling appointments, meetings, or time-based events. NEVER use this for grocery lists, shopping items, chores, tasks, or todos. If it's a chore or a list item, use list.manage instead.",
          "- calendar.list_events: For checking a schedule or listing upcoming items.",
          "- weather.get: For checking current or future weather conditions.",
          "- route.get: For travel times, directions, or distances between points.",
          "- music.play: For playing music on Spotify.",
          "- news.get: For latest headlines or specific news issues.",
          "- browser.use: For browsing the web to find answers, research topics, or perform web-based tasks.",
          "- system.subagent: For ANY complex system tasks: file operations, terminal commands, writing scripts, running Python, or performing multi-step autonomous actions on the user's machine.",
          "- list.manage: For creating, adding items, removing items, clearing, or listing smart collections (like grocery lists, todos, or ideas).",
          "- none: Use this for general conversation or if no tool fits.",
          "",
          "AGENT DELEGATION RULES:",
          "- If the user asks to 'Add [item] to my [list]', 'Create a [list] list', or 'What's on my [list]?', use 'list.manage'.",
          "- If the user mentions single items, groceries, chores, or shopping items, use 'list.manage'.",
          "- NEVER use 'calendar.create_event' for groceries, bread, milk, eggs, or simple shopping items.",
          "- Only use 'calendar.create_event' for meetings, appointments, or scheduled blocks of time with a specific duration.",
          "- If the user says 'Remind me to [item]' and the item is a grocery or small task, use 'list.manage' with action 'remind'.",
          "- If the user asks to 'Check XYZ website', 'Search for...', or 'Find out who won...', use 'browser.use'.",
          "- If the user asks to 'Add a file', 'Create a folder', 'Python script', 'Run a command', or 'Do a system audit', use 'system.subagent'.",
          "",
          "CRITICAL: Any mention of 'list', 'shopping', 'grocery', 'bread', 'milk', 'eggs', 'todo', 'pack' MUST go to 'list.manage'.",
          "",
          "Resolve defaults from saved memory when possible. If a field is unclear, leave it null — do NOT return 'none' just because a detail is missing.",
          "",
          "RESPONSE FORMAT: You MUST respond with a single JSON object (no markdown, no code blocks, no explanation). The JSON must have these keys:",
          '{ "action": "<tool_name>", "rationale": "<why>", "route": null, "weather": null, "news": null, "calendar": null, "music": null, "browser": null, "subagent": null, "list": null }',
          "",
          "For list.manage, populate the list field:",
          '{ "action": "list.manage", "rationale": "...", "list": { "action": "add", "listName": "Grocery", "itemContent": "bread", "newName": null, "time": null, "location": null }, ... }',
          "list.action can be: create, add, remove, clear, list, rename, update, remind",
          "For list.action 'remind', you can provide 'time' for time-based reminders or 'location' for location-based reminders (e.g. 'store', 'work').",
          "Example location reminder: { \"action\": \"remind\", \"listName\": \"Grocery\", \"itemContent\": \"milk\", \"location\": \"store\" }",
          "",
          "For calendar.create_event, populate the calendar field:",
          '{ "action": "calendar.create_event", "rationale": "...", "calendar": { "title": "...", "startDescription": "...", "endDescription": "..." }, ... }',
          "",
          "For weather.get, populate the weather field:",
          '{ "action": "weather.get", "rationale": "...", "weather": { "location": "...", "timeframe": "current" }, ... }',
          "",
          "ONLY respond with the JSON object. No other text.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `User name: ${params.userName ?? "Unknown"}`,
          "Saved memory:",
          params.memoryContext,
          "Current message:",
          params.message,
        ].join("\n\n"),
      },
    ],
  });

  const raw = extractTextContent(response.choices[0]?.message.content ?? "");
  try {
    fs.appendFileSync("server_debug.log", `[${new Date().toISOString()}] Planner Raw: ${raw}\n`);
  } catch (e) {}

  // Robust JSON Extraction
  let jsonString = raw;
  
  // If it's just the action name string, wrap it
  if (raw.trim().length > 0 && !raw.includes("{") && ACTION_NAMES.includes(raw.trim() as any)) {
    jsonString = JSON.stringify({
      action: raw.trim(),
      rationale: "Defaulted from bare action string",
      route: null, weather: null, news: null, calendar: null, music: null, browser: null, subagent: null, list: { action: "list", listName: "Grocery" }
    });
  } else {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
  }

  const fixSingleQuotes = (str: string) => {
    return str.replace(/'/g, '"');
  };

  try {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      // Try fixing single quotes if it looks like a Python-style dict
      parsed = JSON.parse(fixSingleQuotes(jsonString));
    }
    return plannerSchema.parse(parsed);
  } catch (e) {
    console.error("[Flow Guru] Planner JSON Parse Error:", e, "Raw:", raw);
    try {
      if (typeof fs !== "undefined") {
        fs.appendFileSync("server_debug.log", `[${new Date().toISOString()}] Parse Error: ${e}\n`);
      }
    } catch (err) {}
    throw new Error(`Failed to parse AI plan: ${(e as Error).message}`);
  }
}

async function freeGeocodeAddress(address: string) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=en&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const result = data.results?.[0];
  if (!result) return null;
  return {
    formatted_address: result.name + (result.admin1 ? `, ${result.admin1}` : "") + `, ${result.country}`,
    geometry: {
      location: { lat: result.latitude, lng: result.longitude }
    }
  };
}

async function geocodeAddress(address: string) {
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      address,
    });
    if (result.status === "OK" && result.results[0]) {
      return result.results[0];
    }
  } catch (err) {
    console.warn("[Weather] Google Geocoding failed, trying Open-Meteo fallback:", err);
  }

  const fallback = await freeGeocodeAddress(address);
  if (fallback) return fallback;

  throw new Error(`Could not geocode address: ${address}`);
}

async function resolveCalendarDetails(params: {
  plan: AssistantActionPlan;
  message: string;
  userName?: string | null;
  memoryContext?: string | null;
  timeZone?: string | null;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "You convert a calendar intent into concrete scheduling values.",
          "Use ISO 8601 datetimes with timezone offsets.",
          `Current time is ${new Date().toISOString()}.`,
          `Prefer timezone ${params.timeZone || "UTC"}.`,
          "For calendar.create_event, keep the provided title when possible, resolve startIso and endIso, and default the duration to 60 minutes when an end is not clearly stated.",
          "For calendar.list_events, resolve timeMinIso and timeMaxIso. If the user asked a general schedule question without a time window, default to now through the next 7 days.",
          "If the timing is too unclear to act safely, leave the unresolved fields null.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Action: ${params.plan.action}`,
          `User name: ${params.userName ?? "Unknown"}`,
          `Saved memory: ${params.memoryContext ?? "None"}`,
          `Original message: ${params.message}`,
          `Calendar title: ${params.plan.calendar?.title ?? ""}`,
          `Calendar start description: ${params.plan.calendar?.startDescription ?? ""}`,
          `Calendar end description: ${params.plan.calendar?.endDescription ?? ""}`,
        ].join("\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "calendar_resolution",
        strict: false,
        schema: {
          type: "object",
          properties: {
            title: { type: ["string", "null"] },
            startIso: { type: ["string", "null"] },
            endIso: { type: ["string", "null"] },
            timeMinIso: { type: ["string", "null"] },
            timeMaxIso: { type: ["string", "null"] },
            searchQuery: { type: ["string", "null"] },
          },
          required: ["title", "startIso", "endIso", "timeMinIso", "timeMaxIso", "searchQuery"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = extractTextContent(response.choices[0]?.message.content ?? "");
  const parsed = calendarResolutionSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    throw new Error(`Calendar resolution did not match schema: ${parsed.error.message}`);
  }

  return parsed.data;
}

async function executeRouteAction(plan: AssistantActionPlan): Promise<AssistantActionResult> {
  const origin = normalizeText(plan.route?.origin);
  const destination = normalizeText(plan.route?.destination);
  const mode = (plan.route?.mode ?? "driving") as TravelMode;

  if (!destination) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Route details needed",
      summary: "I can map this out as soon as I know where you want to go.",
    };
  }

  if (!origin) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Starting point needed",
      summary: `I can check the route to ${destination}, but I still need your starting point.`,
    };
  }

  const [originGeo, destinationGeo] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);
  const directions = await makeRequest<ExtendedDirectionsResult>("/maps/api/directions/json", {
    origin: originGeo.formatted_address,
    destination: destinationGeo.formatted_address,
    mode,
    departure_time: "now",
  });

  if (directions.status !== "OK" || !directions.routes[0]?.legs[0]) {
    throw new Error("No route result was returned by the maps provider.");
  }

  const route = directions.routes[0];
  const leg = route.legs[0];
  const steps = leg.steps.slice(0, 4).map(step => stripHtml(step.html_instructions));

  return {
    action: plan.action,
    status: "executed",
    title: `Route to ${leg.end_address}`,
    summary: leg.duration_in_traffic
      ? `${leg.distance.text}, about ${leg.duration_in_traffic.text} in current traffic.`
      : `${leg.distance.text}, about ${leg.duration.text}.`,
    provider: "google-maps",
    data: {
      origin: leg.start_address,
      destination: leg.end_address,
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      durationInTrafficText: leg.duration_in_traffic?.text ?? null,
      mode,
      routeSummary: route.summary,
      steps,
    },
  };
}

async function executeWeatherAction(plan: AssistantActionPlan): Promise<AssistantActionResult> {
  const location = normalizeText(plan.weather?.location);
  const timeframe = plan.weather?.timeframe ?? "current";

  if (!location) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Weather location needed",
      summary: "I can get the forecast as soon as I know the location you want checked.",
    };
  }

  const geocode = await geocodeAddress(location);
  const { lat, lng } = geocode.geometry.location;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", timeframe === "next_days" ? "4" : "3");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Weather request failed with ${response.status}.`);
  }

  const weather = (await response.json()) as OpenMeteoResponse;
  const current = weather.current;
  const daily = weather.daily;
  const todayIndex = timeframe === "tomorrow" ? 1 : 0;

  return {
    action: plan.action,
    status: "executed",
    title: `Weather for ${geocode.formatted_address}`,
    summary: current
      ? `${weatherCodeToLabel(current.weather_code)} and ${current.temperature_2m}°C right now, feeling like ${current.apparent_temperature}°C.`
      : "The latest conditions are available.",
    provider: "open-meteo",
    data: {
      location: geocode.formatted_address,
      timezone: weather.timezone ?? null,
      current: current
        ? {
            time: current.time ?? null,
            temperatureC: current.temperature_2m ?? null,
            apparentTemperatureC: current.apparent_temperature ?? null,
            weatherLabel: weatherCodeToLabel(current.weather_code),
            windSpeedKph: current.wind_speed_10m ?? null,
          }
        : null,
      focusForecast:
        daily && daily.time?.[todayIndex]
          ? {
              date: daily.time[todayIndex],
              weatherLabel: weatherCodeToLabel(daily.weather_code?.[todayIndex]),
              temperatureMaxC: daily.temperature_2m_max?.[todayIndex] ?? null,
              temperatureMinC: daily.temperature_2m_min?.[todayIndex] ?? null,
              precipitationProbabilityMax: daily.precipitation_probability_max?.[todayIndex] ?? null,
            }
          : null,
    },
  };
}

async function executeNewsAction(plan: AssistantActionPlan, options?: { memoryContext?: string | null }): Promise<AssistantActionResult> {
  const interestLabel = normalizeText(plan.news?.interestLabel) ?? "your interests";
  const resolvedIssueSlug =
    plan.news?.issueSlug ?? deriveNewsIssueSlug({ interestLabel, memoryContext: options?.memoryContext });
  const limit = plan.news?.limit ?? 3;
  const url = new URL("https://actually-relevant-api.onrender.com/api/stories");
  if (resolvedIssueSlug) {
    url.searchParams.set("issueSlug", resolvedIssueSlug);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`News request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as ActuallyRelevantResponse;
  const stories = (payload.data ?? []).slice(0, limit);

  if (!stories.length) {
    return {
      action: plan.action,
      status: "failed",
      title: "No news found",
      summary: "I couldn’t find a useful set of headlines just now.",
      provider: "actually-relevant",
      data: {
        issueSlug: resolvedIssueSlug,
        interestLabel,
        stories: [],
      },
    };
  }

  return {
    action: plan.action,
    status: "executed",
    title: `News brief for ${interestLabel}`,
    summary: `I found ${stories.length} relevant headline${stories.length === 1 ? "" : "s"} to brief you on.`,
    provider: "actually-relevant",
    data: {
      issueSlug: resolvedIssueSlug,
      interestLabel,
      stories: stories.map(story => ({
        id: story.id,
        slug: story.slug,
        title: story.title,
        summary: story.summary ?? story.blurb ?? "",
        sourceTitle: story.sourceTitle ?? null,
        sourceUrl: story.sourceUrl ?? null,
        datePublished: story.datePublished ?? null,
      })),
    },
  };
}

function connectionRequiredResult(action: AssistantActionPlan["action"], provider: string, summary: string) {
  return {
    action,
    status: "needs_connection" as const,
    title: `${provider} connection required`,
    summary,
    provider,
  };
}

async function executeCalendarListAction(
  plan: AssistantActionPlan,
  options: { userId: number; message: string; userName?: string | null; memoryContext?: string | null; timeZone?: string | null },
): Promise<AssistantActionResult> {
  const connection = await getProviderConnection(options.userId, "google-calendar");
  if (!connection || (connection as any).status !== "connected") {
    return connectionRequiredResult(
      plan.action,
      "google-calendar",
      "Google Calendar needs to be connected before I can check your schedule.",
    );
  }

  const resolved = await resolveCalendarDetails({
    plan,
    message: options.message,
    userName: options.userName,
    memoryContext: options.memoryContext,
    timeZone: options.timeZone,
  });

  const events = await listGoogleCalendarEvents({
    userId: options.userId,
    timeMinIso: resolved.timeMinIso ?? new Date().toISOString(),
    timeMaxIso:
      resolved.timeMaxIso ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    maxResults: 5,
    query: resolved.searchQuery ?? normalizeText(plan.calendar?.title),
  });

  const items = (events.items ?? []).map(event => ({
    id: event.id ?? null,
    title: event.summary ?? "Untitled event",
    description: event.description ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    location: event.location ?? null,
    link: event.htmlLink ?? null,
    attendees: event.attendees?.map(attendee => attendee.displayName ?? attendee.email ?? "Guest") ?? [],
    status: event.status ?? null,
  }));

  if (!items.length) {
    return {
      action: plan.action,
      status: "executed",
      title: "Schedule is clear",
      summary: "I didn’t find any matching Google Calendar events in that window.",
      provider: "google-calendar",
      data: {
        timeMinIso: resolved.timeMinIso ?? null,
        timeMaxIso: resolved.timeMaxIso ?? null,
        events: [],
      },
    };
  }

  return {
    action: plan.action,
    status: "executed",
    title: "Upcoming Google Calendar events",
    summary: `I found ${items.length} event${items.length === 1 ? "" : "s"} on your calendar.`,
    provider: "google-calendar",
    data: {
      timeMinIso: resolved.timeMinIso ?? null,
      timeMaxIso: resolved.timeMaxIso ?? null,
      events: items,
    },
  };
}

function formatCalendarEventDateTime(isoValue: string, timeZone?: string | null) {
  const date = new Date(isoValue);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timeZone || undefined,
  }).format(date);
}

async function executeCalendarCreateAction(
  plan: AssistantActionPlan,
  options: { userId: number; message: string; userName?: string | null; memoryContext?: string | null; timeZone?: string | null },
): Promise<AssistantActionResult> {
  const connection = await getProviderConnection(options.userId, "google-calendar");
  const hasGoogleCalendar = connection && (connection as any).status === "connected";

  if (!normalizeText(plan.calendar?.title) || !normalizeText(plan.calendar?.startDescription)) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Calendar details needed",
      summary: "I can book that as soon as I know the event title and when it should start.",
    };
  }

  const resolved = await resolveCalendarDetails({
    plan,
    message: options.message,
    userName: options.userName,
    memoryContext: options.memoryContext,
    timeZone: options.timeZone,
  });

  const eventTitle = normalizeText(resolved.title) ?? normalizeText(plan.calendar?.title);
  if (!eventTitle || !resolved.startIso) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Timing still needed",
      summary: "I need a clearer time for that booking before I add it to your calendar.",
    };
  }

  const endIso =
    resolved.endIso ?? new Date(new Date(resolved.startIso).getTime() + 1000 * 60 * 60).toISOString();

  // Use Google Calendar if connected, otherwise fall back to local database
  if (hasGoogleCalendar) {
    const created = await createGoogleCalendarEvent({
      userId: options.userId,
      title: eventTitle,
      startIso: resolved.startIso,
      endIso,
      timeZone: options.timeZone ?? null,
    });

    const confirmedStart = created.start?.dateTime ?? resolved.startIso;
    const confirmedEnd = created.end?.dateTime ?? endIso;
    const confirmedTimeZone = created.start?.timeZone ?? options.timeZone ?? null;

    return {
      action: plan.action,
      status: "executed",
      title: `Booked: ${created.summary ?? eventTitle}`,
      summary: `It's on your Google Calendar for ${formatCalendarEventDateTime(confirmedStart, confirmedTimeZone)}.`,
      provider: "google-calendar",
      data: {
        id: created.id ?? null,
        title: created.summary ?? eventTitle,
        start: confirmedStart,
        end: confirmedEnd,
        link: created.htmlLink ?? null,
        status: created.status ?? null,
      },
    };
  }

  // Local database fallback (no Google Calendar connected)
  const savedEvent = await createLocalEvent({
    userId: options.userId,
    title: eventTitle,
    description: plan.calendar?.title ?? null,
    startAt: new Date(resolved.startIso),
    endAt: new Date(endIso),
    allDay: 0,
    color: "blue",
    reminderMinutes: "30,15,5",
  });
  console.log("[Calendar] Local event saved:", savedEvent, eventTitle);
  const displayTime = new Date(resolved.startIso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  return {
    action: plan.action,
    status: "executed",
    title: `Booked: ${eventTitle}`,
    summary: `Added to your calendar for ${displayTime}.`,
    data: {
      id: savedEvent ?? null,
      title: eventTitle,
      start: resolved.startIso,
      end: endIso,
      link: null,
      status: "confirmed",
    },
  };
}

async function executeListAction(plan: AssistantActionPlan, options: { userId: number, timeZone?: string | null }): Promise<AssistantActionResult> {
  const { action, listName, itemContent, newName, time, location: locationTrigger } = plan.list ?? {};
  console.log(`[DEBUG] executeListAction: userId=${options.userId}, action=${action}, listName=${listName}, itemContent=${itemContent}`);

  if (!action || !listName) {
    return {
      action: "list.manage",
      status: "needs_input",
      title: "List name needed",
      summary: "Which list would you like me to manage? (e.g. Grocery, Todo)",
    };
  }

  const { 
    listUserLists, createList, addListItem, deleteListItem, 
    deleteList, getListItems, updateList, updateListItem 
  } = await import("./db");
  
  const allLists = await listUserLists(options.userId);
  
  // Smarter matching: 
  // 1. Try exact/substring match
  let targetList = allLists.find(l => l.name.toLowerCase().includes(listName.toLowerCase()));
  
  // 2. If listName is very generic (e.g. "list", "my list") and user has lists, pick the most recent one
  const genericNames = ["list", "my list", "smart list", "grocery list", "shopping list"];
  if (!targetList && genericNames.includes(listName.toLowerCase()) && allLists.length > 0) {
    // If they said "grocery list" and have a list named "Groceries", use it.
    targetList = allLists.find(l => 
      l.name.toLowerCase().includes("grocer") || 
      l.name.toLowerCase().includes("shop") || 
      l.name.toLowerCase().includes("todo")
    ) || allLists[0]; 
  }

  try {
    switch (action) {
      case "create": {
        if (targetList) {
          return {
            action: "list.manage",
            status: "executed",
            title: `List already exists`,
            summary: `The '${listName}' list is already set up and ready to use.`,
            data: { list: targetList },
          };
        }
        const id = await createList(options.userId, listName);
        return {
          action: "list.manage",
          status: "executed",
          title: `Created list: ${listName}`,
          summary: `I've created your new '${listName}' list.`,
          data: { id, name: listName },
        };
      }
      case "add": {
        if (!itemContent) {
          return { action: "list.manage", status: "needs_input", title: "Item needed", summary: `What should I add to your ${listName} list?` };
        }
        let listId = targetList?.id;
        if (!listId) {
          listId = (await createList(options.userId, listName))!;
        }
        const id = await addListItem(options.userId, listId, itemContent);
        const items = await getListItems(options.userId, listId);
        return {
          action: "list.manage",
          status: "executed",
          title: `Added to ${listName}`,
          summary: `Done — I added '${itemContent}' to your ${listName} list.`,
          data: { id, content: itemContent, listName, items },
        };
      }
      case "remove": {
        if (!targetList || !itemContent) {
          return { action: "list.manage", status: "failed", title: "Cannot remove", summary: `I couldn't find '${itemContent}' on your ${listName} list.` };
        }
        const items = await getListItems(options.userId, targetList.id);
        const item = items.find(i => i.content.toLowerCase().includes(itemContent.toLowerCase()));
        if (!item) {
          return { action: "list.manage", status: "failed", title: "Item not found", summary: `I couldn't find '${itemContent}' in the ${listName} list.` };
        }
        await deleteListItem(options.userId, item.id);
        const remainingItems = await getListItems(options.userId, targetList.id);
        return {
          action: "list.manage",
          status: "executed",
          title: `Removed from ${listName}`,
          summary: `Okay, I've removed '${item.content}' from your ${listName} list.`,
          data: { itemId: item.id, content: item.content, listName, items: remainingItems },
        };
      }
      case "clear": {
        if (!targetList) {
          return { action: "list.manage", status: "failed", title: "List not found", summary: `I couldn't find a list named '${listName}'.` };
        }
        await deleteList(options.userId, targetList.id);
        return {
          action: "list.manage",
          status: "executed",
          title: `Cleared ${listName}`,
          summary: `I've cleared out the entire '${listName}' list for you.`,
          data: { listId: targetList.id, listName },
        };
      }
      case "rename": {
        if (!targetList || !newName) {
          return { action: "list.manage", status: "failed", title: "Cannot rename", summary: `I couldn't find '${listName}' to rename it.` };
        }
        await updateList(options.userId, targetList.id, newName);
        return {
          action: "list.manage",
          status: "executed",
          title: "List Renamed",
          summary: `Done! I've renamed '${listName}' to '${newName}'.`,
          data: { listId: targetList.id, oldName: listName, newName },
        };
      }
      case "update": {
        if (!targetList || !itemContent || !newName) {
          return { action: "list.manage", status: "failed", title: "Cannot update", summary: `I need to know which item to change and what to change it to.` };
        }
        const items = await getListItems(options.userId, targetList.id);
        const item = items.find(i => i.content.toLowerCase().includes(itemContent.toLowerCase()));
        if (!item) {
          return { action: "list.manage", status: "failed", title: "Item not found", summary: `I couldn't find '${itemContent}' in your ${listName} list.` };
        }
        await updateListItem(options.userId, item.id, newName);
        const updatedItems = await getListItems(options.userId, targetList.id);
        return {
          action: "list.manage",
          status: "executed",
          title: "Item Updated",
          summary: `Updated! I've changed '${item.content}' to '${newName}' on your ${listName} list.`,
          data: { itemId: item.id, oldContent: item.content, newContent: newName, listName, items: updatedItems },
        };
      }
      case "list": {
        if (!targetList) {
          return { action: "list.manage", status: "executed", title: "List not found", summary: `You don't have a list named '${listName}' yet.`, data: { items: [] } };
        }
        const items = await getListItems(options.userId, targetList.id);
        const activeItems = items.filter(i => !i.completed);
        const summary = activeItems.length 
          ? `You have ${activeItems.length} items on your ${listName} list: ${activeItems.map(i => i.content).join(", ")}.`
          : `Your ${listName} list is currently empty.`;
        return {
          action: "list.manage",
          status: "executed",
          title: `${listName} List`,
          summary,
          data: { listId: targetList.id, listName, items },
        };
      }
      case "remind": {
        if (!targetList || !itemContent) {
          return { action: "list.manage", status: "needs_input", title: "Item needed", summary: `Which item on your ${listName} list should I set a reminder for?` };
        }
        
        const items = await getListItems(options.userId, targetList.id);
        const item = items.find(i => i.content.toLowerCase().includes(itemContent.toLowerCase()));
        if (!item) {
          return { action: "list.manage", status: "failed", title: "Item not found", summary: `I couldn't find '${itemContent}' on your ${listName} list.` };
        }

        const { setListItemReminder, setListItemLocationTrigger } = await import("./db");

        if (locationTrigger) {
          await setListItemLocationTrigger(options.userId, item.id, locationTrigger);
          return {
            action: "list.manage",
            status: "executed",
            title: "Location Reminder Set",
            summary: `Got it. I'll remind you to '${item.content}' when you're at the ${locationTrigger}.`,
            data: { itemId: item.id, content: item.content, listName, locationTrigger },
          };
        }

        if (time) {
          const { resolveNaturalLanguageTime } = await import("./_core/googleCalendar");
          const resolvedTime = await resolveNaturalLanguageTime(time, options.timeZone || "UTC");
          
          if (!resolvedTime) {
            return { action: "list.manage", status: "failed", title: "Time resolution failed", summary: `I couldn't understand the time '${time}'. Could you be more specific?` };
          }

          await setListItemReminder(options.userId, item.id, new Date(resolvedTime));
          const timeStr = new Date(resolvedTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

          return {
            action: "list.manage",
            status: "executed",
            title: "Reminder Set",
            summary: `Done! I'll remind you to '${item.content}' on ${timeStr}.`,
            data: { itemId: item.id, content: item.content, listName, reminderAt: resolvedTime },
          };
        }

        return { action: "list.manage", status: "needs_input", title: "Trigger needed", summary: `When or where should I remind you about '${itemContent}'?` };
      }
      default:
        throw new Error("Invalid list action");
    }
  } catch (e) {
    throw e;
  }
}

async function executeMusicAction(
  plan: AssistantActionPlan,
  options: { userId: number }
): Promise<AssistantActionResult> {
  const query = plan.music?.query || "some good music";
  const targetType = plan.music?.targetType || "track";

  try {
    const result = await searchAndPlaySpotify({
      userId: options.userId,
      query,
      type: (targetType as string) || "track",
    });

    if (result.status === "no_device") {
      return {
        action: "music.play",
        status: "needs_input",
        title: "Spotify Device Needed",
        summary: result.message || "I found the music, but I couldn't find an active Spotify device to play it on.",
        provider: "spotify",
      };
    }

    const item = result.item;
    return {
      action: "music.play",
      status: "executed",
      title: `Playing: ${item.name}`,
      summary: `I've started ${item.name} by ${item.artists?.[0]?.name || "the artist"} on Spotify for you.`,
      provider: "spotify",
      data: {
        item,
        externalUrl: item.external_urls?.spotify,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Spotify failed.";
    return {
      action: "music.play",
      status: "failed",
      title: "Spotify snag",
      summary: msg,
      provider: "spotify",
    };
  }
}

export async function executeAssistantAction(
  plan: AssistantActionPlan,
  options: { userId: number; userName?: string | null; message: string; memoryContext: string; timeZone?: string | null; }
): Promise<AssistantActionResult> {
  console.log(`[Assistant Action] Executing: ${plan.action}`, plan);

  try {
    switch (plan.action) {
      case "list.manage":
        return await executeListAction(plan, options);
      case "calendar.create_event":
        return await executeCalendarCreateAction(plan, options as any);
      case "calendar.list_events":
        return await executeCalendarListAction(plan, options as any);
      case "route.get":
        return await executeRouteAction(plan);
      case "weather.get":
        return await executeWeatherAction(plan);
      case "news.get":
        return await executeNewsAction(plan, options as any);
      case "music.play":
        return await executeMusicAction(plan, options as any);
      case "browser.use":
        return {
          action: "browser.use",
          status: "executed",
          title: "Opening Browser",
          summary: `I'm looking that up for you now.`,
          data: { task: plan.browser?.task },
        };
      case "system.subagent":
        return {
          action: "system.subagent",
          status: "executed",
          title: "Working on it",
          summary: `I'm handling that task in the background.`,
          data: { task: plan.subagent?.task },
        };
      case "none":
      default:
        return {
          action: "none",
          status: "executed",
          title: "Chatting",
          summary: "I'm just chatting with you.",
        };
    }
  } catch (error) {
    console.warn("[Flow Guru] External action execution failed.", error);
    return {
      action: plan.action,
      status: "failed",
      title: "Action unavailable",
      summary: "I understood the live request, but that data source did not return a usable result just now.",
      provider: plan.action.startsWith("route")
        ? "google-maps"
        : plan.action.startsWith("weather")
          ? "open-meteo"
          : plan.action.startsWith("news")
            ? "actually-relevant"
            : plan.action.startsWith("calendar")
              ? "google-calendar"
              : plan.action.startsWith("music")
                ? "spotify"
                : undefined,
    };
  }
}

export function formatActionResultContext(result: AssistantActionResult | null) {
  if (!result) {
    return "No external action was executed for this turn.";
  }

  return JSON.stringify(result, null, 2);
}

export function buildActionFallbackReply(result: AssistantActionResult | null) {
  if (!result) {
    return "I’m here with you. Tell me a little more, and I’ll help from there.";
  }

  if (result.status === "executed") {
    return `${result.title}\n\n${result.summary}`;
  }

  if (result.status === "needs_connection") {
    return result.summary;
  }

  if (result.status === "needs_input") {
    return result.summary;
  }

  return "I hit a snag while checking that, but I can try again or help another way.";
}
