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
  alarmDays?: string | null;
  waterBreakEnabled?: boolean;
  waterBreakIntervalMinutes?: number;
  onWakeUp?: () => void;
}

export interface AlarmState {
  firing: boolean;
  label: string; // e.g. "Wake-up alarm — 7:00 AM"
  isRepeating: boolean;
}

// Track which reminders have already fired today to avoid repeats
const firedReminders = new Set<string>();
const scheduledPushes = new Set<string>();

// Max alarm duration: 10 minutes
const MAX_ALARM_MS = 10 * 60 * 1000;
// Snooze duration: 9 minutes
const SNOOZE_MS = 9 * 60 * 1000;
// Non-wake reminders ring for 1 minute before pausing.
const EVENT_ALARM_RING_MS = 60 * 1000;
// Non-wake reminders repeat every 5 minutes until dismissed.
const EVENT_ALARM_REPEAT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
type AlarmKind = 'wake' | 'event';

function parseAlarmDays(alarmDays: string | null | undefined): Set<number> {
  if (!alarmDays) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const parsed = alarmDays
    .split(',')
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return parsed.length ? new Set(parsed) : new Set([0, 1, 2, 3, 4, 5, 6]);
}

function getNextWakeDate(now: Date, wakeUpTime: string, alarmDays: string | null | undefined): Date | null {
  const [hRaw, mRaw] = wakeUpTime.split(':');
  const hh = Number(hRaw);
  const mm = Number(mRaw);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  const allowedDays = parseAlarmDays(alarmDays);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(hh, mm, 0, 0);
    if (!allowedDays.has(candidate.getDay())) continue;
    if (candidate.getTime() <= now.getTime()) continue;
    return candidate;
  }
  return null;
}

