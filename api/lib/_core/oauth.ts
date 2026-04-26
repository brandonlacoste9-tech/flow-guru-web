import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: VercelRequest, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: any, res: any) => {
    const vReq = req as VercelRequest;
    const vRes = res as VercelResponse;
    const code = getQueryParam(vReq, "code");
    const state = getQueryParam(vReq, "state");

    if (!code || !state) {
      vRes.status(400).json({ error: "code and state are required" } as any);
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        vRes.status(400).json({ error: "openId missing from user info" } as any);
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(vReq as any);
      (vRes as any).cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      vRes.redirect("/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      vRes.status(500).json({ error: "OAuth callback failed" } as any);
    }
  });
}
