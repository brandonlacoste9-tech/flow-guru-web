/**
 * Google Sign-In for Flow Guru user accounts.
 *
 * Flow:
 *   GET /api/auth/google          → redirect to Google OAuth consent screen
 *   GET /api/auth/google/callback → exchange code, upsert user, set JWT cookie, redirect to /
 */

import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import * as db from "../db.js";
import { getSessionCookieOptions } from "./cookies.js";
import { sdk } from "./sdk.js";
import { ENV } from "./env.js";
import { getGoogleAuthCallbackUrl } from "./googleAuthRedirect.js";

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`);
  return res.json() as Promise<{ id: string; email?: string; name?: string }>;
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
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

export function registerGoogleAuthRoutes(app: Express) {
  // Step 1: Redirect to Google
  app.get("/api/auth/google", (req: any, res: any) => {
    const vReq = req as VercelRequest;

    if (!ENV.googleClientId) {
      res.status(500).send("Google Sign-In is not configured (missing GOOGLE_CLIENT_ID).");
      return;
    }

    const redirectUri = getGoogleAuthCallbackUrl(vReq);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");

    res.redirect(url.toString());
  });

  // Step 2: Handle Google callback
  app.get("/api/auth/google/callback", async (req: any, res: any) => {
    const vReq = req as VercelRequest;
    const vRes = res as VercelResponse;

    const code = getQueryParam(vReq, "code");
    const error = getQueryParam(vReq, "error");

    if (error || !code) {
      vRes.redirect("/?auth_error=" + encodeURIComponent(error || "no_code"));
      return;
    }

    try {
      const redirectUri = getGoogleAuthCallbackUrl(vReq);
      const accessToken = await exchangeGoogleCode(code, redirectUri);
      const profile = await fetchGoogleProfile(accessToken);

      if (!profile.id) {
        vRes.redirect("/?auth_error=no_profile_id");
        return;
      }

      // Use a namespaced openId so it never collides with Manus OAuth users
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

      const cookieOptions = getSessionCookieOptions(vReq as any);
      (vRes as any).cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      vRes.redirect("/");
    } catch (err) {
      console.error("[GoogleAuth] Callback failed", err);
      vRes.redirect("/?auth_error=callback_failed");
    }
  });
}
