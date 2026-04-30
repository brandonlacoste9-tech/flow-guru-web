import fs from "fs";
import * as chrono from "chrono-node";
import { z } from "zod";
import { getProviderConnection, createLocalEvent, listUserMemoryFacts } from "./db";
import {
  createGoogleCalendarEvent,
  listGoogleCalendarEvents,
} from "./_core/googleCalendar";
import { invokeLLM } from "./_core/llm";
import { isVertexSearchConfigured, searchKnowledgeBase } from "../api/lib/_core/vertexSearch.js";
import { DirectionsResult, GeocodingResult, makeRequest, type TravelMode } from "./_core/map";

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
  "knowledge.search",
  "contact.open",
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
  knowledge: z
    .object({
      query: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  contact: z
    .object({
      channel: z.enum(["call", "sms", "email"]).optional().nullable(),
      targetName: z.string().optional().nullable(),
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
type CalendarResolution = z.infer<typeof calendarResolutionSchema>;

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

function canonicalListName(rawListName: string) {
  const normalized = rawListName.toLowerCase().replace(/[-_]/g, " ");
  if (/\b(grocery|groceries|shopping)\b/.test(normalized)) return "Grocery";
  if (/\b(todo|to do|task|tasks|chore|chores)\b/.test(normalized)) return "Todo";
  return rawListName.trim();
}

function cleanListItemContent(value: string | null | undefined) {
  return normalizeText(
    value
      ?.replace(/^(please\s+)?(add|put|write(?:\s+down)?|jot(?:\s+down)?|note|save|remember)\s+/i, "")
      .replace(/^(an?|the)\s+/i, "")
      .replace(/[.!?]+$/g, ""),
  );
}

function buildListPlan(params: {
  action: "add" | "remove" | "list";
  listName: string;
  itemContent?: string | null;
  rationale: string;
}): AssistantActionPlan {
  return {
    action: "list.manage",
    rationale: params.rationale,
    route: null,
    weather: null,
    news: null,
    calendar: null,
    music: null,
    browser: null,
    subagent: null,
    list: {
      action: params.action,
      listName: canonicalListName(params.listName),
      itemContent: params.itemContent ?? null,
      newName: null,
      time: null,
      location: null,
    },
    knowledge: null,
    contact: null,
  };
}

function buildCalendarCreatePlan(params: {
  title: string;
  startDescription: string;
  endDescription?: string | null;
  rationale: string;
}): AssistantActionPlan {
  return {
    action: "calendar.create_event",
    rationale: params.rationale,
    route: null,
    weather: null,
    news: null,
    calendar: {
      title: params.title,
      startDescription: params.startDescription,
      endDescription: params.endDescription ?? null,
    },
    music: null,
    browser: null,
    subagent: null,
    list: null,
    knowledge: null,
    contact: null,
  };
}

export function parseSimpleListIntent(message: string): AssistantActionPlan | null {
  const text = message.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const listNamePattern = "(grocery|groceries|shopping|todo|to-do|to do|task|tasks|chore|chores)(?:\\s+list)?";
  const listOnly = text.match(new RegExp(`^(?:what'?s|what is|show|list|read|check)\\s+(?:on|in)?\\s*(?:my|the)?\\s*${listNamePattern}\\??$`, "i"));
  if (listOnly) {
    return buildListPlan({
      action: "list",
      listName: listOnly[1],
      rationale: "The user wants to read a list.",
    });
  }

  const remove = text.match(new RegExp(`^(?:please\\s+)?(?:remove|delete|cross\\s+off|take\\s+off)\\s+(.+?)\\s+(?:from|off)\\s+(?:my|the)?\\s*${listNamePattern}$`, "i"));
  if (remove) {
    const itemContent = cleanListItemContent(remove[1]);
    if (itemContent) {
      return buildListPlan({
        action: "remove",
        listName: remove[2],
        itemContent,
        rationale: "The user wants to remove an item from a list.",
      });
    }
  }

  const addToList = text.match(new RegExp(`^(?:please\\s+)?(?:add|put|write(?:\\s+down)?|jot(?:\\s+down)?|note|save|remember)?\\s*(.+?)\\s+(?:to|in|on|into)\\s+(?:my|the)?\\s*${listNamePattern}$`, "i"));
  if (addToList) {
    const itemContent = cleanListItemContent(addToList[1]);
    if (itemContent) {
      return buildListPlan({
        action: "add",
        listName: addToList[2],
        itemContent,
        rationale: "The user wants to add an item to a list.",
      });
    }
  }

  const listThenItem = text.match(new RegExp(`^(?:please\\s+)?(?:add|put|write(?:\\s+down)?|jot(?:\\s+down)?|note|save|remember)?\\s*(?:to|in|on)?\\s*(?:my|the)?\\s*${listNamePattern}[:,]?\\s+(.+)$`, "i"));
  if (listThenItem) {
    const itemContent = cleanListItemContent(listThenItem[2]);
    if (itemContent) {
      return buildListPlan({
        action: "add",
        listName: listThenItem[1],
        itemContent,
        rationale: "The user wants to add an item to a list.",
      });
    }
  }

  return null;
}

function cleanCalendarTitle(value: string) {
  return normalizeText(
    value
      .replace(/^(please\s+)?(?:add|put|create|schedule|book|set\s+up|make)\s+/i, "")
      .replace(/\b(?:to|on|in|onto)\s+(?:my\s+|the\s+)?calendar\b/i, "")
      .replace(/\b(?:on|for|at)\s*$/i, "")
      .replace(/^(an?|the)\s+/i, "")
      .replace(/[.!?]+$/g, ""),
  );
}

function parseSimpleCalendarCreateIntent(message: string): AssistantActionPlan | null {
  const text = message.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const lower = text.toLowerCase();
  if (/\b(grocery|groceries|shopping|todo|to-do|to do|task|tasks|chore|chores)\b/.test(lower)) {
    return null;
  }

  const calendarLike = /\b(calendar|schedule|scheduled|appointment|meeting|event)\b/.test(lower);
  const createVerb = /^(?:please\s+)?(?:add|put|create|schedule|book|set\s+up|make)\b/i.test(text);
  if (!calendarLike || !createVerb) return null;

  const parsed = chrono.parse(text, new Date(), { forwardDate: true })[0];
  if (!parsed?.start) return null;

  const title = cleanCalendarTitle(text.replace(parsed.text, " ")) ?? "Calendar event";
  return buildCalendarCreatePlan({
    title,
    startDescription: parsed.text,
    endDescription: null,
    rationale: "The user wants to create a calendar event.",
  });
}

function parseSimpleContactIntent(message: string): AssistantActionPlan | null {
  const text = message.trim().replace(/\s+/g, " ");
  if (!text) return null;

  let channel: "call" | "sms" | "email" = "call";
  let rawTarget: string | undefined;

  const callMatch = text.match(/^(?:please\s+)?(?:call|phone|ring|dial)\s+(?:my\s+)?(.+)$/i);
  const smsMatch = text.match(/^(?:please\s+)?(?:text|sms)\s+(?:my\s+)?(.+)$/i);
  const mailMatch = text.match(/^(?:please\s+)?(?:email|e-mail|mail)\s+(?:my\s+)?(.+)$/i);

  if (smsMatch) {
    channel = "sms";
    rawTarget = smsMatch[1];
  } else if (mailMatch) {
    channel = "email";
    rawTarget = mailMatch[1];
  } else if (callMatch) {
    rawTarget = callMatch[1];
  }

  if (!rawTarget) return null;

  const targetName = normalizeText(rawTarget.replace(/[.!?]+$/g, ""));
  if (!targetName || targetName.length < 2) return null;

  return {
    action: "contact.open",
    rationale: "The user wants to reach someone via phone, SMS, or email.",
    route: null,
    weather: null,
    news: null,
    calendar: null,
    music: null,
    browser: null,
    subagent: null,
    list: null,
    knowledge: null,
    contact: { channel, targetName },
  };
}

function resolveCalendarDetailsFallback(params: {
  plan: AssistantActionPlan;
  message: string;
}): CalendarResolution {
  const source = [params.plan.calendar?.startDescription, params.message].filter(Boolean).join(" ");
  const parsed = chrono.parse(source, new Date(), { forwardDate: true })[0];
  const startIso = parsed?.start?.date().toISOString() ?? null;
  const endIso = parsed?.end?.date().toISOString()
    ?? (startIso ? new Date(new Date(startIso).getTime() + 1000 * 60 * 60).toISOString() : null);

  return {
    title: normalizeText(params.plan.calendar?.title),
    startIso,
    endIso,
    timeMinIso: null,
    timeMaxIso: null,
    searchQuery: null,
  };
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

function weatherCodeToLabel(code: number | null | undefined, language: 'en' | 'fr' = 'en') {
  const enLabels: Record<number, string> = {
    0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers",
    81: "Moderate rain showers", 82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
  };
  const frLabels: Record<number, string> = {
    0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant",
    51: "Bruine légère", 53: "Bruine modérée", 55: "Bruine dense", 56: "Bruine verglaçante", 57: "Bruine verglaçante dense",
    61: "Pluie légère", 63: "Pluie modérée", 65: "Forte pluie", 66: "Pluie verglaçante légère", 67: "Forte pluie verglaçante",
    71: "Neige légère", 73: "Neige modérée", 75: "Forte neige", 77: "Grains de neige", 80: "Averses de pluie",
    81: "Averses de pluie modérées", 82: "Violentes averses de pluie", 85: "Averses de neige", 86: "Fortes averses de neige",
    95: "Orage", 96: "Orage avec grêle", 99: "Fort orage avec grêle",
  };
  const labels = language === 'fr' ? frLabels : enLabels;
  return labels[code ?? -1] ?? (language === 'fr' ? "Conditions non spécifiées" : "Unspecified conditions");
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
  language: 'en' | 'fr';
}) {
  const deterministicListPlan = parseSimpleListIntent(params.message);
  if (deterministicListPlan) return deterministicListPlan;

  const deterministicCalendarPlan = parseSimpleCalendarCreateIntent(params.message);
  if (deterministicCalendarPlan) return deterministicCalendarPlan;

  const deterministicContactPlan = parseSimpleContactIntent(params.message);
  if (deterministicContactPlan) return deterministicContactPlan;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "You are Flow Guru's intent classifier. Your ONLY job is to decide which tool to call.",
          `CRITICAL: The user's preferred language is ${params.language === 'fr' ? 'FRENCH' : 'ENGLISH'}. However, you MUST return JSON as specified below regardless of input language.`,
          "ALWAYS choose an action when possible — err on the side of calling a tool rather than returning 'none'.",
          "",
          "AVAILABLE TOOLS:",
          "- calendar.create_event: For scheduling appointments, meetings, or time-based events. NEVER use this for grocery lists, shopping items, chores, tasks, or todos. If it's a chore or a list item, use list.manage instead.",
          "- calendar.list_events: For checking a schedule or listing upcoming items.",
          "- weather.get: For checking current or future weather conditions.",
          "- route.get: For travel times, directions, or distances between points.",
          "- If saved memory includes 'Approximate current device location (latitude, longitude):' and the user only names a destination (no clear starting place), choose route.get with route.destination set and route.origin null — the server will start from their device GPS.",
          "- music.play: For playing music on our internal radio (Focus, Chill, Energy, Sleep, Space).",
          "- news.get: For latest headlines or specific news issues.",
          "- browser.use: For browsing the web to find answers, research topics, or perform web-based tasks.",
          "- system.subagent: For ANY complex system tasks: file operations, terminal commands, writing scripts, running Python, or performing multi-step autonomous actions on the user's machine.",
          "- list.manage: For creating, adding items, removing items, clearing, or listing smart collections (like grocery lists, todos, or ideas).",
          "- knowledge.search: For questions answered from YOUR indexed knowledge base / uploaded docs / internal corpus in Vertex AI Search — NOT for random internet trivia (use browser.use for that).",
          "- contact.open: For placing a phone call, SMS/text, or email to a PERSON by relationship or name using saved contact facts (e.g. 'call my wife', 'text Jenny', 'email mom'). User must have saved contact_phone_<name> or contact_email_<name> in memory.",
          "- none: Use this for general conversation or if no tool fits.",
          "",
          "AGENT DELEGATION RULES:",
          "- If the user asks to 'Add [item] to my [list]', 'Create a [list] list', or 'What's on my [list]?', use 'list.manage'.",
          "- If the user mentions single items, groceries, chores, or shopping items, use 'list.manage'.",
          "- NEVER use 'calendar.create_event' for groceries, bread, milk, eggs, or simple shopping items.",
          "- Only use 'calendar.create_event' for meetings, appointments, or scheduled blocks of time with a specific duration.",
          "- If the user says 'Remind me to [item]' and the item is a grocery or small task, use 'list.manage' with action 'remind'.",
          "- If the user asks something that depends on YOUR uploaded documents, internal wiki, or indexed library phrased like 'what does my docs say', 'in my knowledge base', 'from our handbook', use 'knowledge.search'.",
          "- If the user asks to 'Check XYZ website', 'Search for...', or 'Find out who won...', use 'browser.use'.",
          "- If the user asks to 'Add a file', 'Create a folder', 'Python script', 'Run a command', or 'Do a system audit', use 'system.subagent'.",
          "",
          "CRITICAL: Any mention of 'list', 'shopping', 'grocery', 'bread', 'milk', 'eggs', 'todo', 'pack' MUST go to 'list.manage'.",
          "",
          "Resolve defaults from saved memory when possible. If a field is unclear, leave it null — do NOT return 'none' just because a detail is missing.",
          "",
          "RESPONSE FORMAT: You MUST respond with a single JSON object (no markdown, no code blocks, no explanation). The JSON must have these keys:",
          '{ "action": "<tool_name>", "rationale": "<why>", "route": null, "weather": null, "news": null, "calendar": null, "music": null, "browser": null, "subagent": null, "list": null, "knowledge": null, "contact": null }',
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
          "For knowledge.search, populate the knowledge field with the user's question:",
          '{ "action": "knowledge.search", "rationale": "...", "knowledge": { "query": "plain-language question to run against the corpus" }, ... }',
          "",
          "For contact.open, populate the contact field:",
          '{ "action": "contact.open", "rationale": "...", "contact": { "channel": "call", "targetName": "wife" }, ... }',
          "contact.channel is one of: call, sms, email",
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
      route: null, weather: null, news: null, calendar: null, music: null, browser: null, subagent: null, list: { action: "list", listName: "Grocery" }, knowledge: null, contact: null
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
      location: { lat: result.latitude, lng: result.longitude },
    },
  };
}

/** Parse "lat,lng" or "lat, lng" from planner / device GPS. */
function parseLatLngPair(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function freeReverseGeocode(lat: number, lng: number) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lng))}&language=en`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.results?.[0]) return null;
  const r = data.results[0];
  const line =
    [r.name, r.admin2, r.admin1, r.country].filter(Boolean).join(", ") || `${lat}, ${lng}`;
  return {
    formatted_address: line,
    geometry: { location: { lat, lng } },
  };
}

async function geocodeLatLng(lat: number, lng: number) {
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      latlng: `${lat},${lng}`,
    });
    if (result.status === "OK" && result.results[0]) {
      return result.results[0];
    }
  } catch (err) {
    console.warn("[Maps] Google reverse geocode failed, trying Open-Meteo:", err);
  }
  const fallback = await freeReverseGeocode(lat, lng);
  if (fallback) return fallback;
  throw new Error(`Could not reverse geocode: ${lat},${lng}`);
}

async function geocodeAddress(address: string) {
  const coords = parseLatLngPair(address);
  if (coords) {
    return geocodeLatLng(coords.lat, coords.lng);
  }
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
}): Promise<CalendarResolution> {
  try {
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
    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    console.warn("[Flow Guru] Calendar resolution LLM failed; using deterministic fallback.", error);
  }

  return resolveCalendarDetailsFallback(params);
}

function extractHomeOriginFromMemory(memoryContext: string | null | undefined): string | null {
  if (!memoryContext) return null;
  for (const line of memoryContext.split("\n")) {
    const trimmed = line.trim();
    const homeAddr = trimmed.match(/^-\s*\[[^\]]+\]\s*home_address:\s*(.+)$/i);
    if (homeAddr?.[1]) return homeAddr[1].trim();
    const home = trimmed.match(/^-\s*\[[^\]]+\]\s*home:\s*(.+)$/i);
    if (home?.[1]) return home[1].trim();
    const homeLoc = trimmed.match(/^-\s*\[[^\]]+\]\s*home_location:\s*(.+)$/i);
    if (homeLoc?.[1]) return homeLoc[1].trim();
  }
  return null;
}

/** Same coordinates the router injects into memory when the client sends deviceLatitude/deviceLongitude. */
function extractApproximateDeviceLocationFromMemory(
  memoryContext: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!memoryContext) return null;
  const m = memoryContext.match(
    /Approximate current device location \(latitude, longitude\):\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function googleTravelMode(mode: TravelMode): string {
  if (mode === "walking") return "walking";
  if (mode === "bicycling") return "bicycling";
  if (mode === "transit") return "transit";
  return "driving";
}

function buildDirectionsMapsUrls(originLabel: string, destinationLabel: string, mode: TravelMode): {
  mapsUrlGoogle: string;
  mapsUrlApple: string;
} {
  const travelmode = googleTravelMode(mode);
  const o = encodeURIComponent(originLabel);
  const d = encodeURIComponent(destinationLabel);
  const mapsUrlGoogle = `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${travelmode}`;
  const dirflg = mode === "walking" ? "w" : "d";
  const mapsUrlApple = `https://maps.apple.com/?dirflg=${dirflg}&saddr=${o}&daddr=${d}`;
  return { mapsUrlGoogle, mapsUrlApple };
}

