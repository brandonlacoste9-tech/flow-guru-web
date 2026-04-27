import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { recordStripeEvent, upsertSubscriptionStatus } from "./lib/db.js";

function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secret);
}

async function readRawBody(req: VercelRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function constructStripeEvent(rawBody: string, signatureHeader: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature");
  }

  return getStripe().webhooks.constructEvent(rawBody, signatureHeader, secret);
}

async function stripeGet(path: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const payload = await response.json() as any;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Stripe API request failed");
  }
  return payload;
}

function subscriptionToStatus(subscription: any) {
  const userId = Number(subscription.metadata?.userId);
  if (!Number.isFinite(userId)) {
    console.warn("[Stripe] Subscription missing metadata.userId; skipping sync", subscription.id);
    return null;
  }

  return {
    userId,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items?.data?.[0]?.price?.id ?? null,
    status: subscription.status ?? "incomplete",
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };
}

async function syncSubscription(subscriptionId: string) {
  const subscription = await stripeGet(`/subscriptions/${subscriptionId}`);
  const status = subscriptionToStatus(subscription);
  if (status) await upsertSubscriptionStatus(status);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const rawBody = await readRawBody(req);
    const event = constructStripeEvent(rawBody, req.headers["stripe-signature"] as string | undefined);

    const object = event.data?.object as any;
    if (event.type === "checkout.session.completed" && object?.subscription) {
      const subscriptionId =
        typeof object.subscription === "string"
          ? object.subscription
          : object.subscription.id;
      await syncSubscription(subscriptionId);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const status = subscriptionToStatus(object);
      if (status) await upsertSubscriptionStatus(status);
    }

    const isNewEvent = await recordStripeEvent(event.id, event.type);
    if (!isNewEvent) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[Stripe] Webhook failed:", err);
    return res.status(400).json({ error: err?.message ?? String(err) });
  }
}
