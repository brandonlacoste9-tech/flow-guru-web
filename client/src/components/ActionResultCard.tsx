import React from "react";
import { Calendar, Cloud, MapPin, Newspaper, Sparkles } from "lucide-react";
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
  if (action?.includes("calendar")) return Calendar;
  if (action?.includes("weather")) return Cloud;
  if (action?.includes("route")) return MapPin;
  if (action?.includes("news")) return Newspaper;
  return Sparkles;
}

export function ActionResultCard({ result }: { result: AssistantActionResult }) {
  const Icon = getActionIcon(result.action);

  const data = result.data ?? {};
  let body: React.ReactNode = null;

  if (result.status !== "executed") {
    body = (
      <p className="text-zinc-300 text-[16px] leading-relaxed">
        This action <strong className="text-zinc-100">needs input</strong> before we can finish — here is what we know so
        far, <span className="text-zinc-400">without fully executing the action</span>.
      </p>
    );
  } else if (result.action === "route.get") {
    const origin = (data as { origin?: string }).origin;
    const destination = (data as { destination?: string }).destination;
    const hasRouteDetail =
      (data as { routes?: unknown }).routes != null || (data as { duration?: unknown }).duration != null;
    if (origin && destination && !hasRouteDetail) {
      body = (
        <p className="text-zinc-300 text-[16px] leading-relaxed">
          Route details for {origin} to {destination} are not available yet.
        </p>
      );
    }
  } else if (result.action === "weather.get") {
    const keys = Object.keys(data);
    if (keys.length === 0 || (data as { forecast?: unknown }).forecast == null) {
      body = (
        <p className="text-zinc-300 text-[16px] leading-relaxed">
          Weather details are not available for this result yet.
        </p>
      );
    }
  } else if (result.action === "news.get") {
    const stories = (data as { stories?: unknown }).stories;
    if (Array.isArray(stories) && stories.length === 0) {
      body = (
        <p className="text-zinc-300 text-[16px] leading-relaxed">
          No story cards were available for this news result yet.
        </p>
      );
    }
  }

  return (
    <div
      className={cn(
        "bg-[#1C1C1E]/50 border border-white/5 rounded-[24px] p-6 max-w-[85%] backdrop-blur-xl animate-in zoom-in-95 duration-500",
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-blue-500/10 rounded-full">
          <Icon className="text-blue-500 w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">{result.title}</h3>
      </div>
      {body ?? <p className="text-zinc-300 text-[16px] leading-relaxed">{result.summary}</p>}
    </div>
  );
}
