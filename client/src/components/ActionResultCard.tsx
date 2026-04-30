import React, { useRef, useEffect } from "react";
import { Calendar, Cloud, MapPin, Newspaper, Music, Globe, Bot, Sparkles, AlertCircle, ListTodo, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mirrors server `AssistantActionResult` without importing server code into the client bundle. */
export type AssistantActionResult = {
  action: string;
  status: "executed" | "needs_input" | "needs_connection" | "failed";
  title: string;
  summary: string;
  provider?: string;
  data?: Record<string, unknown>;
};

/** Fallback when Google Embed API key is unset — bbox overview, no API key. */
function openStreetMapRouteEmbedUrl(a: { lat: number; lng: number }, b: { lat: number; lng: number }): string {
  const pad = 0.025;
  const minLat = Math.min(a.lat, b.lat) - pad;
  const maxLat = Math.max(a.lat, b.lat) + pad;
  const minLon = Math.min(a.lng, b.lng) - pad;
  const maxLon = Math.max(a.lng, b.lng) + pad;
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
}

function getActionIcon(action: string) {
  if (action?.includes("calendar") || action?.includes("reminder")) return Calendar;
  if (action?.includes("weather")) return Cloud;
  if (action?.includes("route")) return MapPin;
  if (action?.includes("news")) return Newspaper;
  if (action?.includes("music")) return Music;
  if (action?.includes("browser")) return Globe;
  if (action?.includes("subagent")) return Bot;
  if (action?.includes("list")) return ListTodo;
  if (action?.includes("contact")) return Phone;
  return Sparkles;
}

function AudioPlayer({ audioDataUri }: { audioDataUri: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioDataUri]);

  return (
    <audio
      ref={audioRef}
      src={audioDataUri}
      controls
      className="w-full mt-2 rounded-lg"
      style={{ height: 40 }}
    />
  );
}

