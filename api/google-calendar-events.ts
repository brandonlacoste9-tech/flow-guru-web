import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getGoogleCalendarAccessToken, listGoogleCalendarEvents } from "./lib/_core/googleCalendar.js";
import { getProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ connected: false, events: [] });
    }

    const connection = await getProviderConnection(user.id, "google-calendar");
    if (!connection || connection.status !== "connected") {
      return res.json({ connected: false, events: [] });
    }

    // Compute today boundaries in user TZ (default America/Toronto)
    const tz = "America/Toronto";
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const todayStr = formatter.format(now); // "2026-04-24"
    const timeMin = new Date(`${todayStr}T00:00:00`).toISOString();
    const timeMax = new Date(`${todayStr}T23:59:59`).toISOString();

    const result = await listGoogleCalendarEvents({
      userId: user.id,
      timeMinIso: timeMin,
      timeMaxIso: timeMax,
      maxResults: 20,
    });

    const events = (result.items ?? []).map((e: any) => ({
      id: e.id,
      summary: e.summary ?? "(No title)",
      startISO: e.start?.dateTime ?? e.start?.date ?? null,
      endISO: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: !e.start?.dateTime,
      location: e.location ?? null,
    }));

    return res.json({ connected: true, events });
  } catch (err: any) {
    console.error("[Google Calendar Events]", err.message);
    // If token is bad, report as disconnected (not a server error)
    if (err.message?.includes("reconnected") || err.message?.includes("not connected")) {
      return res.json({ connected: false, events: [] });
    }
    return res.status(500).json({ connected: false, events: [], error: err.message });
  }
}
