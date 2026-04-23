import { useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { usePushNotifications } from './usePushNotifications';
import { playAlarmSound, type AlarmSoundType } from './useAlarmSound';

interface UseRemindersOptions {
  enabled: boolean;
  userName: string;
  wakeUpTime?: string | null; // "HH:MM" format
  speakText: (text: string) => void;
  voiceGender: 'male' | 'female';
  alarmSound?: AlarmSoundType;
}

// Track which reminders have already fired this session to avoid repeats
const firedReminders = new Set<string>();
// Track which push notifications have already been scheduled this session
const scheduledPushes = new Set<string>();

function getMinutesUntil(targetHour: number, targetMin: number, now: Date): number {
  const target = new Date(now);
  target.setHours(targetHour, targetMin, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // next day if already passed
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export function useReminders({ enabled, userName, wakeUpTime, speakText, voiceGender, alarmSound = 'chime' }: UseRemindersOptions) {
  const alarmSoundRef = useRef(alarmSound);
  alarmSoundRef.current = alarmSound;
  const utils = trpc.useUtils();
  const speakRef = useRef(speakText);
  speakRef.current = speakText;
  const { permission, requestPermission, scheduleReminder } = usePushNotifications();

  // Request notification permission once when reminders are enabled
  useEffect(() => {
    if (enabled && permission === 'default') {
      requestPermission();
    }
  }, [enabled, permission, requestPermission]);

  // Pre-schedule today's push notifications for upcoming events (runs once per session)
  const preSchedulePushes = useCallback(async () => {
    if (!enabled || permission !== 'granted') return;
    const now = new Date();
    const endAt = new Date(now);
    endAt.setHours(23, 59, 59, 999);

    try {
      const events = await utils.calendar.list.fetch({
        startAt: now.toISOString(),
        endAt: endAt.toISOString(),
      });

      for (const event of events) {
        if (!event.startAt) continue;
        const eventStart = new Date(event.startAt);
        const todayKey = now.toDateString();

        // Schedule 15-min push
        const fire15 = new Date(eventStart.getTime() - 15 * 60000);
        const key15 = `push-15-${event.id}-${todayKey}`;
        if (!scheduledPushes.has(key15) && fire15 > now) {
          scheduledPushes.add(key15);
          scheduleReminder({
            title: `⏰ ${event.title}`,
            body: `Starts in 15 minutes`,
            fireAt: fire15,
            tag: key15,
          });
        }

        // Schedule 5-min push
        const fire5 = new Date(eventStart.getTime() - 5 * 60000);
        const key5 = `push-5-${event.id}-${todayKey}`;
        if (!scheduledPushes.has(key5) && fire5 > now) {
          scheduledPushes.add(key5);
          scheduleReminder({
            title: `🔔 ${event.title}`,
            body: `Starting in 5 minutes!`,
            fireAt: fire5,
            tag: key5,
          });
        }

        // Schedule exact-time push
        const keyNow = `push-now-${event.id}-${todayKey}`;
        if (!scheduledPushes.has(keyNow) && eventStart > now) {
          scheduledPushes.add(keyNow);
          scheduleReminder({
            title: `🚀 ${event.title}`,
            body: `Starting right now!`,
            fireAt: eventStart,
            tag: keyNow,
          });
        }
      }

      // Schedule wake-up push
      if (wakeUpTime) {
        const [wh, wm] = wakeUpTime.split(':').map(Number);
        if (!isNaN(wh) && !isNaN(wm)) {
          const wakeDate = new Date(now);
          wakeDate.setHours(wh, wm, 0, 0);
          if (wakeDate <= now) wakeDate.setDate(wakeDate.getDate() + 1);
          const wakeKey = `push-wakeup-${wakeDate.toDateString()}`;
          if (!scheduledPushes.has(wakeKey)) {
            scheduledPushes.add(wakeKey);
            scheduleReminder({
              title: '☀️ Good Morning!',
              body: `It's ${wakeUpTime} — time to rise and shine!`,
              fireAt: wakeDate,
              tag: wakeKey,
            });
          }
        }
      }
    } catch {
      // Silent fail
    }
  }, [enabled, permission, wakeUpTime, utils, scheduleReminder]);

  const checkReminders = useCallback(async () => {
    if (!enabled) return;

    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    const todayKey = now.toDateString();

    // ── Wake-up reminder ──
    if (wakeUpTime) {
      const [wh, wm] = wakeUpTime.split(':').map(Number);
      if (!isNaN(wh) && !isNaN(wm) && hh === wh && mm === wm) {
        const key = `wakeup-${todayKey}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          const msg = `Good morning, ${userName}! It's ${wakeUpTime} — time to rise and shine. Let's make today incredible!`;
          toast.success('Good morning! ☀️', { description: `Wake-up reminder — ${wakeUpTime}` });
          playAlarmSound(alarmSoundRef.current, 30000);
          setTimeout(() => speakRef.current(msg), alarmSoundRef.current === 'chime' ? 3500 : 1000);
        }
      }
    }

    // ── Calendar event reminders ──
    try {
      const startAt = new Date(now);
      startAt.setSeconds(0, 0);
      const endAt = new Date(now);
      endAt.setHours(23, 59, 59, 999);

      const events = await utils.calendar.list.fetch({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });

      for (const event of events) {
        if (!event.startAt) continue;
        const eventStart = new Date(event.startAt);
        const diffMins = Math.round((eventStart.getTime() - now.getTime()) / 60000);

        // Fire at 15 minutes before
        if (diffMins === 15) {
          const key = `event-15-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const timeStr = eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const msg = `Hey ${userName}, heads up — ${event.title} starts in 15 minutes at ${timeStr}. Get ready!`;
            toast.info(`⏰ ${event.title}`, { description: `Starts in 15 minutes at ${timeStr}` });
            playAlarmSound(alarmSoundRef.current, 8000);
            setTimeout(() => speakRef.current(msg), alarmSoundRef.current === 'chime' ? 3500 : 1000);
          }
        }

        // Fire at 5 minutes before
        if (diffMins === 5) {
          const key = `event-5-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const timeStr = eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const msg = `${userName}, ${event.title} is starting in just 5 minutes. You're on!`;
            toast.warning(`🔔 ${event.title}`, { description: `Starting in 5 minutes!` });
            playAlarmSound(alarmSoundRef.current, 8000);
            setTimeout(() => speakRef.current(msg), alarmSoundRef.current === 'chime' ? 3500 : 1000);
          }
        }

        // Fire at the exact start time
        if (diffMins === 0) {
          const key = `event-now-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const msg = `${userName}, it's time — ${event.title} is starting right now. Go get it!`;
            toast.error(`🚀 ${event.title}`, { description: `Starting now!` });
            playAlarmSound(alarmSoundRef.current, 30000);
            setTimeout(() => speakRef.current(msg), alarmSoundRef.current === 'chime' ? 3500 : 1000);
          }
        }
      }
    } catch {
      // Silent fail — reminders are best-effort
    }
  }, [enabled, userName, wakeUpTime, utils]);

  useEffect(() => {
    if (!enabled) return;

    // Pre-schedule push notifications for today's events
    preSchedulePushes();

    // Check immediately on mount
    checkReminders();

    // Then check every minute, aligned to the top of each minute
    const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
    let interval: ReturnType<typeof setInterval>;

    const timeout = setTimeout(() => {
      checkReminders();
      interval = setInterval(checkReminders, 60000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [enabled, checkReminders, preSchedulePushes]);
}
