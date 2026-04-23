import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "./lib/shared/const.js";
import { ENV } from "./lib/_core/env.js";
import { sdk } from "./lib/_core/sdk.js";
import * as db from "./lib/db.js";

function buildSetCookieHeader(name: string, value: string, maxAgeMs: number, secure: boolean): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  let cookie = `${name}=${value}; Max-Age=${maxAgeSec}; Expires=${expires}; Path=/; HttpOnly; SameSite=None`;
  if (secure) cookie += "; Secure";
  return cookie;
}

function isSecure(req: VercelRequest): boolean {
  const forwarded = req.headers["x-forwarded-proto"] as string | undefined;
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  return false;
}

function json(res: VercelResponse, status: number, data: object) {
  res.status(status).json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS for same-origin fetch
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const action = req.query.action as string;

  try {
    if (action === "register") {
      const { email, password, name, promoCode } = req.body || {};
      if (!email || !password || !name) {
        return json(res, 400, { error: "Name, email and password are required." });
      }
      if (password.length < 8) {
        return json(res, 400, { error: "Password must be at least 8 characters." });
      }
      const existing = await db.getUserByEmail(email);
      if (existing) {
        return json(res, 409, { error: "An account with this email already exists." });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const openId = `email_${crypto.randomBytes(12).toString("hex")}`;
      await db.upsertUser({
        openId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        loginMethod: "email",
        passwordHash,
        promoCode: promoCode?.trim() || null,
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByEmail(email);
      if (!user) return json(res, 500, { error: "Failed to create account." });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieHeader = buildSetCookieHeader(COOKIE_NAME, sessionToken, ONE_YEAR_MS, isSecure(req));
      res.setHeader("Set-Cookie", cookieHeader);
      return json(res, 200, { ok: true, name: user.name });
    }

    if (action === "login") {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return json(res, 400, { error: "Email and password are required." });
      }
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return json(res, 401, { error: "Invalid email or password." });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return json(res, 401, { error: "Invalid email or password." });
      }
      await db.upsertUser({ ...user, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieHeader = buildSetCookieHeader(COOKIE_NAME, sessionToken, ONE_YEAR_MS, isSecure(req));
      res.setHeader("Set-Cookie", cookieHeader);
      return json(res, 200, { ok: true, name: user.name });
    }

    if (action === "forgot-password") {
      const { email } = req.body || {};
      if (!email) return json(res, 400, { error: "Email is required." });
      const user = await db.getUserByEmail(email);
      // Always return success to prevent email enumeration
      if (!user) return json(res, 200, { ok: true });

      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.upsertUser({ ...user, resetToken, resetTokenExpiresAt: expiresAt });

      // TODO: Send email with reset link
      // For now, return the token in dev mode or log it
      const resetUrl = `https://floguru.com/?reset_token=${resetToken}`;
      console.log(`[Auth] Password reset for ${email}: ${resetUrl}`);

      return json(res, 200, { ok: true, resetUrl: ENV.isProduction ? undefined : resetUrl });
    }

    if (action === "reset-password") {
      const { token, password } = req.body || {};
      if (!token || !password) return json(res, 400, { error: "Token and password are required." });
      if (password.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });

      const user = await db.getUserByResetToken(token);
      if (!user) return json(res, 400, { error: "Invalid or expired reset link." });

      const passwordHash = await bcrypt.hash(password, 12);
      await db.upsertUser({ ...user, passwordHash, resetToken: null, resetTokenExpiresAt: null });

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Unknown action." });
  } catch (err: any) {
    console.error("[EmailAuth] Error:", err);
    return json(res, 500, { error: "Internal server error." });
  }
}