function slugifyContactTarget(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/^my\s+/, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || raw.toLowerCase().trim()
  );
}

function expandContactSlugCandidates(raw: string): string[] {
  const base = slugifyContactTarget(raw);
  const aliasMap: Record<string, string[]> = {
    wife: ["wife", "spouse"],
    husband: ["husband", "spouse"],
    spouse: ["spouse", "wife", "husband"],
    mom: ["mom", "mother"],
    mother: ["mother", "mom"],
    dad: ["dad", "father"],
    father: ["father", "dad"],
  };
  const extras = aliasMap[base] ?? [];
  return [...new Set([base, ...extras])];
}

function findContactPhone(
  facts: Array<{ factKey: string | null; factValue: string }>,
  slugs: string[],
): string | null {
  for (const slug of slugs) {
    const want = `contact_phone_${slug}`.toLowerCase();
    const hit = facts.find(f => f.factKey?.toLowerCase() === want);
    if (hit?.factValue?.trim()) return hit.factValue.trim();
  }
  return null;
}

function findContactEmail(
  facts: Array<{ factKey: string | null; factValue: string }>,
  slugs: string[],
): string | null {
  for (const slug of slugs) {
    const want = `contact_email_${slug}`.toLowerCase();
    const hit = facts.find(f => f.factKey?.toLowerCase() === want);
    if (hit?.factValue?.trim()) return hit.factValue.trim();
  }
  return null;
}

