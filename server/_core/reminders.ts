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
          const userName = user[0]?.name || 'Brandon';
          
          // Generate a more proactive briefing
          let briefingBody = `It's ${profile.wakeUpTime} — time to rise and shine, ${userName}!`;
          try {
            const { buildBriefingData } = await import('./briefing');
            const { listUserMemoryFacts } = await import('../db');
            
            const memoryFacts = await listUserMemoryFacts(profile.userId);
            const locationFact = memoryFacts.find(
              (f: any) => f.factKey === "location" || f.factKey === "city" || f.factKey === "home_location"
            );
            
            const briefing = await buildBriefingData({
              userId: profile.userId,
              userName,
              assistantName: 'Flow Guru',
              location: locationFact?.factValue,
              buddyPersonality: profile.buddyPersonality,
            });
            
            if (briefing.script) {
              briefingBody = briefing.script;
            }
          } catch (e) {
            console.error('[Reminders] Briefing generation failed, using fallback:', e);
          }
          
          await sendPushNotification(profile.userId, {
            title: '☀️ Morning Briefing',
            body: briefingBody,
            tag: key,
            alarmSound: profile.alarmSound || 'chime',
            data: {
              type: 'morning_briefing',
              userId: profile.userId,
            }
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
    // 4. Periodically check for proactive nudges (every 30 minutes)
    if (mm % 30 === 0) {
      await checkProactiveNudges(db);
    }
  } catch (error) {
    console.error('[Reminders] Background check failed:', error);
  }
}

async function checkProactiveNudges(db: any) {
  try {
    const { CommunicationAgent } = await import('./sub-agents/communication.js');
    const { getUserMemoryProfile, listUserMemoryFacts, listLocalEvents, listUserLists, getListItems } = await import('../db.js');
    
    const commAgent = new CommunicationAgent();
    const profiles = await db.select().from(schema.userMemoryProfiles);

    for (const profile of profiles) {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const [events, lists, memoryFacts, user] = await Promise.all([
        listLocalEvents(profile.userId, now, endOfDay),
        listUserLists(profile.userId),
        listUserMemoryFacts(profile.userId),
        db.select().from(schema.users).where(eq(schema.users.id, profile.userId)).limit(1)
      ]);

      const listState = await Promise.all(lists.map(async (l: any) => ({
        name: l.name,
        items: (await getListItems(profile.userId, l.id)).filter((i: any) => !i.completed).map((i: any) => i.content)
      })));

      const locationFact = memoryFacts.find((f: any) => f.factKey === "location" || f.factKey === "city");
      
      await commAgent.generateProactiveNudge({
        userId: profile.userId,
        userName: user[0]?.name || 'Brandon',
        memoryContext: `Location: ${locationFact?.factValue || 'Unknown'}`,
        language: 'en'
      }, {
        events: events.map((e: any) => ({ title: e.title, start: e.startAt, end: e.endAt })),
        lists: listState
      });
    }
  } catch (error) {
    console.error('[Reminders] Proactive nudge check failed:', error);
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
