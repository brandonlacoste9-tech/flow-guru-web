import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const empty = {
    googleCalendar: false,
    googleCalendarLabel: null as string | null,
    microsoftCalendar: false,
    microsoftCalendarLabel: null as string | null,
    spotify: false,
    spotifyLabel: null as string | null,
  };

  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(200).json(empty);
    }
    if (!user) {
      return res.status(200).json(empty);
    }

    const [gcal, mcal, spot] = await Promise.all([
      getProviderConnection(user.id, "google-calendar"),
      getProviderConnection(user.id, "microsoft-calendar"),
      getProviderConnection(user.id, "spotify"),
    ]);

    return res.status(200).json({
      googleCalendar: gcal?.status === "connected",
      googleCalendarLabel: gcal?.status === "connected" ? (gcal as any).externalAccountLabel ?? null : null,
      microsoftCalendar: mcal?.status === "connected",
      microsoftCalendarLabel: mcal?.status === "connected" ? (mcal as any).externalAccountLabel ?? null : null,
      spotify: spot?.status === "connected",
      spotifyLabel: spot?.status === "connected" ? (spot as any).externalAccountLabel ?? null : null,
    });
  } catch (err: any) {
    console.error("[Integrations Status]", err?.message || err);
    return res.status(200).json(empty);
  }
}