/** Exposed for tests — normalize stored phone for tel:/sms: hrefs. */
export function sanitizePhoneForHref(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!/\d/.test(digits)) return null;
  return digits.startsWith("+") ? digits : digits;
}

async function executeContactOpenAction(
  plan: AssistantActionPlan,
  options: { userId: number; language?: "en" | "fr" },
): Promise<AssistantActionResult> {
  const targetRaw = normalizeText(plan.contact?.targetName);
  const lang = options.language ?? "en";

  if (!Number.isFinite(options.userId) || options.userId <= 0) {
    return {
      action: "contact.open",
      status: "failed",
      title: "Session needed",
      summary:
        lang === "fr"
          ? "Connecte-toi pour que je puisse charger tes contacts enregistrés."
          : "Sign in so I can look up your saved contacts.",
    };
  }

  if (!targetRaw) {
    return {
      action: "contact.open",
      status: "needs_input",
      title: "Who should I reach?",
      summary:
        lang === "fr"
          ? "Dis-moi qui appeler ou texter — par exemple « appelle ma femme »."
          : "Say who to call or text — for example “call my wife.”",
    };
  }

  let facts: Array<{ factKey: string | null; factValue: string }>;
  try {
    facts = await listUserMemoryFacts(options.userId);
  } catch {
    return {
      action: "contact.open",
      status: "failed",
      title: "Contacts unavailable",
      summary:
        lang === "fr"
          ? "Je n’ai pas pu charger tes contacts enregistrés pour le moment."
          : "I couldn’t load your saved contacts right now.",
    };
  }

  const slugCandidates = expandContactSlugCandidates(targetRaw);
  const phone = findContactPhone(facts, slugCandidates);
  const email = findContactEmail(facts, slugCandidates);
  const channel = plan.contact?.channel ?? "call";

  if (channel === "email") {
    if (!email) {
      return {
        action: "contact.open",
        status: "needs_input",
        title: "No email saved",
        summary:
          lang === "fr"
            ? `Je n’ai pas d’e-mail enregistré pour ${targetRaw}. Donne-le-moi et je m’en souviendrai.`
            : `I don't have an email saved for ${targetRaw}. Tell me and I'll remember it next time.`,
      };
    }
    return {
      action: "contact.open",
      status: "executed",
      title: `Email ${targetRaw}`,
      summary:
        lang === "fr"
          ? `Ouvre ton app mail pour écrire à ${email}.`
          : `Open your mail app to email ${email}.`,
      data: {
        targetName: targetRaw,
        channel: "email",
        hrefMailto: `mailto:${email}`,
      },
    };
  }

  if (!phone) {
    return {
      action: "contact.open",
      status: "needs_input",
      title: "No number saved",
      summary:
        lang === "fr"
          ? `Je n’ai pas de numéro pour ${targetRaw}. Dis quelque chose comme « le numéro de ma femme est … » et je l’enregistrerai.`
          : `I don't have a phone number saved for ${targetRaw}. Say something like “my wife's number is …” and I'll remember.`,
    };
  }

  const sanitized = sanitizePhoneForHref(phone);
  if (!sanitized) {
    return {
      action: "contact.open",
      status: "needs_input",
      title: "Invalid number",
      summary:
        lang === "fr"
          ? "Ce numéro ne semble pas valide. Peux-tu le corriger dans ta mémoire?"
          : "That saved number doesn't look valid. Try updating it in memory.",
    };
  }

  const hrefCall = `tel:${sanitized}`;
  const hrefSms = `sms:${sanitized}`;
  const hrefMailto = email ? `mailto:${encodeURIComponent(email)}` : undefined;

  return {
    action: "contact.open",
    status: "executed",
    title: channel === "sms" ? `Text ${targetRaw}` : `Call ${targetRaw}`,
    summary:
      channel === "sms"
        ? lang === "fr"
          ? `Voici un lien pour ouvrir Messages avec ce numéro.`
          : `Here's a link to open Messages with this number.`
        : lang === "fr"
          ? `Voici un lien pour ouvrir l’app Téléphone.`
          : `Here's a link to open your phone app.`,
    data: {
      targetName: targetRaw,
      channel,
      phoneDisplay: phone,
      hrefCall,
      hrefSms,
      ...(hrefMailto ? { hrefMailto } : {}),
    },
    };
}

