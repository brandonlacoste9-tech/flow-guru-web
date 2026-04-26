import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { ENV } from "./env.js";
import { sdk } from "./sdk.js";
import { getProviderConnection, upsertProviderConnection } from "../db.js";
import {
  buildGoogleOAuthState,
  connectGoogleCalendar,
  getGoogleCalendarCallbackUrl,
  parseGoogleOAuthState,
} from "./googleCalendar.js";


type SupportedProvider = "google-calendar";

const PROVIDERS: SupportedProvider[] = ["google-calendar"];

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
    configured: false,
    label: "Unknown",
    scopes: [],
  };
}

async function requireUser(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required." } as any);
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Authentication required." } as any);
    return null;
  }
}

export function registerProviderConnectionRoutes(app: Express) {
  app.get("/api/integrations/:provider/status", async (req: any, res: any) => {
    const vReq = req as VercelRequest;
    const vRes = res as VercelResponse;
    const providerParam = (vReq.query.provider as string) || (vReq as any).params?.provider;
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

  app.get("/api/integrations/:provider/start", async (req: any, res: any) => {
    const vReq = req as VercelRequest;
    const vRes = res as VercelResponse;
    const providerParam = (vReq.query.provider as string) || (vReq as any).params?.provider;
    if (!isSupportedProvider(providerParam)) {
      vRes.status(404).json({ error: "Unknown provider." } as any);
      return;
    }

    const user = await requireUser(vReq, vRes);
    if (!user) return;

    const config = getProviderConfig(providerParam);

    if (!config.configured) {
      await upsertProviderConnection({
        userId: user.id,
        provider: providerParam,
        status: "error",
        lastError: `${config.label} credentials have not been added yet.`,
      });
      vRes.status(503).json({
        provider: providerParam,
        configured: false,
        status: "error",
        message: `${config.label} credentials have not been added yet. Add the provider secrets to activate account linking.`,
        scopes: config.scopes,
      } as any);
      return;
    }

    if (providerParam === "google-calendar") {
      await upsertProviderConnection({
        userId: user.id,
        provider: providerParam,
        status: "pending",
        lastError: null,
      });

      const redirectUri = getGoogleCalendarCallbackUrl(vReq as any);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", ENV.googleClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", buildGoogleOAuthState(user.id));

      vRes.redirect(authUrl.toString());
      return;
    }

    vRes.status(501).json({ error: "Provider not fully implemented." } as any);
  });

  app.get("/api/integrations/:provider/callback", async (req: any, res: any) => {
    const vReq = req as VercelRequest;
    const vRes = res as VercelResponse;
    const providerParam = (vReq.query.provider as string) || (vReq as any).params?.provider;
    if (!isSupportedProvider(providerParam)) {
      vRes.status(404).json({ error: "Unknown provider." } as any);
      return;
    }

    const user = await requireUser(vReq, vRes);
    if (!user) return;

    if (providerParam === "google-calendar") {
      const code = typeof vReq.query.code === "string" ? vReq.query.code : null;
      const state = typeof vReq.query.state === "string" ? vReq.query.state : null;
      if (!code || !state) {
        vRes.status(400).json({ error: "Google callback requires code and state." } as any);
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
          redirectUri: getGoogleCalendarCallbackUrl(vReq as any),
        });

        vRes.redirect(`/?integration=google-calendar&status=connected&account=${encodeURIComponent(result.accountLabel)}`);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
        await upsertProviderConnection({
          userId: user.id,
          provider: "google-calendar",
          status: "error",
          lastError: message,
        });
        vRes.redirect(`/?integration=google-calendar&status=error&message=${encodeURIComponent(message)}`);
        return;
      }
    }

    vRes.status(501).json({ error: "Provider callback not implemented." } as any);
  });
}
