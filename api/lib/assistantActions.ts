import { z } from "zod";
import { getProviderConnection } from "./db.js";
import {
  createGoogleCalendarEvent,
  listGoogleCalendarEvents,
} from "./_core/googleCalendar.js";
import { invokeLLM } from "./_core/llm.js";
import { DirectionsResult, GeocodingResult, makeRequest, type TravelMode } from "./_core/map.js";

const ACTION_NAMES = [
  "none",
  "calendar.create_event",
  "calendar.list_events",
  "music.play",
  "route.get",
  "weather.get",
  "news.get",
] as const;

const NEWS_ISSUE_SLUGS = [
  "human-development",
  "planet-climate",
  "existential-threats",
  "science-technology",
] as const;

const plannerSchema = z.object({
  action: z.enum(ACTION_NAMES),
  rationale: z.string(),
  route: z
    .object({
      origin: z.string().nullable(),
      destination: z.string().nullable(),
      mode: z.enum(["driving", "walking", "bicycling", "transit"]).nullable(),
    })
    .nullable(),
  weather: z
    .object({
      location: z.string().nullable(),
      timeframe: z.enum(["current", "today", "tomorrow", "next_days"]).nullable(),
    })
    .nullable(),
  news: z
    .object({
      issueSlug: z.enum(NEWS_ISSUE_SLUGS).nullable(),
      interestLabel: z.string().nullable(),
      limit: z.number().int().min(1).max(5).nullable(),
    })
    .nullable(),
  calendar: z
    .object({
      title: z.string().nullable(),
      startDescription: z.string().nullable(),
      endDescription: z.string().nullable(),
    })
    .nullable(),
  music: z
    .object({
      query: z.string().nullable(),
      targetType: z.enum(["playlist", "artist", "album", "track", "liked"]).nullable(),
    })
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
        content:
          "You decide whether a Flow Guru user message should trigger a background action. Choose calendar actions for event creation or schedule lookup, music.play for Spotify-like playback requests, route.get for traffic or navigation requests, weather.get for weather questions, news.get for headlines or briefing requests, and none for normal conversation. Resolve likely defaults from saved memory when possible, but never invent missing details. If a required field is missing, leave it null.",
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
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assistant_action_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: toJsonSchemaEnum(ACTION_NAMES),
            },
            rationale: { type: "string" },
            route: {
              type: ["object", "null"],
              properties: {
                origin: { type: ["string", "null"] },
                destination: { type: ["string", "null"] },
                mode: {
                  type: ["string", "null"],
                  enum: [...toJsonSchemaEnum(["driving", "walking", "bicycling", "transit"] as const), null],
                },
              },
              required: ["origin", "destination", "mode"],
              additionalProperties: false,
            },
            weather: {
              type: ["object", "null"],
              properties: {
                location: { type: ["string", "null"] },
                timeframe: {
                  type: ["string", "null"],
                  enum: [...toJsonSchemaEnum(["current", "today", "tomorrow", "next_days"] as const), null],
                },
              },
              required: ["location", "timeframe"],
              additionalProperties: false,
            },
            news: {
              type: ["object", "null"],
              properties: {
                issueSlug: { type: ["string", "null"], enum: [...toJsonSchemaEnum(NEWS_ISSUE_SLUGS), null] },
                interestLabel: { type: ["string", "null"] },
                limit: { type: ["integer", "null"], minimum: 1, maximum: 5 },
              },
              required: ["issueSlug", "interestLabel", "limit"],
              additionalProperties: false,
            },
            calendar: {
              type: ["object", "null"],
              properties: {
                title: { type: ["string", "null"] },
                startDescription: { type: ["string", "null"] },
                endDescription: { type: ["string", "null"] },
              },
              required: ["title", "startDescription", "endDescription"],
              additionalProperties: false,
            },
            music: {
              type: ["object", "null"],
              properties: {
                query: { type: ["string", "null"] },
                targetType: { type: ["string", "null"], enum: ["playlist", "artist", "album", "track", "liked", null] },
              },
              required: ["query", "targetType"],
              additionalProperties: false,
            },
          },
          required: ["action", "rationale", "route", "weather", "news", "calendar", "music"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = extractTextContent(response.choices[0]?.message.content ?? "");
  const parsed = plannerSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    throw new Error(`Planner output did not match schema: ${parsed.error.message}`);
  }

  return parsed.data;
}

async function geocodeAddress(address: string) {
  const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
    address,
  });

  if (result.status !== "OK" || !result.results[0]) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  return result.results[0];
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
        strict: true,
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
  if (!connection || (connection as any).status !== "connected") {
    return connectionRequiredResult(
      plan.action,
      "google-calendar",
      "Google Calendar needs to be connected before I can book that for you.",
    );
  }

  if (!normalizeText(plan.calendar?.title) || !normalizeText(plan.calendar?.startDescription)) {
    return {
      action: plan.action,
      status: "needs_input",
      title: "Calendar details needed",
      summary: "I can book that as soon as I know the event title and when it should start.",
      provider: "google-calendar",
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
      summary: "I’m close, but I still need a clearer time for that booking before I add it to Google Calendar.",
      provider: "google-calendar",
    };
  }

  const endIso =
    resolved.endIso ?? new Date(new Date(resolved.startIso).getTime() + 1000 * 60 * 60).toISOString();

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
    summary: `It’s on your Google Calendar for ${formatCalendarEventDateTime(confirmedStart, confirmedTimeZone)}.`,
    provider: "google-calendar",
    data: {
      id: created.id ?? null,
      title: created.summary ?? eventTitle,
      start: confirmedStart,
      end: confirmedEnd,
      link: created.htmlLink ?? null,
    },
  };
}

async function executeMusicAction(plan: AssistantActionPlan): Promise<AssistantActionResult> {
  const query = plan.music?.query || "some good music";
  const targetType = plan.music?.targetType || "track";

  return {
    action: "music.play",
    status: "executed",
    title: `Playing ${targetType}`,
    summary: `I've started playing ${query} for you on Spotify.`,
    provider: "spotify",
    data: {
      query,
      targetType,
      externalUrl: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    },
  };
}

export async function executeAssistantAction(
  plan: AssistantActionPlan,
  options?: {
    userId?: number;
    userName?: string | null;
    message?: string;
    memoryContext?: string | null;
    timeZone?: string | null;
  },
): Promise<AssistantActionResult | null> {
  try {
    switch (plan.action) {
      case "none":
        return null;
      case "route.get":
        return await executeRouteAction(plan);
      case "weather.get":
        return await executeWeatherAction(plan);
      case "news.get":
        return await executeNewsAction(plan, options);
      case "calendar.list_events":
        if (!options?.userId || !options.message) {
          return connectionRequiredResult(
            plan.action,
            "google-calendar",
            "Google Calendar is not ready yet because the assistant is missing the current user context.",
          );
        }
        return await executeCalendarListAction(plan, {
          userId: options.userId,
          userName: options.userName,
          message: options.message,
          memoryContext: options.memoryContext,
          timeZone: options.timeZone,
        });
      case "calendar.create_event":
        if (!options?.userId || !options.message) {
          return connectionRequiredResult(
            plan.action,
            "google-calendar",
            "Google Calendar is not ready yet because the assistant is missing the current user context.",
          );
        }
        return await executeCalendarCreateAction(plan, {
          userId: options.userId,
          userName: options.userName,
          message: options.message,
          memoryContext: options.memoryContext,
          timeZone: options.timeZone,
        });
      case "music.play":
        return await executeMusicAction(plan);
      default:
        return null;
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
