import { useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';

interface UseRemindersOptions {
  enabled: boolean;
  userName: string;
  wakeUpTime?: string | null; // "HH:MM" format
  speakText: (text: string) => void;
  voiceGender: 'male' | 'female';
}

// Track which reminders have already fired this session to avoid repeats
const firedReminders = new Set<string>();

function getMinutesUntil(targetHour: number, targetMin: number, now: Date): number {
  const target = new Date(now);
  target.setHours(targetHour, targetMin, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // next day if already passed
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export function useReminders({ enabled, userName, wakeUpTime, speakText, voiceGender }: UseRemindersOptions) {
  const utils = trpc.useUtils();
  const speakRef = useRef(speakText);
  speakRef.current = speakText;

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
          speakRef.current(msg);
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
            speakRef.current(msg);
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
            speakRef.current(msg);
          }
        }

        // Fire at the exact start time
        if (diffMins === 0) {
          const key = `event-now-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const msg = `${userName}, it's time — ${event.title} is starting right now. Go get it!`;
            toast.error(`🚀 ${event.title}`, { description: `Starting now!` });
            speakRef.current(msg);
          }
        }
      }
    } catch {
      // Silent fail — reminders are best-effort
    }
  }, [enabled, userName, wakeUpTime, utils]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, checkReminders]);
}
