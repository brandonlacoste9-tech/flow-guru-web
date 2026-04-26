import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getProviderConnection, upsertProviderConnection } from "../db";
import {
  buildGoogleOAuthState,
  connectGoogleCalendar,
  getGoogleCalendarCallbackUrl,
  parseGoogleOAuthState,
} from "./googleCalendar";
import {
  buildSpotifyOAuthState,
  connectSpotify,
  getSpotifyCallbackUrl,
  parseSpotifyOAuthState,
} from "./spotify";

type SupportedProvider = "google-calendar" | "spotify";

const PROVIDERS: SupportedProvider[] = ["google-calendar", "spotify"];

function isSupportedProvider(value: string): value is SupportedProvider {
  return PROVIDERS.includes(value as SupportedProvider);
}

function getProviderConfig(provider: SupportedProvider) {
  if (provider === "google-calendar") {
    return {
      configured: Boolean(ENV.googleClientId && ENV.googleClientSecret),
      label: "Google Calendar",
      scopes: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    };
  }

  return {
    configured: Boolean(ENV.spotifyClientId && ENV.spotifyClientSecret),
    label: "Spotify",
    scopes: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "playlist-read-private",
      "playlist-read-collaborative",
    ],
  };
}

async function requireUser(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required." });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
}

export function registerProviderConnectionRoutes(app: Express) {
  app.get("/api/integrations/:provider/status", async (req, res) => {
    const providerParam = req.params.provider;
    if (!isSupportedProvider(providerParam)) {
      res.status(404).json({ error: "Unknown provider." });
      return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const connection = await getProviderConnection(user.id, providerParam);
    const config = getProviderConfig(providerParam);

    res.json({
      provider: providerParam,
      configured: config.configured,
      label: config.label,
      scopes: config.scopes,
      connection:
        connection ??
        {
          provider: providerParam,
          status: config.configured ? "not_connected" : "pending",
          externalAccountLabel: null,
          lastError: config.configured ? null : `${config.label} credentials have not been added yet.`,
        },
    });
  });

  app.get("/api/integrations/:provider/start", async (req, res) => {
    const providerParam = req.params.provider;
    if (!isSupportedProvider(providerParam)) {
      res.status(404).json({ error: "Unknown provider." });
      return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const config = getProviderConfig(providerParam);

    if (!config.configured) {
      await upsertProviderConnection({
        userId: user.id,
        provider: providerParam,
        status: "error",
        lastError: `${config.label} credentials have not been added yet.`,
      });
      res.status(503).json({
        provider: providerParam,
        configured: false,
        status: "error",
        message: `${config.label} credentials have not been added yet. Add the provider secrets to activate account linking.`,
        scopes: config.scopes,
      });
      return;
    }

    if (providerParam === "google-calendar") {
      await upsertProviderConnection({
        userId: user.id,
        provider: providerParam,
        status: "pending",
        lastError: null,
      });

      const redirectUri = getGoogleCalendarCallbackUrl(req);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", ENV.googleClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", buildGoogleOAuthState(user.id));

      res.redirect(302, authUrl.toString());
      return;
    }

    if (providerParam === "spotify") {
      await upsertProviderConnection({
        userId: user.id,
        provider: providerParam,
        status: "pending",
        lastError: null,
      });

      const redirectUri = getSpotifyCallbackUrl(req);
      const authUrl = new URL("https://accounts.spotify.com/authorize");
      authUrl.searchParams.set("client_id", ENV.spotifyClientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", config.scopes.join(" "));
      authUrl.searchParams.set("state", buildSpotifyOAuthState(user.id));

      res.redirect(302, authUrl.toString());
      return;
    }

    res.status(501).json({
      provider: providerParam,
      configured: true,
      status: "error",
      message: `${config.label} provider is not fully implemented yet.`,
      scopes: config.scopes,
    });
  });

  app.get("/api/integrations/:provider/callback", async (req, res) => {
    const providerParam = req.params.provider;
    if (!isSupportedProvider(providerParam)) {
      res.status(404).json({ error: "Unknown provider." });
      return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    if (providerParam === "google-calendar") {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const state = typeof req.query.state === "string" ? req.query.state : null;
      if (!code || !state) {
        res.status(400).json({ error: "Google callback requires code and state." });
        return;
      }

      try {
        const parsedState = parseGoogleOAuthState(state);
        if (parsedState.userId !== user.id) {
          throw new Error("Google OAuth state did not match the authenticated user.");
        }

        const result = await connectGoogleCalendar({
          userId: user.id,
          code,
          redirectUri: getGoogleCalendarCallbackUrl(req),
        });

        res.redirect(302, `/?integration=google-calendar&status=connected&account=${encodeURIComponent(result.accountLabel)}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
        await upsertProviderConnection({
          userId: user.id,
          provider: "google-calendar",
          status: "error",
          lastError: message,
        });
        res.redirect(302, `/?integration=google-calendar&status=error&message=${encodeURIComponent(message)}`);
        return;
      }
    }

    if (providerParam === "spotify") {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const state = typeof req.query.state === "string" ? req.query.state : null;
      if (!code || !state) {
        res.status(400).json({ error: "Spotify callback requires code and state." });
        return;
      }

      try {
        const parsedState = parseSpotifyOAuthState(state);
        if (parsedState.userId !== user.id) {
          throw new Error("Spotify OAuth state did not match the authenticated user.");
        }

        const result = await connectSpotify({
          userId: user.id,
          code,
          redirectUri: getSpotifyCallbackUrl(req),
        });

        res.redirect(302, `/?integration=spotify&status=connected&account=${encodeURIComponent(result.externalAccountLabel)}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Spotify connection failed.";
        await upsertProviderConnection({
          userId: user.id,
          provider: "spotify",
          status: "error",
          lastError: message,
        });
        res.redirect(302, `/?integration=spotify&status=error&message=${encodeURIComponent(message)}`);
        return;
      }
    }

    res.status(501).json({
      provider: providerParam,
      status: "error",
      message: "Provider callback is not implemented yet.",
    });
  });
}
