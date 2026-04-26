import webpush from 'web-push';
import { ENV } from './env.js';
import { getDb } from '../db.js';
import { pushSubscriptions } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';

// Configure VAPID keys
if (ENV.vapidPublicKey && ENV.vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:support@floguru.com',
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
}

export async function sendPushNotification(userId: number, payload: { title: string; body: string; tag?: string; alarmSound?: string }) {
  const db = await getDb();
  if (!db) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  
  if (subs.length === 0) return;

  const promises = subs.map(async (sub: any) => {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify({
          ...payload,
          url: '/',
        })
      );
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        // Subscription has expired or is no longer valid
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.error('[Push] Error sending notification:', error);
      }
    }
  });

  await Promise.allSettled(promises);
}
