import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { ENV } from "./lib/_core/env.js";
import {
  buildGoogleOAuthState,
  getGoogleCalendarCallbackUrl,
} from "./lib/_core/googleCalendar.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);

    if (!ENV.googleClientId) {
      return res.redirect(302, "/?error=google_not_configured");
    }

    const state = buildGoogleOAuthState(user.id);
    const redirectUri = getGoogleCalendarCallbackUrl(req);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", ENV.googleClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    return res.redirect(302, authUrl.toString());
  } catch {
    return res.redirect(302, "/?error=auth_required");
  }
}
