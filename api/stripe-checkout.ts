import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";

const FLOW_GURU_PRICE_ID =
  process.env.FLOW_GURU_MONTHLY_PRICE_ID ||
  process.env.STRIPE_FLOW_GURU_MONTHLY_PRICE_ID ||
  process.env.STRIPE_PRICE_ID_MONTHLY;

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
}) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!FLOW_GURU_PRICE_ID) {
    throw new Error("FLOW_GURU_MONTHLY_PRICE_ID is not configured");
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": FLOW_GURU_PRICE_ID,
    "line_items[0][quantity]": "1",
    client_reference_id: String(params.userId),
    success_url: `${params.origin}/settings?billing=success`,
    cancel_url: `${params.origin}/settings?billing=cancelled`,
    "metadata[userId]": String(params.userId),
    "subscription_data[metadata][userId]": String(params.userId),
  });

  if (params.email) {
    body.set("customer_email", params.email);
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

  return payload.url;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const user = await sdk.authenticateRequest(req);
    const url = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      origin: getAppOrigin(req),
    });
    return res.status(200).json({ url, priceId: FLOW_GURU_PRICE_ID });
  } catch (err: any) {
    if ((err?.message ?? String(err)).includes("Invalid session cookie")) {
      console.warn("[Billing] Checkout auth failed", {
        reason: err?.message ?? String(err),
        cookieNames: getCookieNames(req),
      });
      return res.status(401).json({
        error: "Please sign in again before upgrading.",
        code: "AUTH_REQUIRED",
      });
    }
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
