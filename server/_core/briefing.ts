import { textToSpeech, generateSoundAsDataUri } from "./elevenLabs";
import { listGoogleCalendarEvents } from "./googleCalendar";
import { getProviderConnection } from "../db";
import { invokeLLM } from "./llm";

// ─── Weather helpers ────────────────────────────────────────────────────────

type OpenMeteoCurrentWeather = {
  temperature_2m?: number;
  apparent_temperature?: number;
  weather_code?: number;
  wind_speed_10m?: number;
};

function weatherCodeToLabel(code?: number): string {
  if (code == null) return "unknown conditions";
  if (code <= 1) return "clear skies";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 65) return "rainy";
  if (code <= 77) return "snowy";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  if (code <= 99) return "thunderstorms";
  return "unsettled weather";
}

async function geocodeWithOpenMeteo(location: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result) return null;
    return { lat: result.latitude, lng: result.longitude, name: result.name || location };
  } catch {
    return null;
  }
}

async function fetchCurrentWeather(location: string): Promise<{
  label: string;
  tempC: number;
  feelsLikeC: number;
  locationName: string;
} | null> {
  try {
    const geo = await geocodeWithOpenMeteo(location);
    if (!geo) return null;

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(geo.lat));
    url.searchParams.set("longitude", String(geo.lng));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
    url.searchParams.set("timezone", "auto");

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;

    const data = await resp.json();
    const current = data.current as OpenMeteoCurrentWeather | undefined;
    if (!current || current.temperature_2m == null) return null;

    return {
      label: weatherCodeToLabel(current.weather_code),
      tempC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature ?? current.temperature_2m,
      locationName: geo.name,
    };
  } catch {
    return null;
  }
}

// ─── Calendar helpers ───────────────────────────────────────────────────────

type CalendarEvent = {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

async function fetchTodayEvents(userId: number): Promise<CalendarEvent[]> {
  try {
    const connection = await getProviderConnection(userId, "google-calendar");
    if (!connection || connection.status !== "connected") return [];

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await listGoogleCalendarEvents({
      userId,
      timeMinIso: now.toISOString(),
      timeMaxIso: endOfDay.toISOString(),
      maxResults: 10,
    });

    return (result?.items ?? []) as CalendarEvent[];
  } catch {
    return [];
  }
}

function formatEventTime(event: CalendarEvent): string {
  const dt = event.start?.dateTime;
  if (!dt) return "all day";
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "sometime today";
  }
}

