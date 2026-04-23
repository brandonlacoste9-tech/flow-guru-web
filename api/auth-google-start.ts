import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENV } from "./lib/_core/env.js";

function getCallbackUrl(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "floguru.com";
  return `${proto}://${host}/api/auth/google/callback`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ENV.googleClientId) {
    return res.status(500).send("Google Sign-In is not configured (missing GOOGLE_CLIENT_ID).");
  }

  const redirectUri = getCallbackUrl(req);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ENV.googleClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  return res.redirect(302, url.toString());
}
