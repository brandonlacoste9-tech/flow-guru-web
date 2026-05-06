import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { ENV } from "./lib/_core/env.js";
import {
  buildMicrosoftOAuthState,
  getMicrosoftCalendarCallbackUrl,
} from "./lib/_core/microsoftCalendar.js";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Calendars.Read",
  "Calendars.ReadWrite",
].join(" ");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.redirect(302, "/?error=auth_required");
    }

    if (!ENV.microsoftClientId) {
      return res.redirect(302, "/?error=microsoft_not_configured");
    }

    const state = buildMicrosoftOAuthState(user.id);
    const redirectUri = getMicrosoftCalendarCallbackUrl(req);

    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    authUrl.searchParams.set("client_id", ENV.microsoftClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("state", state);

    return res.redirect(302, authUrl.toString());
  } catch {
    return res.redirect(302, "/?error=auth_required");
  }
}
