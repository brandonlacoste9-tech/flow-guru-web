import React, { useRef, useEffect } from "react";
import { Calendar, Cloud, MapPin, Newspaper, Music, Globe, Bot, Sparkles, AlertCircle, ListTodo } from "lucide-react";
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

function getActionIcon(action: string) {
  if (action?.includes("calendar") || action?.includes("reminder")) return Calendar;
  if (action?.includes("weather")) return Cloud;
  if (action?.includes("route")) return MapPin;
  if (action?.includes("news")) return Newspaper;
  if (action?.includes("music")) return Music;
  if (action?.includes("browser")) return Globe;
  if (action?.includes("subagent")) return Bot;
  if (action?.includes("list")) return ListTodo;
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
      <p className="text-foreground text-[16px] leading-relaxed">
        This action <strong className="text-primary">needs input</strong> before we can finish — here is what we know so
        far, <span className="text-muted-foreground">without fully executing the action</span>.
      </p>
    );
  } else if (result.action === "music.play") {
    const item = (data as any).item;
    const externalUrl = (data as any).externalUrl;
    const audioDataUri = (data as any).audioDataUri;
    
    if (item) {
      body = (
        <div className="flex items-center gap-3 mt-1">
          {item.album?.images?.[0]?.url && (
            <img src={item.album.images[0].url} alt={item.name} className="w-12 h-12 rounded-lg shadow-md object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-foreground text-sm font-bold truncate">{item.name}</p>
            <p className="text-muted-foreground text-[11px] truncate">{item.artists?.[0]?.name || 'Unknown Artist'}</p>
            {externalUrl && (
              <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-[10px] font-bold uppercase tracking-wider mt-1 inline-block hover:underline">
                Open in Spotify
              </a>
            )}
          </div>
        </div>
      );
    } else if (audioDataUri) {
      body = (
        <div>
          <AudioPlayer audioDataUri={audioDataUri} />
        </div>
      );
    }
  } else if (result.action === "route.get") {
    const origin = (data as { origin?: string }).origin;
    const destination = (data as { destination?: string }).destination;
    const hasRouteDetail =
      (data as { routes?: unknown }).routes != null || (data as { duration?: unknown }).duration != null;
    if (origin && destination && !hasRouteDetail) {
      body = (
        <p className="text-muted-foreground text-[16px] leading-relaxed">
          Route details for {origin} to {destination} are not available yet.
        </p>
      );
    }
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
