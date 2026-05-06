import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { listMicrosoftCalendarEvents } from "./lib/_core/microsoftCalendar.js";
import { getProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ connected: false, events: [] });
    }

    const connection = await getProviderConnection(user.id, "microsoft-calendar");
    if (!connection || connection.status !== "connected") {
      return res.json({ connected: false, events: [] });
    }

    // Compute today boundaries
    const now = new Date();
    const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const timeMax = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    const result = await listMicrosoftCalendarEvents({
      userId: user.id,
      timeMinIso: timeMin,
      timeMaxIso: timeMax,
      maxResults: 20,
    });

    const events = (result.value ?? []).map((e: any) => ({
      id: e.id,
      summary: e.subject ?? "(No title)",
      startISO: e.start?.dateTime ?? null,
      endISO: e.end?.dateTime ?? null,
      allDay: false, // Graph API calendarview returns instances with times usually
      location: e.location?.displayName ?? null,
    }));

    return res.json({ connected: true, events });
  } catch (err: any) {
    console.error("[Microsoft Calendar Events]", err.message);
    if (err.message?.includes("reconnected") || err.message?.includes("not connected")) {
      return res.json({ connected: false, events: [] });
    }
    return res.status(500).json({ connected: false, events: [], error: err.message });
  }
}
