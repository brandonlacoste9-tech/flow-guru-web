import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { getSubscriptionStatus } from "./lib/db.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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
      plan: isPro ? "pro" : "free",
      isPro,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  } catch {
    return res.status(200).json({
      plan: "free",
      isPro: false,
      status: "free",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }
}
