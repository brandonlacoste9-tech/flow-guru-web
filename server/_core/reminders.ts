import { getDb } from '../db';
import * as schema from '../../api/lib/drizzle/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { sendPushNotification } from './push';

const firedReminders = new Set<string>();

export async function checkAllReminders() {
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    const todayKey = now.toDateString();

    // 1. Get all memory profiles with wake-up times
    const profiles = await db.select().from(schema.userMemoryProfiles);

    for (const profile of profiles) {
      if (!profile.wakeUpTime) continue;

      const [wh, wm] = profile.wakeUpTime.split(':').map(Number);
      if (hh === wh && mm === wm) {
        const key = `wakeup-${profile.userId}-${todayKey}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          const user = await db.select().from(schema.users).where(eq(schema.users.id, profile.userId)).limit(1);
          const name = user[0]?.name || 'Brandon';
          
          await sendPushNotification(profile.userId, {
            title: '☀️ Good Morning!',
            body: `It's ${profile.wakeUpTime} — time to rise and shine, ${name}!`,
            tag: key,
            alarmSound: profile.alarmSound || 'chime',
          });
        }
      }
    }

    // 2. Check for local calendar events starting soon
    const upcomingEvents = await db.select().from(schema.localEvents).where(
      and(
        gte(schema.localEvents.startAt, new Date(now.getTime())),
        lte(schema.localEvents.startAt, new Date(now.getTime() + 60 * 60 * 1000)) // next 1 hour
      )
    );

    for (const event of upcomingEvents) {
      const diffMins = Math.round((event.startAt.getTime() - now.getTime()) / 60000);
      const reminderList = event.reminderMinutes ? event.reminderMinutes.split(',').map(Number) : [30, 15, 5];

      for (const mins of reminderList) {
        if (diffMins === mins) {
          const key = `event-${mins}-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            await sendPushNotification(event.userId, {
              title: `⏰ ${event.title}`,
              body: `Starts in ${mins} minutes!`,
              tag: key,
              alarmSound: 'chime',
            });
          }
        }
      }

      // Exact start
      if (diffMins === 0) {
        const key = `event-now-${event.id}-${todayKey}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          await sendPushNotification(event.userId, {
            title: `🚀 ${event.title}`,
            body: `Starting right now!`,
            tag: key,
            alarmSound: 'chime',
          });
        }
      }
    }

    // 3. Check for list item reminders
    const listReminders = await db.select({
      item: schema.listItems,
      list: schema.lists
    })
    .from(schema.listItems)
    .innerJoin(schema.lists, eq(schema.listItems.listId, schema.lists.id))
    .where(
      and(
        eq(schema.listItems.completed, 0),
        gte(schema.listItems.reminderAt, new Date(now.getTime() - 60000)),
        lte(schema.listItems.reminderAt, now)
      )
    );

    for (const { item, list } of listReminders) {
      const key = `list-remind-${item.id}-${todayKey}`;
      if (!firedReminders.has(key)) {
        firedReminders.add(key);
        await sendPushNotification(item.userId, {
          title: `📝 List Reminder: ${list.name}`,
          body: `Don't forget to ${item.content}!`,
          tag: key,
          alarmSound: 'chime',
        });
      }
    }
  } catch (error) {
    console.error('[Reminders] Background check failed:', error);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

export function startBackgroundReminders() {
  if (reminderInterval) return;
  console.log('[Reminders] Starting background checker...');
  
  // Run once immediately
  checkAllReminders();
  
  // Align to top of minute
  const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  
  setTimeout(() => {
    checkAllReminders();
    reminderInterval = setInterval(checkAllReminders, 60000);
  }, msToNextMinute);
}
