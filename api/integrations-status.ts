import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ googleCalendar: false });
    }

    const gcal = await getProviderConnection(user.id, "google-calendar");

    return res.json({
      googleCalendar: gcal?.status === "connected",
      googleCalendarLabel: gcal?.status === "connected" ? (gcal as any).externalAccountLabel ?? null : null,
    });
  } catch (err: any) {
    console.error("[Integrations Status]", err.message);
    return res.status(500).json({ googleCalendar: false });
  }
}