function directionsFailureResult(
  action: AssistantActionPlan["action"],
  directions: ExtendedDirectionsResult & { error_message?: string },
): AssistantActionResult {
  const status = directions.status;
  const gm = directions.error_message?.trim();
  let summary = "Couldn't calculate that route right now. Try again or use more specific place names.";
  if (status === "ZERO_RESULTS") {
    summary = "No route turned up for those places — try clearer addresses or landmarks.";
  } else if (status === "NOT_FOUND") {
    summary = "One of those places couldn't be located. Try spelling out city and region.";
  } else if (status === "OVER_QUERY_LIMIT") {
    summary = "Directions quota was exceeded. Try again later.";
  } else if (status === "REQUEST_DENIED") {
    summary =
      gm ||
      "Maps denied the request — confirm billing, Geocoding + Directions APIs enabled, and API key restrictions.";
  } else if (status === "INVALID_REQUEST") {
    summary = gm || "The maps service couldn't understand that route request.";
  }
  return {
    action,
    status: "failed",
    title: "Directions unavailable",
    summary,
    provider: "google-maps",
    data: { googleDirectionsStatus: status },
  };
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
      summary: `I can route to ${destination}, but I need a starting place. Say where you're leaving from (e.g. "from home to …"), or enable location for this site and send your message again so I can use your current position. If you saved a home address in memory, say "from my place".`,
    };
  }

  try {
    const [originGeo, destinationGeo] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);

    const params: Record<string, unknown> = {
      origin: originGeo.formatted_address,
      destination: destinationGeo.formatted_address,
      mode,
    };
    if (mode === "driving" || mode === "transit") {
      params.departure_time = Math.floor(Date.now() / 1000);
    }

    let directions = await makeRequest<ExtendedDirectionsResult>("/maps/api/directions/json", params);

    if (directions.status === "INVALID_REQUEST" && "departure_time" in params) {
      const { departure_time: _dt, ...retryParams } = params;
      directions = await makeRequest<ExtendedDirectionsResult>("/maps/api/directions/json", retryParams);
    }

    if (directions.status !== "OK" || !directions.routes[0]?.legs[0]) {
      return directionsFailureResult(plan.action, directions as ExtendedDirectionsResult & { error_message?: string });
    }

    const route = directions.routes[0];
    const leg = route.legs[0];
    const steps = leg.steps.slice(0, 4).map(step => stripHtml(step.html_instructions));
    const originLabel = leg.start_address;
    const destinationLabel = leg.end_address;
    const { mapsUrlGoogle, mapsUrlApple } = buildDirectionsMapsUrls(originLabel, destinationLabel, mode);
    const oLoc = originGeo.geometry.location;
    const dLoc = destinationGeo.geometry.location;
    const originLat = typeof oLoc.lat === "function" ? oLoc.lat() : oLoc.lat;
    const originLng = typeof oLoc.lng === "function" ? oLoc.lng() : oLoc.lng;
    const destinationLat = typeof dLoc.lat === "function" ? dLoc.lat() : dLoc.lat;
    const destinationLng = typeof dLoc.lng === "function" ? dLoc.lng() : dLoc.lng;

    return {
      action: plan.action,
      status: "executed",
      title: `Route to ${destinationLabel}`,
      summary: leg.duration_in_traffic
        ? `${leg.distance.text}, about ${leg.duration_in_traffic.text} in current traffic.`
        : `${leg.distance.text}, about ${leg.duration.text}.`,
      provider: "google-maps",
      data: {
        origin: originLabel,
        destination: destinationLabel,
        originLat,
        originLng,
        destinationLat,
        destinationLng,
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
        durationInTrafficText: leg.duration_in_traffic?.text ?? null,
        mode,
        routeSummary: route.summary,
        steps,
        mapsUrlGoogle,
        mapsUrlApple,
      },
    };
  } catch (error) {
    console.warn("[Flow Guru] route.get failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const summary = msg.includes("Maps not configured") || msg.includes("GOOGLE_MAPS_API_KEY")
      ? "Maps isn't configured on the server yet."
      : "Couldn't reach the maps service. Try again shortly.";
    return {
      action: plan.action,
      status: "failed",
      title: "Directions unavailable",
      summary,
      provider: "google-maps",
    };
  }
}

