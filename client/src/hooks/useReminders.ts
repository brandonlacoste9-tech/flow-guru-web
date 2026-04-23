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
  alarmDays?: string | null; // comma-separated day indices, 0=Sun..6=Sat, e.g. '1,2,3,4,5'
}

// Track which reminders have already fired today to avoid repeats
const firedReminders = new Set<string>();
const scheduledPushes = new Set<string>();

export function useReminders({ enabled, userName, wakeUpTime, speakText, voiceGender, alarmSound = 'chime', alarmDays }: UseRemindersOptions) {
  // Use refs so the interval callback always reads the latest values (no stale closures)
  const wakeUpTimeRef = useRef(wakeUpTime);
  const alarmSoundRef = useRef(alarmSound);
  const alarmDaysRef = useRef(alarmDays);
  const speakRef = useRef(speakText);
  const userNameRef = useRef(userName);
  const enabledRef = useRef(enabled);

  // Keep refs in sync with props on every render
  wakeUpTimeRef.current = wakeUpTime ?? null;
  alarmSoundRef.current = alarmSound;
  alarmDaysRef.current = alarmDays;
  speakRef.current = speakText;
  userNameRef.current = userName;
  enabledRef.current = enabled;

  const utils = trpc.useUtils();
  const { permission, requestPermission, scheduleReminder } = usePushNotifications();

  // Request notification permission once when reminders are enabled
  useEffect(() => {
    if (enabled && permission === 'default') {
      requestPermission();
    }
  }, [enabled, permission, requestPermission]);

  // The actual check function — reads from refs so it's always fresh
  const checkReminders = useCallback(async () => {
    if (!enabledRef.current) return;

    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    const todayKey = now.toDateString();
    const currentWakeUpTime = wakeUpTimeRef.current;
    const currentAlarmSound = alarmSoundRef.current;
    const currentUserName = userNameRef.current;

    // ── Wake-up reminder ──
    const currentAlarmDays = alarmDaysRef.current;
    const todayDayOfWeek = now.getDay(); // 0=Sun, 6=Sat
    const alarmDaysSet = currentAlarmDays
      ? new Set(currentAlarmDays.split(',').map(Number))
      : new Set([0,1,2,3,4,5,6]);
    const alarmAllowedToday = alarmDaysSet.has(todayDayOfWeek);

    if (currentWakeUpTime && alarmAllowedToday) {
      const parts = currentWakeUpTime.split(':');
      const wh = parseInt(parts[0], 10);
      const wm = parseInt(parts[1], 10);
      if (!isNaN(wh) && !isNaN(wm) && hh === wh && mm === wm) {
        const key = `wakeup-${todayKey}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          const msg = `Good morning, ${currentUserName}! It's ${currentWakeUpTime} — time to rise and shine. Let's make today incredible!`;
          toast.success('Good morning! ☀️', { description: `Wake-up reminder — ${currentWakeUpTime}` });
          playAlarmSound(currentAlarmSound, 30000);
          setTimeout(() => speakRef.current(msg), currentAlarmSound === 'chime' ? 3500 : 1000);
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

        // 15 minutes before
        if (diffMins >= 14 && diffMins <= 16) {
          const key = `event-15-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const timeStr = eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const msg = `Hey ${currentUserName}, heads up — ${event.title} starts in 15 minutes at ${timeStr}. Get ready!`;
            toast.info(`⏰ ${event.title}`, { description: `Starts in 15 minutes at ${timeStr}` });
            playAlarmSound(currentAlarmSound, 8000);
            setTimeout(() => speakRef.current(msg), currentAlarmSound === 'chime' ? 3500 : 1000);
          }
        }

        // 5 minutes before
        if (diffMins >= 4 && diffMins <= 6) {
          const key = `event-5-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const timeStr = eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const msg = `${currentUserName}, ${event.title} is starting in just 5 minutes. You're on!`;
            toast.warning(`🔔 ${event.title}`, { description: `Starting in 5 minutes!` });
            playAlarmSound(currentAlarmSound, 8000);
            setTimeout(() => speakRef.current(msg), currentAlarmSound === 'chime' ? 3500 : 1000);
          }
        }

        // Exact start time (within 1 minute window)
        if (diffMins >= -1 && diffMins <= 1) {
          const key = `event-now-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const msg = `${currentUserName}, it's time — ${event.title} is starting right now. Go get it!`;
            toast.error(`🚀 ${event.title}`, { description: `Starting now!` });
            playAlarmSound(currentAlarmSound, 30000);
            setTimeout(() => speakRef.current(msg), currentAlarmSound === 'chime' ? 3500 : 1000);
          }
        }
      }
    } catch {
      // Silent fail — reminders are best-effort
    }
  }, [utils]); // Only depends on utils — everything else read from refs

  // Set up the interval once — it never needs to be re-registered
  useEffect(() => {
    if (!enabled) return;

    // Check immediately on mount
    checkReminders();

    // Align to the top of the next minute, then check every 60s
    const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
    let interval: ReturnType<typeof setInterval>;

    const timeout = setTimeout(() => {
      checkReminders();
      interval = setInterval(checkReminders, 60000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [enabled, checkReminders]);

  // Pre-schedule push notifications for today's events (runs once when permission granted)
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const schedulePushes = async () => {
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

          const fire15 = new Date(eventStart.getTime() - 15 * 60000);
          const key15 = `push-15-${event.id}-${todayKey}`;
          if (!scheduledPushes.has(key15) && fire15 > now) {
            scheduledPushes.add(key15);
            scheduleReminder({ title: `⏰ ${event.title}`, body: `Starts in 15 minutes`, fireAt: fire15, tag: key15 });
          }

          const fire5 = new Date(eventStart.getTime() - 5 * 60000);
          const key5 = `push-5-${event.id}-${todayKey}`;
          if (!scheduledPushes.has(key5) && fire5 > now) {
            scheduledPushes.add(key5);
            scheduleReminder({ title: `🔔 ${event.title}`, body: `Starting in 5 minutes!`, fireAt: fire5, tag: key5 });
          }

          const keyNow = `push-now-${event.id}-${todayKey}`;
          if (!scheduledPushes.has(keyNow) && eventStart > now) {
            scheduledPushes.add(keyNow);
            scheduleReminder({ title: `🚀 ${event.title}`, body: `Starting right now!`, fireAt: eventStart, tag: keyNow });
          }
        }

        // Wake-up push
        const wt = wakeUpTimeRef.current;
        if (wt) {
          const parts = wt.split(':');
          const wh = parseInt(parts[0], 10);
          const wm = parseInt(parts[1], 10);
          if (!isNaN(wh) && !isNaN(wm)) {
            const wakeDate = new Date(now);
            wakeDate.setHours(wh, wm, 0, 0);
            if (wakeDate <= now) wakeDate.setDate(wakeDate.getDate() + 1);
            const wakeKey = `push-wakeup-${wakeDate.toDateString()}`;
            if (!scheduledPushes.has(wakeKey)) {
              scheduledPushes.add(wakeKey);
              scheduleReminder({ title: '☀️ Good Morning!', body: `It's ${wt} — time to rise and shine!`, fireAt: wakeDate, tag: wakeKey });
            }
          }
        }
      } catch {
        // silent
      }
    };

    schedulePushes();
  }, [enabled, permission, utils, scheduleReminder]);
}