export function ActionResultCard({ result }: { result: AssistantActionResult }) {
  const Icon = getActionIcon(result.action);

  const data = result.data ?? {};
  let body: React.ReactNode = null;

  if (result.status === "failed") {
    body = (
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <p className="text-muted-foreground text-[15px] leading-relaxed">{result.summary}</p>
      </div>
    );
  } else if (result.status !== "executed") {
    body = (
      <div className="space-y-2">
        <p className="text-foreground text-[16px] leading-relaxed">{result.summary}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Add what's missing above and try again — this step has not run yet.
        </p>
      </div>
    );
  } else if (result.action === "music.play") {
    const audioDataUri = (data as { audioDataUri?: string }).audioDataUri;
    const query = (data as { query?: string }).query;
    if (audioDataUri) {
      body = (
        <div>
          {query && <p className="text-muted-foreground text-sm mb-2">{query}</p>}
          <AudioPlayer audioDataUri={audioDataUri} />
        </div>
      );
    }
  } else if (result.action === "route.get") {
    const mapsUrlGoogle = data.mapsUrlGoogle as string | undefined;
    const mapsUrlApple = data.mapsUrlApple as string | undefined;
    const steps = (data.steps as string[] | undefined) ?? [];
    const routeOrigin = data.origin as string | undefined;
    const routeDestination = data.destination as string | undefined;
    const routeMode = ((data.mode as string | undefined) || "driving").toLowerCase();
    const embedModes = new Set(["driving", "walking", "bicycling", "transit"]);
    const embedMode = embedModes.has(routeMode) ? routeMode : "driving";
    const embedKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY?.trim();
    const embedSrc =
      embedKey && routeOrigin && routeDestination
        ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(embedKey)}&origin=${encodeURIComponent(routeOrigin)}&destination=${encodeURIComponent(routeDestination)}&mode=${encodeURIComponent(embedMode)}`
        : null;

    const oLat = data.originLat as number | undefined;
    const oLng = data.originLng as number | undefined;
    const dLat = data.destinationLat as number | undefined;
    const dLng = data.destinationLng as number | undefined;
    const osmEmbedSrc =
      embedSrc == null &&
      typeof oLat === "number" &&
      typeof oLng === "number" &&
      typeof dLat === "number" &&
      typeof dLng === "number" &&
      [oLat, oLng, dLat, dLng].every(Number.isFinite)
        ? openStreetMapRouteEmbedUrl({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng })
        : null;

    const mapIframeSrc = embedSrc ?? osmEmbedSrc;

    body = (
      <div className="space-y-3 mt-1">
        <p className="text-foreground text-[16px] leading-relaxed">{result.summary}</p>
        {mapIframeSrc && (
          <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-inner">
            <iframe
              title="Route preview map"
              className="h-[min(240px,40vw)] w-full min-h-[180px] border-0 sm:h-[260px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              src={mapIframeSrc}
            />
            {osmEmbedSrc && !embedSrc && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Overview map — use Google or Apple Maps below for turn-by-turn directions.
              </p>
            )}
          </div>
        )}
        {(mapsUrlGoogle || mapsUrlApple) && (
          <div className="flex flex-wrap gap-2">
            {mapsUrlGoogle && (
              <a
                href={mapsUrlGoogle}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Open in Google Maps
              </a>
            )}
            {mapsUrlApple && (
              <a
                href={mapsUrlApple}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Open in Apple Maps
              </a>
            )}
          </div>
        )}
        {steps.length > 0 && (
          <ol className="text-muted-foreground text-sm list-decimal pl-5 space-y-1 border-t border-border pt-3">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  } else if (result.action === "contact.open") {
    const hrefCall = data.hrefCall as string | undefined;
    const hrefSms = data.hrefSms as string | undefined;
    const hrefMailto = data.hrefMailto as string | undefined;
    const channel = data.channel as string | undefined;
    body = (
      <div className="space-y-3 mt-1">
        <p className="text-foreground text-[16px] leading-relaxed">{result.summary}</p>
        <div className="flex flex-wrap gap-2">
          {hrefCall && channel !== "email" && (
            <a
              href={hrefCall}
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Call
            </a>
          )}
          {hrefSms && channel !== "email" && (
            <a
              href={hrefSms}
              className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Text
            </a>
          )}
          {hrefMailto && (
            <a
              href={hrefMailto}
              className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Email
            </a>
          )}
        </div>
      </div>
    );
  } else if (result.action === "weather.get") {
    const keys = Object.keys(data);
    if (keys.length === 0 || (data as { forecast?: unknown }).forecast == null) {
      body = (
        <p className="text-muted-foreground text-[16px] leading-relaxed">
          Weather details are not available for this result yet.
        </p>
      );
    }
  } else if (result.action === "news.get") {
    const stories = (data as { stories?: unknown }).stories;
    if (Array.isArray(stories) && stories.length === 0) {
      body = (
        <p className="text-muted-foreground text-[16px] leading-relaxed">
          No story cards were available for this news result yet.
        </p>
      );
    }
  } else if (result.action === "list.manage") {
    const items = (data as { items?: any[] }).items;
    if (Array.isArray(items) && items.length > 0) {
      body = (
        <div className="space-y-2 mt-2">
          {items.slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
              <p className={cn("text-[15px] font-medium", item.completed && "line-through opacity-50")}>
                {item.content}
              </p>
            </div>
          ))}
          {items.length > 5 && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest pl-3.5">+{items.length - 5} more</p>}
        </div>
      );
    }
  }

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-[24px] p-6 max-w-[85%] backdrop-blur-xl animate-in zoom-in-95 duration-500 shadow-xl",
        result.status === "failed" && "border-destructive/20 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("p-2 rounded-full", result.status === "failed" ? "bg-destructive/10" : "bg-primary/10")}>
          <Icon className={cn("w-5 h-5", result.status === "failed" ? "text-destructive" : "text-primary")} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{result.title}</h3>
      </div>
      {body ?? <p className="text-foreground text-[16px] leading-relaxed">{result.summary}</p>}
    </div>
  );
}