async function executeWeatherAction(plan: AssistantActionPlan, options?: { language?: 'en' | 'fr' }): Promise<AssistantActionResult> {
  const language = options?.language ?? 'en';
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
      ? `${weatherCodeToLabel(current.weather_code, language)} and ${current.temperature_2m}°C right now, feeling like ${current.apparent_temperature}°C.`
      : (language === 'fr' ? "Les conditions actuelles sont disponibles." : "The latest conditions are available."),
    provider: "open-meteo",
    data: {
      location: geocode.formatted_address,
      lat,
      lon: lng,
      timezone: weather.timezone ?? null,
      current: current
        ? {
            time: current.time ?? null,
            temperatureC: current.temperature_2m ?? null,
            apparentTemperatureC: current.apparent_temperature ?? null,
            weatherLabel: weatherCodeToLabel(current.weather_code, language),
            windSpeedKph: current.wind_speed_10m ?? null,
          }
        : null,
      focusForecast:
        daily && daily.time?.[todayIndex]
          ? {
              date: daily.time[todayIndex],
              weatherLabel: weatherCodeToLabel(daily.weather_code?.[todayIndex], language),
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

  if (!action || !listName?.trim()) {
    return {
      action: "list.manage",
      status: "needs_input",
      title: "List name needed",
      summary: "Which list would you like me to manage? (e.g. Grocery, Todo)",
    };
  }

  try {
    const {
      listUserLists, createList, addListItem, deleteListItem,
      deleteList, getListItems, updateList, updateListItem
    } = await import("./db.js");

    const allLists = await listUserLists(options.userId);

    // Smarter matching:
    // 1. Try exact/substring match
    const normalizedListName = listName.trim().toLowerCase();
    let targetList = allLists.find(l => l.name.trim().toLowerCase() === normalizedListName) ?? allLists.find(l => l.name.toLowerCase().includes(normalizedListName));

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
        const itemSearch = (itemContent ?? "").trim().toLowerCase();
        const item = itemSearch
          ? (
              items.find(i => !i.completed && i.content.trim().toLowerCase() === itemSearch) ??
              items.find(i => !i.completed && i.content.toLowerCase().includes(itemSearch)) ??
              items.find(i => i.content.trim().toLowerCase() === itemSearch)
            )
          : undefined;
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
        const itemSearch = (itemContent ?? "").trim().toLowerCase();
        const item = itemSearch
          ? (
              items.find(i => !i.completed && i.content.trim().toLowerCase() === itemSearch) ??
              items.find(i => !i.completed && i.content.toLowerCase().includes(itemSearch)) ??
              items.find(i => i.content.trim().toLowerCase() === itemSearch)
            )
          : undefined;
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
        const itemSearch = (itemContent ?? "").trim().toLowerCase();
        const item = itemSearch
          ? (
              items.find(i => !i.completed && i.content.trim().toLowerCase() === itemSearch) ??
              items.find(i => !i.completed && i.content.toLowerCase().includes(itemSearch)) ??
              items.find(i => i.content.trim().toLowerCase() === itemSearch)
            )
          : undefined;
        if (!item) {
          return { action: "list.manage", status: "failed", title: "Item not found", summary: `I couldn't find '${itemContent}' on your ${listName} list.` };
        }

        const { setListItemReminder, setListItemLocationTrigger } = await import("./db.js");

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
          const { resolveNaturalLanguageTime } = await import("./_core/googleCalendar.js");
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Flow Guru] List action failed.", {
      action,
      listName,
      itemContent,
      userId: options.userId,
      error: message,
    });
    return {
      action: "list.manage",
      status: "failed",
      title: "List update failed",
      summary: "I couldn't update that list right now. Please try again in a moment.",
      data: { action, listName, itemContent, error: message },
    };
  }
}

