import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseGoogleOAuthState,
  connectGoogleCalendar,
  getGoogleCalendarCallbackUrl,
} from "./lib/_core/googleCalendar.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  if (error) {
    return res.redirect(302, "/?error=google_denied");
  }

  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  try {
    const parsed = parseGoogleOAuthState(state);
    const redirectUri = getGoogleCalendarCallbackUrl(req);

    await connectGoogleCalendar({
      userId: parsed.userId,
      code,
      redirectUri,
    });

    return res.redirect(302, "/?connected=google-calendar");
  } catch (err: any) {
    console.error("[Google Calendar] Callback error:", err);
    return res.redirect(302, "/?error=google_calendar_failed");
  }
}
