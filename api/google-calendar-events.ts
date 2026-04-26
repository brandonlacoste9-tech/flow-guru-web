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
    
    // Get YYYY-MM-DD in target TZ
    const formatter = new Intl.DateTimeFormat("en-CA", { 
      timeZone: tz, 
      year: "numeric", 
      month: "2-digit", 
      day: "2-digit" 
    });
    const todayStr = formatter.format(now); 

    // Calculate TZ offset string (e.g. -04:00)
    const dateInTZ = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const diff = Math.round((dateInTZ.getTime() - utcDate.getTime()) / 60000);
    const absDiff = Math.abs(diff);
    const h = String(Math.floor(absDiff / 60)).padStart(2, '0');
    const m = String(absDiff % 60).padStart(2, '0');
    const sign = diff >= 0 ? '+' : '-';
    const offset = `${sign}${h}:${m}`;

    const timeMin = `${todayStr}T00:00:00${offset}`;
    const timeMax = `${todayStr}T23:59:59${offset}`;

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
    if (err.message?.includes("reconnected") || err.message?.includes("not connected")) {
      return res.json({ connected: false, events: [] });
    }
    return res.status(500).json({ connected: false, events: [], error: err.message });
  }
}
