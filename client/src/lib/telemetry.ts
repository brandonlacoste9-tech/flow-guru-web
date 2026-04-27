type TelemetryProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    va?: (command: "event", payload: { name: string; data?: TelemetryProperties }) => void;
    gtag?: (command: "event", eventName: string, properties?: TelemetryProperties) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackConversion(eventName: string, properties: TelemetryProperties = {}) {
  if (typeof window === "undefined") return;

  const data = {
    ...properties,
    path: window.location.pathname,
  };

  window.va?.("event", { name: eventName, data });
  window.gtag?.("event", eventName, data);
  window.dataLayer?.push({ event: eventName, ...data });

  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    console.debug("[Telemetry]", eventName, data);
  }
}
