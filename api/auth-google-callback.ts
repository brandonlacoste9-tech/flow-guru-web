import type { VercelRequest, VercelResponse } from "@vercel/node";
import { COOKIE_NAME, ONE_YEAR_MS } from "./lib/shared/const.js";
import { ENV } from "./lib/_core/env.js";
import { sdk } from "./lib/_core/sdk.js";
import * as db from "./lib/db.js";
import { getSessionCookieOptions } from "./lib/_core/cookies.js";

function getCallbackUrl(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "floguru.com";
  return `${proto}://${host}/api/auth/google/callback`;
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token exchange failed: ${res.status}`);
  }
  return data.access_token;
}

async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`);
  return res.json() as Promise<{ id: string; email?: string; name?: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  if (error || !code) {
    return res.redirect(302, "/?auth_error=" + encodeURIComponent(error || "no_code"));
  }

  try {
    const redirectUri = getCallbackUrl(req);
    const accessToken = await exchangeGoogleCode(code, redirectUri);
    const profile = await fetchGoogleProfile(accessToken);

    if (!profile.id) {
      return res.redirect(302, "/?auth_error=no_profile_id");
    }

    const openId = `google_${profile.id}`;

    await db.upsertUser({
      openId,
      name: profile.name || null,
      email: profile.email || null,
      loginMethod: "google",
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(openId, {
      name: profile.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    (res as any).cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    return res.redirect(302, "/");
  } catch (err) {
    console.error("[GoogleAuth] Callback failed", err);
    return res.redirect(302, "/?auth_error=callback_failed");
  }
}