async function executeMusicAction(
  plan: AssistantActionPlan,
  _options: { userId: number }
): Promise<AssistantActionResult> {
  const query = (plan.music?.query || "lofi").toLowerCase();
  
  // Simple mapping from query to internal station IDs
  let stationId = "focus";
  let label = "Focus";
  
  if (query.includes("chill") || query.includes("relax") || query.includes("lush")) {
    stationId = "chill";
    label = "Chill";
  } else if (query.includes("energy") || query.includes("beat") || query.includes("workout") || query.includes("dance")) {
    stationId = "energy";
    label = "Energy";
  } else if (query.includes("sleep") || query.includes("night") || query.includes("calm")) {
    stationId = "sleep";
    label = "Sleep";
  } else if (query.includes("space") || query.includes("deep") || query.includes("ambient")) {
    stationId = "space";
    label = "Space";
  } else if (query.includes("focus") || query.includes("study") || query.includes("groove")) {
    stationId = "focus";
    label = "Focus";
  }

  return {
    action: "music.play",
    status: "executed",
    title: `Switching to ${label} Radio`,
    summary: `I've started the ${label} station for you.`,
    provider: "internal-radio",
    data: {
      stationId,
      label,
    },
  };
}

async function executeKnowledgeSearch(
  plan: AssistantActionPlan,
  options: { message: string },
): Promise<AssistantActionResult> {
  if (!isVertexSearchConfigured()) {
    return {
      action: "knowledge.search",
      status: "needs_connection",
      title: "Knowledge search unavailable",
      summary:
        "Vertex AI Search isn't configured yet. Add VERTEX_SEARCH_PROJECT_ID, VERTEX_SEARCH_LOCATION, VERTEX_SEARCH_DATA_STORE_ID, and VERTEX_SEARCH_GOOGLE_CREDENTIALS_JSON (see docs/VERTEX_SEARCH.md).",
      provider: "vertex-ai-search",
    };
  }

  const q = plan.knowledge?.query?.trim() || options.message.trim();
  try {
    const { summary, sources } = await searchKnowledgeBase(q);
    return {
      action: "knowledge.search",
      status: "executed",
      title: "Knowledge base",
      summary,
      provider: "vertex-ai-search",
      data: { sources },
    };
  } catch (err) {
    console.warn("[Flow Guru] knowledge.search failed:", err);
    return {
      action: "knowledge.search",
      status: "failed",
      title: "Knowledge search failed",
      summary: "I couldn't query your knowledge base right now. Try again shortly.",
      provider: "vertex-ai-search",
    };
  }
}

