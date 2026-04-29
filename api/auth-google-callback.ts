import type { VercelRequest, VercelResponse } from "@vercel/node";
import { COOKIE_NAME, ONE_YEAR_MS } from "./lib/shared/const.js";
import { ENV } from "./lib/_core/env.js";
import { getGoogleAuthCallbackUrl } from "./lib/_core/googleAuthRedirect.js";
import { sdk } from "./lib/_core/sdk.js";
import * as db from "./lib/db.js";

function buildSetCookieHeader(name: string, value: string, maxAgeMs: number, secure: boolean): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  // Do NOT URL-encode the JWT value — the cookie `parse()` reader does not decode it
  let cookie = `${name}=${value}; Max-Age=${maxAgeSec}; Expires=${expires}; Path=/; HttpOnly; SameSite=None`;
  if (secure) cookie += "; Secure";
  return cookie;
}

function isSecure(req: VercelRequest): boolean {
  const forwarded = req.headers["x-forwarded-proto"] as string | undefined;
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  return false;
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
    const redirectUri = getGoogleAuthCallbackUrl(req);
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

    // verifySession requires name to be a non-empty string — use email prefix or openId as fallback
    const displayName = profile.name || (profile.email ? profile.email.split('@')[0] : openId);
    const sessionToken = await sdk.createSessionToken(openId, {
      name: displayName,
      expiresInMs: ONE_YEAR_MS,
    });

    // Use raw Set-Cookie header — Vercel serverless VercelResponse does not have .cookie()
    const secure = isSecure(req);
    const cookieHeader = buildSetCookieHeader(COOKIE_NAME, sessionToken, ONE_YEAR_MS, secure);
    res.setHeader("Set-Cookie", cookieHeader);

    return res.redirect(302, "/");
  } catch (err: any) {
    const errMsg = encodeURIComponent((err?.message || String(err)).slice(0, 200));
    console.error("[GoogleAuth] Callback failed", err);
    return res.redirect(302, `/?auth_error=callback_failed&detail=${errMsg}`);
  }
}
