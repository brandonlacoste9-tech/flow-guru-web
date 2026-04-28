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

  useReminders({
    enabled,
    userName: user?.name || "there",
    wakeUpTime: profile?.wakeUpTime ?? null,
    speakText: () => {},
    voiceGender: "male",
    alarmSound: (profile?.alarmSound as AlarmSoundType) ?? "chime",
    alarmDays: profile?.alarmDays ?? "0,1,2,3,4,5,6",
  });

  return null;
}