export async function executeAssistantAction(
  plan: AssistantActionPlan,
  optionsIn?: {
    userId?: number;
    userName?: string | null;
    message?: string;
    memoryContext?: string;
    timeZone?: string | null;
    language?: "en" | "fr";
    deviceLatitude?: number;
    deviceLongitude?: number;
  },
): Promise<AssistantActionResult> {
  const options = {
    userId: optionsIn?.userId ?? -1,
    userName: optionsIn?.userName,
    message: optionsIn?.message ?? "",
    memoryContext: optionsIn?.memoryContext ?? "",
    timeZone: optionsIn?.timeZone ?? null,
    language: (optionsIn?.language ?? "en") as "en" | "fr",
    deviceLatitude: optionsIn?.deviceLatitude,
    deviceLongitude: optionsIn?.deviceLongitude,
  };

  console.log(`[Assistant Action] Executing: ${plan.action}`, plan);

  try {
    switch (plan.action) {
      case "list.manage":
        return await executeListAction(plan, options);
      case "knowledge.search":
        return await executeKnowledgeSearch(plan, options);
      case "calendar.create_event":
        return await executeCalendarCreateAction(plan, options as any);
      case "calendar.list_events":
        return await executeCalendarListAction(plan, options as any);
      case "route.get": {
        const destination = normalizeText(plan.route?.destination);
        let origin = normalizeText(plan.route?.origin);
        if (!origin && options.memoryContext) {
          origin = extractHomeOriginFromMemory(options.memoryContext);
        }
        if (
          !origin &&
          options.deviceLatitude != null &&
          options.deviceLongitude != null &&
          Number.isFinite(options.deviceLatitude) &&
          Number.isFinite(options.deviceLongitude)
        ) {
          origin = `${options.deviceLatitude},${options.deviceLongitude}`;
        }
        if (!origin && options.memoryContext) {
          const fromMemory = extractApproximateDeviceLocationFromMemory(options.memoryContext);
          if (fromMemory) {
            origin = `${fromMemory.lat},${fromMemory.lng}`;
          }
        }
        const enrichedPlan: AssistantActionPlan = {
          ...plan,
          route: {
            origin,
            destination,
            mode: plan.route?.mode ?? "driving",
          },
        };
        return await executeRouteAction(enrichedPlan);
      }
      case "contact.open":
        return await executeContactOpenAction(plan, {
          userId: options.userId,
          language: options.language,
        });
      case "weather.get":
        return await executeWeatherAction(plan, options as any);
      case "news.get":
        return await executeNewsAction(plan, options as any);
      case "music.play":
        return await executeMusicAction(plan, options as any);
      case "browser.use":
        return {
          action: "browser.use" as const,
          status: "executed" as const,
          title: "Opening Browser",
          summary: `I'm looking that up for you now.`,
          data: { task: plan.browser?.task },
        };
      case "system.subagent":
        return {
          action: "system.subagent" as const,
          status: "executed" as const,
          title: "Working on it",
          summary: `I'm handling that task in the background.`,
          data: { task: plan.subagent?.task },
        };
      case "none":
      default:
        return {
          action: "none" as const,
          status: "executed" as const,
          title: "Chatting",
          summary: "I'm just chatting with you.",
        };
    }
  } catch (error) {
    console.warn("[Flow Guru] External action execution failed.", error);
    return {
      action: plan.action,
      status: "failed" as const,
      title: plan.action === "list.manage" ? "List action unavailable" : "Action unavailable",
      summary: plan.action === "list.manage"
        ? "I couldn't complete that list action right now. Please try again."
        : "That action is temporarily unavailable. Please try again in a moment.",
      provider: plan.action.startsWith("route")
        ? "google-maps"
        : plan.action.startsWith("weather")
          ? "open-meteo"
          : plan.action.startsWith("news")
            ? "actually-relevant"
            : plan.action.startsWith("calendar")
              ? "google-calendar"
              : plan.action.startsWith("music")
                ? "internal-radio"
                : plan.action === "knowledge.search"
                  ? "vertex-ai-search"
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

  return `${result.title}\n\n${result.summary}`;
}