export function useReminders({
  enabled,
  userName,
  wakeUpTime,
  speakText,
  voiceGender,
  alarmSound = 'chime',
  alarmDays,
  waterBreakEnabled = false,
  waterBreakIntervalMinutes = 60,
  onWakeUp,
}: UseRemindersOptions) {
  // Use refs so the interval callback always reads the latest values (no stale closures)
  const wakeUpTimeRef = useRef(wakeUpTime);
  const alarmSoundRef = useRef(alarmSound);
  const alarmDaysRef = useRef(alarmDays);
  const waterBreakEnabledRef = useRef(false);
  const waterBreakIntervalRef = useRef(60);
  const speakRef = useRef(speakText);
  const userNameRef = useRef(userName);
  const enabledRef = useRef(enabled);

  // Keep refs in sync with props on every render
  wakeUpTimeRef.current = wakeUpTime ?? null;
  alarmSoundRef.current = alarmSound;
  alarmDaysRef.current = alarmDays;
  waterBreakEnabledRef.current = waterBreakEnabled;
  waterBreakIntervalRef.current = waterBreakIntervalMinutes;
  speakRef.current = speakText;
  userNameRef.current = userName;
  enabledRef.current = enabled;
  const onWakeUpRef = useRef(onWakeUp);
  onWakeUpRef.current = onWakeUp;
  const waterBreakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHaptics = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  }, []);

  // ── Alarm overlay state ──────────────────────────────────────────────────────
  const [alarmState, setAlarmState] = useState<AlarmState>({ firing: false, label: '', isRepeating: false });
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAlarmRef = useRef<{ label: string; sound: AlarmSoundType; spokenMsg: string; kind: AlarmKind } | null>(null);

  /** Start the alarm: play sound, show overlay, set 10-min auto-stop */
  const fireAlarm = useCallback((label: string, sound: AlarmSoundType, spokenMsg: string, kind: AlarmKind = 'event') => {
    // Clear any pending snooze
    if (snoozeTimerRef.current) { clearTimeout(snoozeTimerRef.current); snoozeTimerRef.current = null; }
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null; }
    // Clear any previous auto-stop
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }

    activeAlarmRef.current = { label, sound, spokenMsg, kind };
    try {
      localStorage.setItem('fg_alarm_active_label', label);
      localStorage.removeItem('fg_alarm_snoozed_until');
    } catch {
      // ignore storage errors
    }
    const ringDuration = kind === 'wake' ? MAX_ALARM_MS : EVENT_ALARM_RING_MS;
    playAlarmSound(sound, ringDuration);
    triggerHaptics(kind === 'wake' ? [200, 120, 200, 120, 240] : [120, 80, 120]);

    setAlarmState({ firing: true, label, isRepeating: kind === 'event' });
    setTimeout(() => speakRef.current(spokenMsg), sound === 'chime' ? 3500 : 1000);

    // Wake alarms keep ringing up to MAX_ALARM_MS. Event alarms ring for 1 minute,
    // then re-trigger every 5 minutes until the user turns them off.
    autoStopTimerRef.current = setTimeout(() => {
      stopAlarmSound();
      if (kind === 'event') {
        // Keep controls visible between event repeats so the user can always stop/snooze.
        setAlarmState((prev) => ({ ...prev, firing: true, isRepeating: true }));
        repeatTimerRef.current = setTimeout(() => {
          const current = activeAlarmRef.current;
          if (!current) return;
          fireAlarm(current.label, current.sound, current.spokenMsg, current.kind);
        }, EVENT_ALARM_REPEAT_MS);
        return;
      }
      setAlarmState({ firing: false, label: '', isRepeating: false });
    }, ringDuration);
  }, [triggerHaptics]);

  /** Dismiss the alarm entirely */
  const dismissAlarm = useCallback(() => {
    stopAlarmSound();
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (snoozeTimerRef.current) { clearTimeout(snoozeTimerRef.current); snoozeTimerRef.current = null; }
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null; }
    
    // If it was a wake-up alarm, trigger briefing
    if (activeAlarmRef.current?.kind === 'wake') {
      onWakeUpRef.current?.();
    }
    
    activeAlarmRef.current = null;
    try {
      localStorage.removeItem('fg_alarm_active_label');
      localStorage.removeItem('fg_alarm_snoozed_until');
    } catch {
      // ignore storage errors
    }
    triggerHaptics(50);
    setAlarmState({ firing: false, label: '', isRepeating: false });
  }, [triggerHaptics]);

  /** Snooze the alarm for 9 minutes */
  const snoozeAlarm = useCallback(() => {
    stopAlarmSound();
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null; }
    const current = activeAlarmRef.current;
    const currentLabel = current?.label || alarmState.label;
    const currentSound = current?.sound || alarmSoundRef.current;
    const currentKind = current?.kind || (currentLabel.toLowerCase().includes('wake-up') ? 'wake' : 'event');
    const currentUser = userNameRef.current;
    const snoozedUntil = new Date(Date.now() + SNOOZE_MS);
    try {
      localStorage.removeItem('fg_alarm_active_label');
      localStorage.setItem('fg_alarm_snoozed_until', snoozedUntil.toISOString());
    } catch {
      // ignore storage errors
    }
    triggerHaptics([60, 50, 60]);
    setAlarmState({ firing: false, label: '', isRepeating: false });
    snoozeTimerRef.current = setTimeout(() => {
      fireAlarm(currentLabel, currentSound, `Hey ${currentUser}, your snoozed alarm is going off now!`, currentKind);
    }, SNOOZE_MS);
  }, [alarmState.label, fireAlarm, triggerHaptics]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current);
      if (waterBreakTimerRef.current) clearTimeout(waterBreakTimerRef.current);
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
        try {
          localStorage.setItem('fg_last_alarm_signal_at', new Date().toISOString());
        } catch {
          // ignore storage errors
        }
        const sound = (event.data.alarmSound as AlarmSoundType) || alarmSoundRef.current;
        const label = event.data.label || 'Alarm';
        const msg = event.data.spokenMsg || `Hey ${userNameRef.current}, your alarm is going off!`;
        const inferredKind: AlarmKind = label.toLowerCase().includes('wake-up') ? 'wake' : 'event';
        fireAlarm(label, sound, msg, inferredKind);
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
      if (!isNaN(wh) && !isNaN(wm)) {
        const wakeDate = new Date(now);
        wakeDate.setHours(wh, wm, 0, 0);
        const diffMins = Math.round((wakeDate.getTime() - now.getTime()) / 60000);
        if (diffMins >= -1 && diffMins <= 1) {
            const key = `wakeup-${currentWakeUpTime}-${todayKey}`;
          if (!firedReminders.has(key)) {
            firedReminders.add(key);
            const timeLabel = wakeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const label = `Wake-up alarm — ${timeLabel}`;
            const msg = `Good morning, ${currentUserName}! It's ${currentWakeUpTime} — time to rise and shine. Let's make today incredible!`;
            toast.success('Good morning! ☀️', { description: label });
            fireAlarm(label, currentAlarmSound, msg, 'wake');
          }
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
              fireAlarm(label, currentAlarmSound, msg, 'event');
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
            fireAlarm(`${event.title} — starting now!`, currentAlarmSound, msg, 'event');
          }
        }
      }
    } catch {
      // Silent fail — reminders are best-effort
    }

    // ── List reminders ──
    try {
      const allLists = await utils.list.all.fetch();
      for (const list of allLists) {
        const items = await utils.list.items.fetch({ listId: list.id });
        for (const item of items) {
          if (item.completed || !item.reminderAt) continue;
          const remindAt = new Date(item.reminderAt);
          const diffMins = Math.round((remindAt.getTime() - now.getTime()) / 60000);
          
          if (diffMins >= -1 && diffMins <= 1) {
            const key = `list-remind-${item.id}-${todayKey}`;
            if (!firedReminders.has(key)) {
              firedReminders.add(key);
              const label = `List: ${list.name}`;
              const msg = `Heads up! You wanted to be reminded about '${item.content}' on your ${list.name} list.`;
              toast.info(`📝 ${item.content}`, { description: `Reminder from ${list.name}` });
              fireAlarm(label, currentAlarmSound, msg, 'event');
            }
          }
        }
      }
    } catch { /* silent */ }
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

  // Dedicated wake-up scheduler: more reliable than minute polling.
  useEffect(() => {
    if (!enabled) return;

    const scheduleNextWake = () => {
      if (wakeTimerRef.current) {
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = null;
      }

      const now = new Date();
      const wt = wakeUpTimeRef.current;
      if (!wt) return;

      const nextWake = getNextWakeDate(now, wt, alarmDaysRef.current);
      if (!nextWake) return;

      const delay = nextWake.getTime() - now.getTime();
      if (delay <= 0) return;

      wakeTimerRef.current = setTimeout(() => {
        const todayKey = new Date().toDateString();
        const key = `wakeup-${wt}-${todayKey}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          const currentUserName = userNameRef.current;
          const currentAlarmSound = alarmSoundRef.current;
          const timeLabel = nextWake.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const label = `Wake-up alarm — ${timeLabel}`;
          const msg = `Good morning, ${currentUserName}! It's ${wt} — time to rise and shine. Let's make today incredible!`;
          toast.success('Good morning! ☀️', { description: label });
          fireAlarm(label, currentAlarmSound, msg, 'wake');
        }
        scheduleNextWake();
      }, Math.min(delay, MAX_TIMEOUT_MS));
    };

    scheduleNextWake();
    return () => {
      if (wakeTimerRef.current) {
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = null;
      }
    };
  }, [enabled, wakeUpTime, alarmDays, fireAlarm]);

  // Water break scheduler (local, repeats by interval while enabled)
  useEffect(() => {
    if (!enabled) return;
    const readWaterSettings = () => {
      try {
        waterBreakEnabledRef.current = localStorage.getItem('fg_water_break_enabled') === '1';
        const raw = Number(localStorage.getItem('fg_water_break_interval_minutes') || '60');
        waterBreakIntervalRef.current = Number.isFinite(raw) && raw >= 15 ? raw : 60;
      } catch {
        waterBreakEnabledRef.current = false;
        waterBreakIntervalRef.current = 60;
      }
    };

    const scheduleNextWaterBreak = () => {
      readWaterSettings();
      if (waterBreakTimerRef.current) {
        clearTimeout(waterBreakTimerRef.current);
        waterBreakTimerRef.current = null;
      }
      if (!waterBreakEnabledRef.current) return;
      const intervalMs = waterBreakIntervalRef.current * 60 * 1000;
      waterBreakTimerRef.current = setTimeout(() => {
        const now = new Date();
        const key = `water-break-${now.toDateString()}-${now.getHours()}-${Math.floor(now.getMinutes() / 5)}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          const label = `Water break — every ${waterBreakIntervalRef.current} minutes`;
          const msg = `Hey ${userNameRef.current}, quick water break time. Take a sip and reset.`;
          toast.info('Hydration reminder', { description: 'Take a quick water break.' });
          fireAlarm(label, alarmSoundRef.current, msg, 'event');
        }
        scheduleNextWaterBreak();
      }, Math.min(intervalMs, MAX_TIMEOUT_MS));
    };

    scheduleNextWaterBreak();
    return () => {
      if (waterBreakTimerRef.current) {
        clearTimeout(waterBreakTimerRef.current);
        waterBreakTimerRef.current = null;
      }
    };
  }, [enabled, fireAlarm]);

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
            const wakeKey = `push-wakeup-${wt}-${wakeDate.toDateString()}`;
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
