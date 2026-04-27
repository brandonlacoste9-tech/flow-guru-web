import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { recordStripeEvent, upsertSubscriptionStatus } from "./lib/db.js";

async function readRawBody(req: VercelRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature");
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map(part => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    throw new Error("Invalid Stripe signature header");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Stripe signature verification failed");
  }
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
    throw new Error("Stripe subscription is missing metadata.userId");
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
  await upsertSubscriptionStatus(subscriptionToStatus(subscription));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const rawBody = await readRawBody(req);
    verifyStripeSignature(rawBody, req.headers["stripe-signature"] as string | undefined);

    const event = JSON.parse(rawBody);
    const isNewEvent = await recordStripeEvent(event.id, event.type);
    if (!isNewEvent) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const object = event.data?.object;
    if (event.type === "checkout.session.completed" && object?.subscription) {
      await syncSubscription(object.subscription);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertSubscriptionStatus(subscriptionToStatus(object));
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[Stripe] Webhook failed:", err);
    return res.status(400).json({ error: err?.message ?? String(err) });
  }
}
