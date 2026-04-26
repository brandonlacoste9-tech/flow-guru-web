import express, { Express } from "express";
import Stripe from "stripe";
import { getDb } from "../../api/lib/db";
import { subscriptions, users, stripeEvents } from "../../api/lib/drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20" as any,
});

export function registerStripeRoutes(app: Express) {
  // 1. Create Checkout Session
  app.post("/api/stripe/create-checkout", express.json(), async (req, res) => {
    try {
      const { userId, plan = "premium" } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user[0]) return res.status(404).json({ error: "User not found" });

      const lineItems = process.env.STRIPE_PRICE_ID 
        ? [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }]
        : [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Flow Guru Premium",
                  description: "Full access to autonomous orchestration, private memory, and priority support.",
                },
                unit_amount: 500, // $5.00
                recurring: { interval: "month" },
              },
              quantity: 1,
            },
          ];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "subscription",
        success_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/settings?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/settings`,
        customer_email: user[0].email || undefined,
        metadata: {
          userId: userId.toString(),
          plan,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe Checkout Error]", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // 2. Create Customer Portal Session
  app.post("/api/stripe/create-portal", express.json(), async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const sub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      if (!sub[0] || !sub[0].stripeCustomerId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: sub[0].stripeCustomerId,
        return_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/settings`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("[Stripe Portal Error]", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // 3. Webhook Handler
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
      } else if (process.env.NODE_ENV !== 'production') {
        // Only allow fallback in development
        event = JSON.parse(req.body.toString());
      } else {
        throw new Error("Missing Stripe signature or webhook secret in production.");
      }
    } catch (err: any) {
      console.error(`[Stripe Webhook] Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = await getDb();
    if (!db) return res.status(503).send("DB Unavailable");

    // Idempotency: Check if event was already processed
    const existingEvent = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, event.id)).limit(1);
    if (existingEvent[0]) {
      return res.json({ received: true, already_processed: true });
    }

    // Handle the event
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = parseInt(session.metadata?.userId || "0");
          const stripeCustomerId = session.customer as string;
          const stripeSubscriptionId = session.subscription as string;
          const plan = session.metadata?.plan || "premium";

          if (userId) {
            await db.insert(subscriptions).values({
              userId,
              stripeCustomerId,
              stripeSubscriptionId,
              status: "active",
              plan,
              updatedAt: new Date(),
            }).onConflictDoUpdate({
              target: subscriptions.userId,
              set: {
                stripeCustomerId,
                stripeSubscriptionId,
                status: "active",
                plan,
                updatedAt: new Date(),
              },
            });
            console.log(`[Stripe] Subscription activated for user ${userId}`);
          }
          break;
        }
        
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await db.update(subscriptions)
            .set({ status: "canceled", updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
          console.log(`[Stripe] Subscription deleted: ${subscription.id}`);
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await db.update(subscriptions)
            .set({ 
              status: subscription.status, 
              updatedAt: new Date() 
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
          console.log(`[Stripe] Subscription updated: ${subscription.id} status: ${subscription.status}`);
          break;
        }
      }

      // Record event as processed
      await db.insert(stripeEvents).values({
        eventId: event.id,
        type: event.type,
      });

    } catch (err: any) {
      console.error(`[Stripe Webhook Handler Error] ${err.message}`);
      return res.status(500).send("Internal processing error");
    }

    res.json({ received: true });
  });
}
