import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { captureServerException, initServerSentry } from "./lib/sentry.js";
import { resolveStripeMonthlyPriceId, resolveStripeSecretKey } from "./lib/stripe.js";

initServerSentry();

function getAppOrigin(req: VercelRequest) {
  const configured = process.env.INTEGRATION_BROWSER_BASE || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
}

function getCookieNames(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map(part => part.trim().split("=")[0])
    .filter(Boolean);
}

async function createCheckoutSession(params: {
  userId: number;
  email?: string | null;
  origin: string;
  promoCode?: string | null;
}) {
  const secret = resolveStripeSecretKey();
  const priceId = resolveStripeMonthlyPriceId();

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
    client_reference_id: String(params.userId),
    success_url: `${params.origin}/settings?billing=success`,
    cancel_url: `${params.origin}/settings?billing=cancelled`,
    "metadata[userId]": String(params.userId),
    "subscription_data[metadata][userId]": String(params.userId),
  });

  if (params.email) {
    body.set("customer_email", params.email);
  }

  const normalizedPromo = params.promoCode?.trim().toUpperCase() ?? "";
  if (normalizedPromo) {
    const promoLookup = await fetch(
      `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(normalizedPromo)}&active=true&limit=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      }
    );
    const promoPayload = await promoLookup.json() as { data?: Array<{ id: string }> };
    const promoId = promoPayload.data?.[0]?.id;
    if (!promoLookup.ok || !promoId) {
      throw new Error(`Promo code "${normalizedPromo}" is invalid or inactive.`);
    }
    body.set("discounts[0][promotion_code]", promoId);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || "Stripe Checkout session failed");
  }

  return { url: payload.url, priceId };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = (typeof req.body === "object" && req.body) ? req.body : {};
    const promoCode = typeof body.promoCode === "string" ? body.promoCode : null;
    const user = await sdk.authenticateRequest(req);
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      origin: getAppOrigin(req),
      promoCode,
    });
    return res.status(200).json(session);
  } catch (err: any) {
    if ((err?.message ?? String(err)).includes("Invalid session cookie")) {
      captureServerException(err, {
        tags: { route: "api/stripe-checkout", kind: "auth" },
        extra: { cookieNames: getCookieNames(req) },
      });
      console.warn("[Billing] Checkout auth failed", {
        reason: err?.message ?? String(err),
        cookieNames: getCookieNames(req),
      });
      return res.status(401).json({
        error: "Please sign in again before upgrading.",
        code: "AUTH_REQUIRED",
      });
    }
    captureServerException(err, {
      tags: { route: "api/stripe-checkout" },
      extra: { method: req.method },
    });
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
