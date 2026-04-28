import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc-client';

export type ReminderPayload = {
  title: string;
  body: string;
  fireAt: Date; // exact time to show the notification
  tag?: string;
  alarmSound?: string; // passed to SW so it can tell the page to play sound
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [swReady, setSwReady] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const scheduledRef = useRef<Set<string>>(new Set());

  // Register service worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        swRef.current = reg;
        setSwReady(true);
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));

    setPermission(Notification.permission);
  }, []);

  const registerMutation = trpc.push.register.useMutation();

  // Handle subscription and registration
  useEffect(() => {
    if (!swReady || permission !== 'granted' || !swRef.current) return;

    const subscribeAndRegister = async () => {
      try {
        const vapidKey =
          import.meta.env.VITE_VAPID_PUBLIC_KEY ||
          'BHjQ-4anMIWuj2qfTO3hHmoyemSuchf_gqxKAyCqEkE56fC7iRAWrQwQ8Ts_wifuxW4NA2InsvSTYzg-7M_Eaxk';
        const sub = await swRef.current!.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('p256dh')!) as any));
        const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('auth')!) as any));

        await registerMutation.mutateAsync({
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
          },
        });
        console.log('[Push] Registered with backend');
      } catch (err) {
        console.warn('[Push] Subscription failed:', err);
      }
    };

    subscribeAndRegister();
  }, [swReady, permission, registerMutation]);

  // Request notification permission
  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return true;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  };

  // Schedule a notification via the service worker message channel
  const scheduleReminder = (reminder: ReminderPayload) => {
    const key = `${reminder.tag ?? reminder.title}::${reminder.fireAt.getTime()}`;
    if (scheduledRef.current.has(key)) return; // already scheduled
    scheduledRef.current.add(key);

    const delay = reminder.fireAt.getTime() - Date.now();
    if (delay < 0) return; // already past

    if (swRef.current?.active) {
      // Use service worker for background delivery
      swRef.current.active.postMessage({
        type: 'SCHEDULE_REMINDER',
        title: reminder.title,
        body: reminder.body,
        delay,
        alarmSound: (reminder as any).alarmSound || 'chime',
      });
    } else {
      // Fallback: browser setTimeout (only works while tab is open)
      setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(reminder.title, {
            body: reminder.body,
            icon: '/icon-192.png',
            tag: reminder.tag,
          });
        }
      }, delay);
    }
  };

  return { permission, swReady, requestPermission, scheduleReminder };
}
