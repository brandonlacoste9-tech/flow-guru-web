import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getSubscriptionStatus } from "./lib/db.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function getCookieNames(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map(part => part.trim().split("=")[0])
    .filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const user = await sdk.authenticateRequest(req);
    const subscription = await getSubscriptionStatus(user.id);
    const isPro = ACTIVE_STATUSES.has(subscription.status);

    return res.status(200).json({
      authenticated: true,
      plan: isPro ? "pro" : "free",
      isPro,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  } catch (err: any) {
    console.warn("[Billing] Status auth failed", {
      reason: err?.message ?? String(err),
      cookieNames: getCookieNames(req),
    });
    return res.status(200).json({
      authenticated: false,
      plan: "free",
      isPro: false,
      status: "free",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }
}