async function fetchActiveListItems(userId: number): Promise<{ listName: string; count: number; examples: string[] }[]> {
  try {
    const { listUserLists, getListItems } = await import("../db");
    const lists = await listUserLists(userId);
    const results = [];
    for (const list of lists) {
      const items = await getListItems(userId, list.id);
      const active = items.filter(i => !i.completed);
      if (active.length > 0) {
        results.push({
          listName: list.name,
          count: active.length,
          examples: active.slice(0, 3).map(i => i.content),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export type BriefingData = {
  script: string;
  weather: { label: string; tempC: number; feelsLikeC: number; locationName: string } | null;
  events: CalendarEvent[];
  lists: { listName: string; count: number; examples: string[] }[];
  greeting: string;
};

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export async function buildBriefingData(params: {
  userId: number;
  userName: string;
  assistantName: string;
  location?: string | null;
  wakeUpTime?: string | null;
  buddyPersonality?: string | null;
}): Promise<BriefingData> {
  // Fetch weather, calendar, and lists in parallel
  const [weather, events, lists] = await Promise.all([
    params.location ? fetchCurrentWeather(params.location) : Promise.resolve(null),
    fetchTodayEvents(params.userId),
    fetchActiveListItems(params.userId),
  ]);

  const greeting = getTimeOfDayGreeting();
  
  const weatherContext = weather 
    ? `Right now in ${weather.locationName}, it's ${Math.round(weather.tempC)}°C and ${weather.label}, feeling like ${Math.round(weather.feelsLikeC)}°C.`
    : "No weather data available.";
    
  const calendarContext = events.length > 0
    ? `You have ${events.length} events today: ${events.map(e => `${e.summary} at ${formatEventTime(e)}`).join(", ")}.`
    : "Your calendar is clear today.";
    
  const listsContext = lists.length > 0
    ? `You have active items on your lists: ${lists.map(l => `${l.listName} (${l.count} items, e.g. ${l.examples.join(", ")})`).join("; ")}.`
    : "Your lists are all clear.";

  const systemPrompt = [
    "You are Flow Guru, a warm and helpful personal assistant.",
    params.buddyPersonality || "Your style: Short, warm, direct. Never robotic.",
    "Generate a natural morning briefing script based on the provided data.",
    "Keep it conversational, like a friend talking to a friend.",
    "Do NOT use markdown. Just plain text suitable for text-to-speech.",
    "Include the greeting, weather, calendar, and list highlights.",
  ].join("\n");

  const userPrompt = [
    `User: ${params.userName}`,
    `Greeting: ${greeting}`,
    `Weather: ${weatherContext}`,
    `Calendar: ${calendarContext}`,
    `Lists: ${listsContext}`,
  ].join("\n");

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const contentRaw = response.choices[0]?.message.content;
  const script = (typeof contentRaw === "string" ? contentRaw.trim() : "") || 
    `${greeting}, ${params.userName}. Weather is ${weather?.label || "clear"}. You have ${events.length} events and some list items. Have a great day!`;

  return { script, weather, events, lists, greeting };
}

// ─── Audio generation ───────────────────────────────────────────────────────

export type BriefingResult = {
  script: string;
  audioDataUri: string;
  weather: BriefingData["weather"];
  events: CalendarEvent[];
  greeting: string;
};

export async function generateBriefing(params: {
  userId: number;
  userName: string;
  assistantName: string;
  location?: string | null;
  wakeUpTime?: string | null;
  buddyPersonality?: string | null;
  voiceId?: string;
}): Promise<BriefingResult> {
  const data = await buildBriefingData(params);

  // Generate spoken audio via ElevenLabs TTS
  const audioBuffer = await textToSpeech({
    text: data.script,
    voiceId: params.voiceId,
    stability: 0.6,
    similarityBoost: 0.8,
  });

  const audioDataUri = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;

  return {
    script: data.script,
    audioDataUri,
    weather: data.weather,
    events: data.events,
    greeting: data.greeting,
  };
}

// ─── Quick sound generation ─────────────────────────────────────────────────

export type QuickSoundType =
  | "focus"
  | "relax"
  | "wake_up"
  | "wind_down"
  | "rain"
  | "nature";

const SOUND_PROMPTS: Record<QuickSoundType, string> = {
  focus: "Focused concentration music. Steady, minimal electronic beat with soft ambient pads. Productivity and clarity.",
  relax: "Deeply relaxing ambient soundscape. Warm, gentle pads with soft chimes. Peaceful and calm.",
  wake_up: "Bright, uplifting morning alarm chime. Gentle ascending tones, melodic bells, warm and encouraging.",
  wind_down: "Soothing wind-down sounds for sleep. Very slow, warm, dreamy ambient tones fading gently.",
  rain: "Natural rain sounds. Steady rain falling on a window, occasional distant thunder. Immersive.",
  nature: "Peaceful nature sounds. Birds singing, gentle stream, soft breeze through leaves. Forest morning.",
};

export async function generateQuickSound(
  type: QuickSoundType,
  durationSeconds = 15,
): Promise<{ audioDataUri: string; label: string }> {
  const prompt = SOUND_PROMPTS[type] || SOUND_PROMPTS.relax;
  const labels: Record<QuickSoundType, string> = {
    focus: "Focus Sounds",
    relax: "Relaxation",
    wake_up: "Wake Up Chime",
    wind_down: "Wind Down",
    rain: "Rain Sounds",
    nature: "Nature Sounds",
  };

  const audioDataUri = await generateSoundAsDataUri({
    text: prompt,
    durationSeconds,
    promptInfluence: 0.7,
  });

  return { audioDataUri, label: labels[type] };
}
