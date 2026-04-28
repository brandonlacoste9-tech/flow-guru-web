import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { COOKIE_NAME, ONE_YEAR_MS } from "./lib/shared/const.js";
import { ENV } from "./lib/_core/env.js";
import { sdk } from "./lib/_core/sdk.js";
import * as db from "./lib/db.js";

const scryptAsync = promisify(scrypt);

// Hash a password using Node.js built-in scrypt (no external deps)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Verify a password against a stored hash
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(hash, "hex");
  if (derivedKey.length !== storedBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

function buildSetCookieHeader(name: string, value: string, maxAgeMs: number, secure: boolean): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  // Same-site app auth is more reliable with Lax than None; None can be rejected if Secure handling is inconsistent.
  let cookie = `${name}=${value}; Max-Age=${maxAgeSec}; Expires=${expires}; Path=/; HttpOnly; SameSite=Lax`;
  if (secure || ENV.isProduction) cookie += "; Secure";
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

function getAllowedPromoCodes(): Set<string> {
  const configured = process.env.FG_LOGIN_PROMO_CODES || process.env.PROMO_CODES || "GURU1976";
  return new Set(
    configured
      .split(",")
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean)
  );
}

function getOwnerPromoEmails(): Set<string> {
  const configured = process.env.FG_OWNER_PROMO_EMAILS || "";
  return new Set(
    configured
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function canUsePromoPasswordRecovery(email: string, promoCodeRaw: string | null | undefined): boolean {
  const promoCode = promoCodeRaw?.trim().toUpperCase();
  if (!promoCode) return false;
  if (!getAllowedPromoCodes().has(promoCode)) return false;
  const ownerEmails = getOwnerPromoEmails();
  return ownerEmails.size === 0 || ownerEmails.has(email.toLowerCase());
}

async function applyPromoEntitlement(userId: number, promoCodeRaw: string | null | undefined) {
  const promoCode = promoCodeRaw?.trim().toUpperCase();
  if (!promoCode) return false;
  if (!getAllowedPromoCodes().has(promoCode)) return false;

  const existing = await db.getSubscriptionStatus(userId);
  if (existing.status === "active") {
    // Paid users keep their active billing state.
    return true;
  }

  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await db.upsertSubscriptionStatus({
    userId,
    status: "trialing",
    currentPeriodEnd: oneYear,
    cancelAtPeriodEnd: false,
    stripePriceId: `promo:${promoCode}`,
  });
  return true;
}

async function tryApplyPromoEntitlement(userId: number, promoCodeRaw: string | null | undefined): Promise<boolean> {
  try {
    return await applyPromoEntitlement(userId, promoCodeRaw);
  } catch (err: any) {
    console.warn("[EmailAuth] Promo entitlement skipped:", err?.message ?? String(err));
    return false;
  }
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
      const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
      const normalizedPassword = typeof password === "string" ? password : "";
      if (!normalizedEmail || !normalizedPassword) {
        return json(res, 400, { error: "Email and password are required." });
      }
      if (normalizedPassword.length < 8) {
        return json(res, 400, { error: "Password must be at least 8 characters." });
      }
      const existing = await db.getUserByEmail(normalizedEmail);
      const normalizedPromoCode = typeof promoCode === "string" ? promoCode.trim().toUpperCase() : "";
      const promoCanOverrideExistingPassword = canUsePromoPasswordRecovery(normalizedEmail, normalizedPromoCode);
      if (existing && existing.passwordHash && !promoCanOverrideExistingPassword) {
        return json(res, 409, {
          error: "An account with this email already exists. Sign in or use password reset.",
        });
      }
      const passwordHash = await hashPassword(normalizedPassword);
      const inferredName = (typeof name === "string" && name.trim())
        ? name.trim()
        : normalizedEmail.split("@")[0];
      const upsertPayload = existing
        ? {
            ...existing,
            name: existing.name || inferredName,
            loginMethod: "email",
            passwordHash,
            promoCode: promoCode?.trim() || existing.promoCode || null,
            lastSignedIn: new Date(),
          }
        : {
            openId: `email_${randomBytes(12).toString("hex")}`,
            name: inferredName,
            email: normalizedEmail,
            loginMethod: "email",
            passwordHash,
            promoCode: promoCode?.trim() || null,
            lastSignedIn: new Date(),
          };
      await db.upsertUser(upsertPayload);
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user) return json(res, 500, { error: "Failed to create account." });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieHeader = buildSetCookieHeader(COOKIE_NAME, sessionToken, ONE_YEAR_MS, isSecure(req));
      res.setHeader("Set-Cookie", cookieHeader);
      const promoApplied = await tryApplyPromoEntitlement(user.id, promoCode);
      return json(res, 200, { ok: true, name: user.name, promoApplied });
    }

    if (action === "login") {
      const { email, password, promoCode } = req.body || {};
      const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
      const normalizedPassword = typeof password === "string" ? password : "";
      if (!normalizedEmail || !normalizedPassword) {
        return json(res, 400, { error: "Email and password are required." });
      }
      const user = await db.getUserByEmail(normalizedEmail);
      if (!user) {
        return json(res, 401, { error: "Invalid email or password." });
      }
      if (!user.passwordHash) {
        return json(res, 401, {
          error: "This account does not have an email password yet. Use sign up with this email to set one.",
        });
      }
      const valid = await verifyPassword(normalizedPassword, user.passwordHash);
      if (!valid) {
        if (!canUsePromoPasswordRecovery(normalizedEmail, promoCode)) {
          return json(res, 401, { error: "Invalid email or password." });
        }
        const recoveredHash = await hashPassword(normalizedPassword);
        await db.upsertUser({
          ...user,
          passwordHash: recoveredHash,
          loginMethod: "email",
          promoCode: typeof promoCode === "string" && promoCode.trim() ? promoCode.trim() : user.promoCode || null,
          lastSignedIn: new Date(),
        });
      }
      await db.upsertUser({ ...user, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || email.split("@")[0],
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieHeader = buildSetCookieHeader(COOKIE_NAME, sessionToken, ONE_YEAR_MS, isSecure(req));
      res.setHeader("Set-Cookie", cookieHeader);
      const promoApplied = await tryApplyPromoEntitlement(user.id, promoCode);
      return json(res, 200, { ok: true, name: user.name, promoApplied });
    }

    if (action === "forgot-password") {
      const { email } = req.body || {};
      if (!email) return json(res, 400, { error: "Email is required." });
      const user = await db.getUserByEmail(email);
      // Always return success to prevent email enumeration
      if (!user) return json(res, 200, { ok: true });

      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.upsertUser({ ...user, resetToken, resetTokenExpiresAt: expiresAt });

      // TODO: Send email with reset link
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

      const passwordHash = await hashPassword(password);
      await db.upsertUser({ ...user, passwordHash, resetToken: null, resetTokenExpiresAt: null });

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Unknown action." });
  } catch (err: any) {
    console.error("[EmailAuth] Error:", err);
    return json(res, 500, { error: "Internal server error.", detail: String(err?.message || err) });
  }
}
