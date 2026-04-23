import { useEffect, useRef, useCallback, useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { usePushNotifications } from './usePushNotifications';
import { playAlarmSound, stopAlarmSound, type AlarmSoundType } from './useAlarmSound';

interface UseRemindersOptions {
  enabled: boolean;
  userName: string;
  wakeUpTime?: string | null; // "HH:MM" format
  speakText: (text: string) => void;
  voiceGender: 'male' | 'female';
  alarmSound?: AlarmSoundType;
  alarmDays?: string | null; // comma-separated day indices, 0=Sun..6=Sat, e.g. '1,2,3,4,5'
}

export interface AlarmState {
  firing: boolean;
  label: string; // e.g. "Wake-up alarm — 7:00 AM"
}

// Track which reminders have already fired today to avoid repeats
const firedReminders = new Set<string>();
const scheduledPushes = new Set<string>();

// Max alarm duration: 10 minutes
const MAX_ALARM_MS = 10 * 60 * 1000;
// Snooze duration: 9 minutes
const SNOOZE_MS = 9 * 60 * 1000;

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

  // ── Alarm overlay state ──────────────────────────────────────────────────────
  const [alarmState, setAlarmState] = useState<AlarmState>({ firing: false, label: '' });
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Start the alarm: play sound, show overlay, set 10-min auto-stop */
  const fireAlarm = useCallback((label: string, sound: AlarmSoundType, spokenMsg: string) => {
    // Clear any pending snooze
    if (snoozeTimerRef.current) { clearTimeout(snoozeTimerRef.current); snoozeTimerRef.current = null; }
    // Clear any previous auto-stop
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }

    // Play sound continuously (we loop by re-calling every 30s until stopped)
    const startLooping = (s: AlarmSoundType) => {
      playAlarmSound(s, MAX_ALARM_MS); // pass full 10 min — stopAlarmSound will cut it
    };
    startLooping(sound);

    setAlarmState({ firing: true, label });
    setTimeout(() => speakRef.current(spokenMsg), sound === 'chime' ? 3500 : 1000);

    // Auto-stop after 10 minutes
    autoStopTimerRef.current = setTimeout(() => {
      stopAlarmSound();
      setAlarmState({ firing: false, label: '' });
    }, MAX_ALARM_MS);
  }, []);

  /** Dismiss the alarm entirely */
  const dismissAlarm = useCallback(() => {
    stopAlarmSound();
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (snoozeTimerRef.current) { clearTimeout(snoozeTimerRef.current); snoozeTimerRef.current = null; }
    setAlarmState({ firing: false, label: '' });
  }, []);

  /** Snooze the alarm for 9 minutes */
  const snoozeAlarm = useCallback(() => {
    stopAlarmSound();
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    const currentLabel = alarmState.label;
    const currentSound = alarmSoundRef.current;
    const currentUser = userNameRef.current;
    setAlarmState({ firing: false, label: '' });
    snoozeTimerRef.current = setTimeout(() => {
      fireAlarm(currentLabel, currentSound, `Hey ${currentUser}, your snoozed alarm is going off now!`);
    }, SNOOZE_MS);
  }, [alarmState.label, fireAlarm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
      stopAlarmSound();
    };
  }, []);

  const utils = trpc.useUtils();
  const { permission, requestPermission, scheduleReminder } = usePushNotifications();

  // Request notification permission once when reminders are enabled
  useEffect(() => {
    if (enabled && permission === 'default') {
      requestPermission();
    }
  }, [enabled, permission, requestPermission]);

  // Listen for PLAY_ALARM messages from the service worker
  // (fires when the SW scheduled notification fires while the tab is open/backgrounded)
  useEffect(() => {
    if (!enabled) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAY_ALARM') {
        const sound = (event.data.alarmSound as AlarmSoundType) || alarmSoundRef.current;
        const label = event.data.label || 'Alarm';
        const msg = event.data.spokenMsg || `Hey ${userNameRef.current}, your alarm is going off!`;
        fireAlarm(label, sound, msg);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  }, [enabled, fireAlarm]);

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
          const timeLabel = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const label = `Wake-up alarm — ${timeLabel}`;
          const msg = `Good morning, ${currentUserName}! It's ${currentWakeUpTime} — time to rise and shine. Let's make today incredible!`;
          toast.success('Good morning! ☀️', { description: label });
          fireAlarm(label, currentAlarmSound, msg);
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
        const timeStr = eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        // Parse per-event reminder minutes (default: 30,15,5 if not set)
        const rawReminder = (event as any).reminderMinutes ?? '30,15,5';
        const reminderList: number[] = rawReminder
          ? rawReminder.split(',').map(Number).filter((n: number) => !isNaN(n) && n > 0)
          : [];

        // Fire each configured reminder
        for (const mins of reminderList) {
          if (diffMins >= mins - 1 && diffMins <= mins + 1) {
            const key = `event-${mins}-${event.id}-${todayKey}`;
            if (!firedReminders.has(key)) {
              firedReminders.add(key);
              let label: string;
              let msg: string;
              if (mins >= 60) {
                const hrs = Math.round(mins / 60);
                label = `${event.title} — in ${hrs} hour${hrs > 1 ? 's' : ''}`;
                msg = `Hey ${currentUserName}, heads up — ${event.title} starts in ${hrs} hour${hrs > 1 ? 's' : ''} at ${timeStr}. Plan ahead!`;
                toast.info(`⏰ ${event.title}`, { description: `Starts in ${hrs} hour${hrs > 1 ? 's' : ''} at ${timeStr}` });
              } else if (mins >= 30) {
                label = `${event.title} — in 30 minutes`;
                msg = `Hey ${currentUserName}, just a heads up — ${event.title} starts in 30 minutes at ${timeStr}. Get ready!`;
                toast.info(`⏰ ${event.title}`, { description: `Starts in 30 minutes at ${timeStr}` });
              } else if (mins >= 15) {
                label = `${event.title} — in 15 minutes`;
                msg = `Hey ${currentUserName}, ${event.title} starts in 15 minutes at ${timeStr}. Almost time!`;
                toast.info(`⏰ ${event.title}`, { description: `Starts in 15 minutes at ${timeStr}` });
              } else {
                label = `${event.title} — in ${mins} minutes`;
                msg = `${currentUserName}, ${event.title} is starting in just ${mins} minutes. You're on!`;
                toast.warning(`🔔 ${event.title}`, { description: `Starting in ${mins} minutes!` });
              }
              fireAlarm(label, currentAlarmSound, msg);
            }
          }
        }

        // Exact start time (within 1 minute window) — always fires regardless of reminderList
        if (diffMins >= -1 && diffMins <= 1) {
          const key = `event-now-${event.id}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const msg = `${currentUserName}, it's time — ${event.title} is starting right now. Go get it!`;
            toast.error(`🚀 ${event.title}`, { description: `Starting now!` });
            fireAlarm(`${event.title} — starting now!`, currentAlarmSound, msg);
          }
        }
      }
    } catch {
      // Silent fail — reminders are best-effort
    }
  }, [utils, fireAlarm]); // Only depends on utils and fireAlarm — everything else read from refs

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
            scheduleReminder({ title: `⏰ ${event.title}`, body: `Starts in 15 minutes`, fireAt: fire15, tag: key15, alarmSound: alarmSoundRef.current });
          }

          const fire5 = new Date(eventStart.getTime() - 5 * 60000);
          const key5 = `push-5-${event.id}-${todayKey}`;
          if (!scheduledPushes.has(key5) && fire5 > now) {
            scheduledPushes.add(key5);
            scheduleReminder({ title: `🔔 ${event.title}`, body: `Starting in 5 minutes!`, fireAt: fire5, tag: key5, alarmSound: alarmSoundRef.current });
          }

          const keyNow = `push-now-${event.id}-${todayKey}`;
          if (!scheduledPushes.has(keyNow) && eventStart > now) {
            scheduledPushes.add(keyNow);
            scheduleReminder({ title: `🚀 ${event.title}`, body: `Starting right now!`, fireAt: eventStart, tag: keyNow, alarmSound: alarmSoundRef.current });
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
              scheduleReminder({ title: '☀️ Good Morning!', body: `It's ${wt} — time to rise and shine!`, fireAt: wakeDate, tag: wakeKey, alarmSound: alarmSoundRef.current });
            }
          }
        }
      } catch {
        // silent
      }
    };

    schedulePushes();
  }, [enabled, permission, utils, scheduleReminder]);

  return { alarmState, dismissAlarm, snoozeAlarm };
}
