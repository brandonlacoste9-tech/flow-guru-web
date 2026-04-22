import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENV } from "./lib/_core/env.js";
import { sdk } from "./lib/_core/sdk.js";
import { getProviderConnection, upsertProviderConnection } from "./lib/db.js";
import {
  buildGoogleOAuthState,
  connectGoogleCalendar,
  getGoogleCalendarCallbackUrl,
  parseGoogleOAuthState,
} from "./lib/_core/googleCalendar.js";
import {
  buildSpotifyOAuthState,
  connectSpotify,
  getSpotifyCallbackUrl,
  parseSpotifyOAuthState,
} from "./lib/_core/spotify.js";

type Provider = "google-calendar" | "spotify";

function parseRoute(url: string): { provider: Provider; action: string } | null {
  // Matches: /api/integrations/{provider}/{action} or /{provider}/{action}
  const match = url.split("?")[0].match(/\/(google-calendar|spotify)\/(start|callback|status)$/);
  if (!match) return null;
  return { provider: match[1] as Provider, action: match[2] };
}

async function requireUser(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) { res.status(401).json({ error: "Authentication required." }); return null; }
    return user;
  } catch {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
}

function getScopes(provider: Provider) {
  if (provider === "google-calendar") {
    return [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ];
  }
  return [
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private",
    "playlist-read-collaborative",
  ];
}

function isConfigured(provider: Provider) {
  if (provider === "google-calendar") return Boolean(ENV.googleClientId && ENV.googleClientSecret);
  return Boolean(ENV.spotifyClientId && ENV.spotifyClientSecret);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = parseRoute(req.url || "");
  if (!route) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const { provider, action } = route;

  if (action === "status") {
    const user = await requireUser(req, res);
    if (!user) return;
    const connection = await getProviderConnection(user.id, provider);
    const configured = isConfigured(provider);
    res.json({
      provider,
      configured,
      connection: connection ?? { provider, status: configured ? "not_connected" : "pending" },
    });
    return;
  }

  if (action === "start") {
    const user = await requireUser(req, res);
    if (!user) return;

    if (!isConfigured(provider)) {
      res.status(503).json({ error: `${provider} credentials are not configured.` });
      return;
    }

    await upsertProviderConnection({ userId: user.id, provider, status: "pending", lastError: null });

    if (provider === "google-calendar") {
      const redirectUri = getGoogleCalendarCallbackUrl(req);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", ENV.googleClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", getScopes(provider).join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", buildGoogleOAuthState(user.id));
      res.redirect(302, authUrl.toString());
      return;
    }

    if (provider === "spotify") {
      const redirectUri = getSpotifyCallbackUrl(req as any);
      const authUrl = new URL("https://accounts.spotify.com/authorize");
      authUrl.searchParams.set("client_id", ENV.spotifyClientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", getScopes(provider).join(" "));
      authUrl.searchParams.set("state", buildSpotifyOAuthState(user.id));
      res.redirect(302, authUrl.toString());
      return;
    }
  }

  if (action === "callback") {
    const user = await requireUser(req, res);
    if (!user) return;

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;

    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state." });
      return;
    }

    if (provider === "google-calendar") {
      try {
        const parsedState = parseGoogleOAuthState(state);
        if (parsedState.userId !== user.id) throw new Error("State mismatch.");
        const result = await connectGoogleCalendar({
          userId: user.id, code, redirectUri: getGoogleCalendarCallbackUrl(req),
        });
        res.redirect(302, `/?integration=google-calendar&status=connected&account=${encodeURIComponent(result.accountLabel)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Google Calendar connection failed.";
        await upsertProviderConnection({ userId: user.id, provider, status: "error", lastError: msg });
        res.redirect(302, `/?integration=google-calendar&status=error&message=${encodeURIComponent(msg)}`);
      }
      return;
    }

    if (provider === "spotify") {
      try {
        const parsedState = parseSpotifyOAuthState(state);
        if (parsedState.userId !== user.id) throw new Error("State mismatch.");
        const result = await connectSpotify({
          userId: user.id, code, redirectUri: getSpotifyCallbackUrl(req as any),
        });
        res.redirect(302, `/?integration=spotify&status=connected&account=${encodeURIComponent(result.externalAccountLabel)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Spotify connection failed.";
        await upsertProviderConnection({ userId: user.id, provider, status: "error", lastError: msg });
        res.redirect(302, `/?integration=spotify&status=error&message=${encodeURIComponent(msg)}`);
      }
      return;
    }
  }

  res.status(404).json({ error: "Not found." });
}
