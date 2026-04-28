import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc-client";
import { useReminders } from "@/hooks/useReminders";
import type { AlarmSoundType } from "@/hooks/useAlarmSound";

export default function ReminderDaemon() {
  const { user } = useAuth({ redirectOnUnauthenticated: false });
  const [location] = useLocation();

  const profileQuery = trpc.settings.getProfile.useQuery(undefined, {
    enabled: true,
    refetchOnWindowFocus: false,
  });

  const profile = (profileQuery.data as any) ?? null;

  // Home already mounts useReminders with on-screen alarm UI; avoid duplicate alarms.
  const enabled = location !== "/";

  const { alarmState, dismissAlarm, snoozeAlarm } = useReminders({
    enabled,
    userName: user?.name || "there",
    wakeUpTime: profile?.wakeUpTime ?? null,
    speakText: () => {},
    voiceGender: "male",
    alarmSound: (profile?.alarmSound as AlarmSoundType) ?? "chime",
    alarmDays: profile?.alarmDays ?? "0,1,2,3,4,5,6",
    waterBreakEnabled: localStorage.getItem('fg_water_break_enabled') === '1',
    waterBreakIntervalMinutes: Number(localStorage.getItem('fg_water_break_interval_minutes') || '60'),
  });

  return (
    <>
      {alarmState.firing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-border bg-card px-8 py-10 shadow-2xl">
            <div className="select-none text-6xl">⏰</div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">Alarm</p>
              <p className="mt-1 text-sm text-muted-foreground">{alarmState.label}</p>
              {alarmState.isRepeating && (
                <p className="mt-2 text-xs font-medium text-primary">
                  Repeats every 5 minutes until turned off
                </p>
              )}
            </div>
            <div className="flex w-full gap-3">
              <button
                onClick={snoozeAlarm}
                className="flex-1 rounded-2xl bg-muted py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                Snooze 9 min
              </button>
              <button
                onClick={dismissAlarm}
                className="flex-1 rounded-2xl bg-primary py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Turn Off
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
