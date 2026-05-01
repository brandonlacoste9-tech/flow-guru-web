import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getSubscriptionStatus } from "./lib/db.js";
import { captureServerException, initServerSentry } from "./lib/sentry.js";

initServerSentry();

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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

async function createPortalSession(params: {
  stripeCustomerId: string;
  origin: string;
}) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const body = new URLSearchParams({
    customer: params.stripeCustomerId,
    return_url: `${params.origin}/settings?tab=billing`,
  });

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || "Stripe Billing Portal session failed");
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
    const subscription = await getSubscriptionStatus(user.id);

    if (!ACTIVE_STATUSES.has(subscription.status) || !subscription.stripeCustomerId) {
      return res.status(404).json({
        error: "No active Flow Guru Monthly subscription found.",
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    }

    const url = await createPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      origin: getAppOrigin(req),
    });

    return res.status(200).json({ url });
  } catch (err: any) {
    if ((err?.message ?? String(err)).includes("Invalid session cookie")) {
      captureServerException(err, {
        tags: { route: "api/billing-portal", kind: "auth" },
        extra: { cookieNames: getCookieNames(req) },
      });
      return res.status(401).json({
        error: "Please sign in again to manage billing.",
        code: "AUTH_REQUIRED",
      });
    }

    captureServerException(err, {
      tags: { route: "api/billing-portal" },
      extra: { method: req.method },
    });
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
