import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getDisplayedMessages, mergeVoiceDraft, sanitizeSpeechText } from "./home.helpers";
import {
  ArrowUpRight,
  CalendarClock,
  CloudSun,
  Loader2,
  LogOut,
  MapPinned,
  Mic,
  MicOff,
  Music4,
  Newspaper,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

type UiMessage = {
  id: number;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: Date | string | number;
};

export type AssistantActionResult = {
  action: string;
  status: "executed" | "needs_input" | "needs_connection" | "failed";
  title: string;
  summary: string;
  provider?: string;
  data?: Record<string, unknown>;
};

type ProviderConnection = {
  provider: "google-calendar" | "spotify";
  status: "not_connected" | "pending" | "connected" | "error";
  externalAccountLabel?: string | null;
};

function formatRelativeTime(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getActionIcon(action: string) {
  if (action.startsWith("route")) return MapPinned;
  if (action.startsWith("weather")) return CloudSun;
  if (action.startsWith("news")) return Newspaper;
  if (action.startsWith("calendar")) return CalendarClock;
  if (action.startsWith("music")) return Music4;
  return Sparkles;
}

function formatProviderLabel(provider: ProviderConnection["provider"]) {
  return provider === "google-calendar" ? "Google Calendar" : "Spotify";
}

function getProviderConnectUrl(provider: ProviderConnection["provider"]) {
  return `/api/integrations/${provider}/start`;
}

function ProviderStatusPill({
  connection,
  onConnect,
}: {
  connection: ProviderConnection;
  onConnect?: (provider: ProviderConnection["provider"]) => void;
}) {
  const statusLabel =
    connection.status === "connected"
      ? connection.externalAccountLabel
        ? `${formatProviderLabel(connection.provider)} · ${connection.externalAccountLabel}`
        : `${formatProviderLabel(connection.provider)} connected`
      : connection.status === "pending"
        ? `${formatProviderLabel(connection.provider)} staged`
        : connection.status === "error"
          ? `${formatProviderLabel(connection.provider)} needs attention`
          : `${formatProviderLabel(connection.provider)} not connected`;

  const canConnect = connection.status !== "connected" && Boolean(onConnect);
  const statusTone =
    connection.status === "connected"
      ? "bg-emerald-400"
      : connection.status === "pending"
        ? "bg-amber-300"
        : connection.status === "error"
          ? "bg-rose-400"
          : "bg-white/40";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/12 bg-white/[0.07] px-3.5 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{formatProviderLabel(connection.provider)}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn("size-2 rounded-full", statusTone)} />
          <p className="truncate text-sm text-foreground">{statusLabel}</p>
        </div>
      </div>
      {canConnect ? (
        <button
          type="button"
          onClick={() => onConnect?.(connection.provider)}
          className="shrink-0 rounded-full border border-primary/25 bg-primary/12 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary transition hover:bg-primary/18"
        >
          Connect
        </button>
      ) : null}
    </div>
  );
}

export function ActionResultCard({ result }: { result: AssistantActionResult }) {
  const Icon = getActionIcon(result.action);
  const routeData = result.data as
    | {
        distanceText?: string | null;
        durationText?: string | null;
        durationInTrafficText?: string | null;
        origin?: string | null;
        destination?: string | null;
        steps?: string[];
      }
    | undefined;
  const weatherData = result.data as
    | {
        location?: string | null;
        current?: {
          temperatureC?: number | null;
          apparentTemperatureC?: number | null;
          weatherLabel?: string | null;
          windSpeedKph?: number | null;
        } | null;
        focusForecast?: {
          date?: string | null;
          weatherLabel?: string | null;
          temperatureMaxC?: number | null;
          temperatureMinC?: number | null;
          precipitationProbabilityMax?: number | null;
        } | null;
      }
    | undefined;
  const newsData = result.data as
    | {
        stories?: Array<{
          id: string;
          title: string;
          summary?: string | null;
          sourceTitle?: string | null;
          sourceUrl?: string | null;
        }>;
      }
    | undefined;
  const newsStories = newsData?.stories ?? [];
  const routeHasDetails = Boolean(
    routeData?.distanceText ||
      routeData?.durationText ||
      routeData?.durationInTrafficText ||
      (Array.isArray(routeData?.steps) && routeData.steps.length > 0),
  );
  const weatherHasDetails = Boolean(weatherData?.current || weatherData?.focusForecast);
  const statusAccentClass =
    result.status === "executed"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : result.status === "needs_input"
        ? "border-amber-300/25 bg-amber-500/10 text-amber-100"
        : result.status === "needs_connection"
          ? "border-sky-300/25 bg-sky-500/10 text-sky-100"
          : "border-rose-300/25 bg-rose-500/10 text-rose-100";
  const statusLabel = result.status.replace(/_/g, " ");

  return (
    <div className="rounded-[26px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12 text-primary shadow-lg shadow-primary/10">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Action result</p>
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]", statusAccentClass)}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">{result.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.summary}</p>
          </div>

          {result.status !== "executed" && (
            <div className={cn("rounded-[20px] border px-3 py-3 text-sm leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", statusAccentClass)}>
              Flow Guru surfaced this result without fully executing the action. Review the message above for the missing detail or connection step, then try again here in chat.
            </div>
          )}

          {result.action === "route.get" && routeData && (
            <div className="space-y-3">
              {routeHasDetails ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Distance</p>
                      <p className="mt-1 text-sm text-foreground">{routeData.distanceText ?? "—"}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Typical time</p>
                      <p className="mt-1 text-sm text-foreground">{routeData.durationText ?? "—"}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Traffic now</p>
                      <p className="mt-1 text-sm text-foreground">{routeData.durationInTrafficText ?? routeData.durationText ?? "—"}</p>
                    </div>
                  </div>
                  {Array.isArray(routeData.steps) && routeData.steps.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">First steps</p>
                      <div className="space-y-2">
                        {routeData.steps.slice(0, 3).map(step => (
                          <div key={step} className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-2.5 text-sm leading-6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-3 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  {routeData.origin || routeData.destination
                    ? `Route details for ${routeData.origin ?? "your origin"} to ${routeData.destination ?? "your destination"} are not available yet.`
                    : "Route details are not available for this result yet."}
                </div>
              )}
            </div>
          )}

          {result.action === "weather.get" && weatherData && (
            weatherHasDetails ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/6 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Current</p>
                <p className="mt-1 text-sm text-foreground">
                  {weatherData.current?.weatherLabel ?? "Conditions unavailable"}
                  {weatherData.current?.temperatureC != null ? ` · ${weatherData.current.temperatureC}°C` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {weatherData.current?.apparentTemperatureC != null
                    ? `Feels like ${weatherData.current.apparentTemperatureC}°C`
                    : ""}
                  {weatherData.current?.windSpeedKph != null
                    ? `${weatherData.current?.apparentTemperatureC != null ? " · " : ""}${weatherData.current.windSpeedKph} km/h wind`
                    : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/6 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Forecast focus</p>
                <p className="mt-1 text-sm text-foreground">{weatherData.focusForecast?.weatherLabel ?? "Forecast unavailable"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {weatherData.focusForecast?.temperatureMinC != null && weatherData.focusForecast?.temperatureMaxC != null
                    ? `${weatherData.focusForecast.temperatureMinC}°C to ${weatherData.focusForecast.temperatureMaxC}°C`
                    : ""}
                  {weatherData.focusForecast?.precipitationProbabilityMax != null
                    ? `${weatherData.focusForecast?.temperatureMinC != null ? " · " : ""}${weatherData.focusForecast.precipitationProbabilityMax}% precip.`
                    : ""}
                </p>
              </div>
            </div>
            ) : (
              <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-3 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                Weather details are not available for this result yet. Ask again with a location or timeframe for a fuller forecast card.
              </div>
            )
          )}

          {result.action === "news.get" && (newsStories.length > 0 ? (
            <div className="space-y-2">
              {newsStories.slice(0, 3).map(story => (
                <div key={story.id} className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-6 text-foreground">{story.title}</p>
                      {story.summary ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{story.summary}</p> : null}
                      {story.sourceTitle ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{story.sourceTitle}</p> : null}
                    </div>
                    {story.sourceUrl ? (
                      <a
                        href={story.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs text-foreground transition hover:bg-white/14"
                      >
                        Open
                        <ArrowUpRight className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-white/10 bg-black/18 px-3 py-3 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              No story cards were available for this news result yet. Try narrowing the topic or asking for a fresh brief.
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading, error, isAuthenticated, logout } = useAuth();
  const bootstrapQuery = trpc.assistant.bootstrap.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = useState("");
  const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [actionResultsByMessageId, setActionResultsByMessageId] = useState<Record<number, AssistantActionResult>>({});
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [voiceCaptureMessage, setVoiceCaptureMessage] = useState<string | null>(null);
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);

  const messageViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const listeningBaseTextRef = useRef("");
  const listeningActiveRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const hasPreparedFreshChatRef = useRef(false);

  const displayedMessages = useMemo(() => getDisplayedMessages(messages), [messages]);
  const providerConnections = ((bootstrapQuery.data?.providerConnections as ProviderConnection[] | undefined) ?? []).filter(Boolean);

  useEffect(() => {
    if (typeof window === "undefined" || !isAuthenticated) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    const status = params.get("status");
    if (!integration || !status) {
      return;
    }

    if (integration === "google-calendar" && status === "connected") {
      const account = params.get("account");
      toast.success(account ? `Google Calendar connected: ${account}` : "Google Calendar connected.");
      bootstrapQuery.refetch();
    } else if (integration === "google-calendar" && status === "error") {
      toast.error(params.get("message") || "Google Calendar connection failed.");
      bootstrapQuery.refetch();
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  }, [bootstrapQuery, isAuthenticated]);

  const handleConnectProvider = (provider: ProviderConnection["provider"]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.location.href = getProviderConnectUrl(provider);
  };

  const speakText = (text: string) => {
    if (!speechEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSpeakingReply(false);
      return;
    }

    const speechText = sanitizeSpeechText(text);
    if (!speechText) {
      setIsSpeakingReply(false);
      return;
    }

    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(speechText);
      const availableVoices = window.speechSynthesis.getVoices();
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = navigator.language || "en-US";
      utterance.voice =
        availableVoices.find(voice => voice.lang === utterance.lang) ??
        availableVoices.find(voice => voice.lang.startsWith(utterance.lang.split("-")[0] ?? "")) ??
        availableVoices[0] ??
        null;
      utterance.onstart = () => {
        setIsSpeakingReply(true);
      };
      utterance.onend = () => {
        setIsSpeakingReply(false);
      };
      utterance.onerror = event => {
        setIsSpeakingReply(false);
        if (event.error === "interrupted" || event.error === "canceled") {
          return;
        }
        toast.error("Speech playback is unavailable in this browser session.");
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeakingReply(false);
      toast.error("Speech playback is not available right now.");
    }
  };

  const startFreshMutation = trpc.assistant.startFresh.useMutation({
    onSuccess: result => {
      setCurrentThreadId((result.thread as { id: number } | null | undefined)?.id ?? null);
      setMessages([]);
      setActionResultsByMessageId({});
      setDraft("");
      setInterimTranscript("");
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
    onError: mutationError => {
      toast.error(mutationError.message || "Flow Guru couldn’t prepare a fresh chat just now.");
    },
  });

  const isPreparingFreshChat = bootstrapQuery.isLoading || startFreshMutation.isPending;

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: result => {
      const nextMessages = (result.messages as UiMessage[]) ?? [];
      setCurrentThreadId(result.threadId ?? null);
      setMessages(nextMessages);
      setActionResultsByMessageId(current => {
        const next = { ...current };
        const latestAssistantMessage = [...nextMessages].reverse().find(message => message.role === "assistant");
        if (latestAssistantMessage && result.actionResult && result.actionResult.action !== "none") {
          next[latestAssistantMessage.id] = result.actionResult as AssistantActionResult;
        }
        return next;
      });
      setInterimTranscript("");
      speakText(result.reply);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    },
    onError: mutationError => {
      toast.error(mutationError.message || "Flow Guru couldn’t respond just now.");
    },
  });

  useEffect(() => {
    if (!bootstrapQuery.data) {
      return;
    }

    const bootstrapMessages = (bootstrapQuery.data.messages as UiMessage[]) ?? [];
    const bootstrapThreadId = (bootstrapQuery.data.thread as { id: number } | null | undefined)?.id ?? null;

    if (bootstrapMessages.length > 0 && !hasPreparedFreshChatRef.current) {
      hasPreparedFreshChatRef.current = true;
      setMessages([]);
      setActionResultsByMessageId({});
      setCurrentThreadId(null);
      startFreshMutation.mutate();
      return;
    }

    setCurrentThreadId(bootstrapThreadId);
    setMessages(bootstrapMessages);
  }, [bootstrapQuery.data]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;

    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [displayedMessages, sendMutation.isPending]);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    const updateSpeechSupport = () => {
      setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    };

    updateSpeechSupport();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateSpeechSupport;
    }

    setRecognitionSupported(Boolean(RecognitionCtor));

    if (!RecognitionCtor) {
      recognitionRef.current = null;
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = event => {
      heardSpeechRef.current = true;

      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map(result => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      const finalText = Array.from(event.results)
        .slice(event.resultIndex)
        .filter(result => result.isFinal)
        .map(result => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      setInterimTranscript(transcript);
      setDraft(mergeVoiceDraft(listeningBaseTextRef.current, transcript));

      if (finalText) {
        setDraft(mergeVoiceDraft(listeningBaseTextRef.current, finalText));
      }
    };

    recognition.onerror = event => {
      listeningActiveRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
      const message =
        event.error === "not-allowed"
          ? "Microphone access is blocked. Allow microphone access in your browser to use voice input."
          : event.error === "no-speech"
            ? "I did not catch any speech. Try again when you are ready."
            : "Voice input stopped unexpectedly. You can type instead or try the mic again.";
      setVoiceCaptureMessage(message);
      if (event.error === "not-allowed") {
        toast.error(message);
      }
    };

    recognition.onend = () => {
      const endedWithoutSpeech = listeningActiveRef.current && !heardSpeechRef.current;
      listeningActiveRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
      if (endedWithoutSpeech) {
        setVoiceCaptureMessage("Listening stopped before any speech was captured.");
        return;
      }
      if (heardSpeechRef.current) {
        setVoiceCaptureMessage("Voice captured. Review or send when you are ready.");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort?.();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const handleSend = (content?: string) => {
    const value = (content ?? draft).trim();
    if (!value || sendMutation.isPending || startFreshMutation.isPending) return;

    setDraft("");
    setInterimTranscript("");
    sendMutation.mutate({
      message: value,
      timeZone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
      threadId: currentThreadId ?? undefined,
    });
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      const message = "Voice input is not available in this browser.";
      setVoiceCaptureMessage(message);
      toast.error(message);
      return;
    }

    if (isListening) {
      listeningActiveRef.current = false;
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript("");
      setVoiceCaptureMessage("Listening paused.");
      return;
    }

    listeningBaseTextRef.current = draft.trim();
    heardSpeechRef.current = false;
    listeningActiveRef.current = true;
    setVoiceCaptureMessage("Listening now. Start speaking when you are ready.");
    setInterimTranscript("Listening...");

    try {
      setIsListening(true);
      recognitionRef.current.start();
    } catch {
      listeningActiveRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
      const message = "Voice input could not start. Please check microphone permissions and try again.";
      setVoiceCaptureMessage(message);
      toast.error(message);
    }
  };

  const toggleSpeech = () => {
    if (!speechSupported) {
      toast.error("Speech playback is not available in this browser.");
      return;
    }

    setSpeechEnabled(current => {
      const next = !current;
      if (!next && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 px-5 py-3 text-sm text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-md">
          <Loader2 className="size-4 animate-spin text-primary" />
          Preparing Flow Guru...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(94,106,255,0.18),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(108,79,255,0.12),_transparent_24%)]" />
        <main className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
          <section className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-white/6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Flow Guru</p>
            </div>
            <div className="px-4 py-8 sm:px-6">
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-[24px] bg-white/8 px-4 py-3 text-sm leading-7 text-foreground shadow-lg shadow-black/20">
                  <p>I’m ready whenever you are. Sign in, and I’ll keep the conversation with your account.</p>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 px-4 py-4 sm:px-6">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-inner shadow-black/20">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 rounded-[22px] bg-white/6 px-4 py-4 text-sm text-muted-foreground">
                    Sign in to begin a remembered, voice-enabled chat.
                  </div>
                  <Button asChild size="lg" className="h-12 rounded-full px-5 text-sm font-medium shadow-lg shadow-primary/20">
                    <a href={getLoginUrl()}>Sign in</a>
                  </Button>
                </div>
                {error && (
                  <p className="px-2 pt-3 text-sm text-destructive">Authentication could not be completed right now.</p>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(124,92,255,0.2),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(77,185,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(138,92,255,0.14),_transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.08]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        <section className="mx-auto flex h-full w-full max-w-5xl flex-1 flex-col gap-4 lg:gap-5">
          <header className="rounded-[32px] border border-white/12 bg-white/[0.065] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.26)] backdrop-blur-2xl sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-primary/80">Flow Guru</p>
                  <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[2rem]">
                      {user?.name ? `${user.name.split(" ")[0]}, stay in flow.` : "Stay in flow."}
                    </h1>
                    <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      A calmer command center for planning your day, checking what matters, and letting your assistant act without clutter.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {providerConnections.some(connection => connection.provider === "google-calendar" && connection.status === "connected")
                      ? "Calendar connected"
                      : "Calendar available"}
                  </span>
                  <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {speechSupported ? "Voice ready" : "Voice unavailable"}
                  </span>
                  <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {currentThreadId ? "Live thread active" : "Fresh chat ready"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start lg:self-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-full border border-white/12 bg-white/[0.06] text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.2)] hover:bg-white/[0.12] hover:text-foreground"
                  onClick={toggleSpeech}
                  aria-label={speechEnabled ? "Turn speech off" : "Turn speech on"}
                >
                  {speechEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-full border border-white/12 bg-white/[0.06] text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.2)] hover:bg-white/[0.12] hover:text-foreground"
                  onClick={() => logout()}
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="flex min-h-[72vh] flex-col overflow-hidden rounded-[36px] border border-white/12 bg-white/[0.07] shadow-[0_28px_100px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
              <div className="border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Conversation</p>
                    <p className="mt-1 text-sm text-foreground">Natural language requests, responses, and live action summaries.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      {displayedMessages.length} messages
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        hasPreparedFreshChatRef.current = true;
                        startFreshMutation.mutate();
                      }}
                      disabled={startFreshMutation.isPending || sendMutation.isPending}
                      className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:bg-white/[0.12] hover:text-foreground"
                    >
                      New chat
                    </Button>
                  </div>
                </div>
              </div>

              <div ref={messageViewportRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-7">
                {isPreparingFreshChat ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-muted-foreground shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      {startFreshMutation.isPending ? "Preparing a fresh chat..." : "Loading your conversation..."}
                    </div>
                  </div>
                ) : displayedMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
                    <div className="space-y-4">
                      <div className="mx-auto flex size-16 items-center justify-center rounded-[24px] border border-primary/20 bg-primary/12 text-primary shadow-[0_16px_50px_rgba(132,96,255,0.18)]">
                        <Sparkles className="size-7" />
                      </div>
                      <div className="space-y-3">
                        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Start a new conversation.</h2>
                        <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                          Your chat opens clean now. Type or speak a real request below, and Flow Guru will respond from the live conversation state.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/10 px-5 py-4 text-sm leading-7 text-muted-foreground">
                      Nothing is prefilled here. The first live request you send will define this thread.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-7">
                    {displayedMessages.map((message, index) => {
                      const isAssistant = message.role === "assistant";
                      const actionResult = actionResultsByMessageId[message.id];
                      const shouldHideDuplicatedActionCard =
                        isAssistant &&
                        (actionResult?.action === "calendar.create_event" ||
                          actionResult?.action === "calendar.list_events") &&
                        actionResult.status === "executed" &&
                        message.content.includes(actionResult.title) &&
                        message.content.includes(actionResult.summary);
                      return (
                        <div
                          key={`${message.id}-${index}`}
                          className={cn(
                            "flex animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
                            isAssistant ? "justify-start" : "justify-end",
                          )}
                        >
                          <div className={cn("max-w-[92%] space-y-2.5 sm:max-w-[82%]", isAssistant ? "items-start" : "items-end")}>
                            {isAssistant ? (
                              <p className="px-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Flow Guru</p>
                            ) : null}
                            <div
                              className={cn(
                                "rounded-[28px] px-4 py-3.5 text-sm leading-7 shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
                                isAssistant
                                  ? "border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] text-foreground"
                                  : "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_88%,white_12%),color-mix(in_oklab,var(--primary)_70%,black_8%))] text-primary-foreground",
                              )}
                            >
                              {isAssistant ? (
                                <div className="prose prose-sm max-w-none text-foreground prose-p:leading-7 prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-black/30 prose-a:text-primary">
                                  <Streamdown>{message.content}</Streamdown>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              )}
                            </div>
                            {isAssistant && actionResult && !shouldHideDuplicatedActionCard ? (
                              <ActionResultCard result={actionResult} />
                            ) : null}
                            <p className={cn("px-1 text-xs text-muted-foreground/90", isAssistant ? "text-left" : "text-right")}>
                              {formatRelativeTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {sendMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="max-w-[92%] space-y-2.5 sm:max-w-[82%]">
                          <p className="px-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Flow Guru</p>
                          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))] px-4 py-3.5 text-muted-foreground shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
                            <div className="flex items-center gap-3 text-sm">
                              <Loader2 className="size-4 animate-spin text-primary" />
                              Checking your latest request...
                            </div>
                          </div>
                          <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            If there’s live route, weather, or news data to fetch, I’m doing it in the background now.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 px-4 py-4 sm:px-6 sm:py-5">
                <div className="rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-2 pb-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      {currentThreadId ? `Thread ${currentThreadId}` : "Waiting for first request"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      {speechEnabled ? "Speech on" : "Speech off"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      {providerConnections.some(connection => connection.provider === "google-calendar" && connection.status === "connected")
                        ? "Calendar linked"
                        : "Calendar optional"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="min-w-0 flex-1 rounded-[24px] border border-white/8 bg-black/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <Textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleSend();
                          }
                        }}
                        rows={1}
                        placeholder="Ask naturally — plan, book, check, remember..."
                        className="min-h-[84px] resize-none border-0 bg-transparent px-4 py-4 text-base leading-7 text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                      />
                      <div className="flex flex-col gap-2 border-t border-white/8 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <p>
                          {recognitionSupported
                            ? isListening
                              ? interimTranscript || "Listening for your voice..."
                              : voiceCaptureMessage || "Mic ready when you want to talk."
                            : "Voice input depends on browser support"}
                        </p>
                        <p>
                          {speechSupported
                            ? isSpeakingReply
                              ? "Voice reply speaking now"
                              : speechEnabled
                                ? "Voice replies on"
                                : "Voice replies off"
                            : "Voice replies unavailable"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        onClick={toggleListening}
                        disabled={sendMutation.isPending || startFreshMutation.isPending || !recognitionSupported}
                        className={cn(
                          "size-13 rounded-full border transition duration-200",
                          isListening
                            ? "border-red-300/40 bg-red-500 text-white shadow-[0_18px_40px_rgba(239,68,68,0.35)] hover:bg-red-400"
                            : voiceCaptureMessage && recognitionSupported
                              ? "border-amber-300/30 bg-amber-500/90 text-amber-950 shadow-[0_18px_40px_rgba(245,158,11,0.25)] hover:bg-amber-400"
                              : "border-primary/20 bg-primary text-primary-foreground shadow-[0_18px_40px_rgba(132,96,255,0.28)] hover:bg-primary/90",
                        )}
                        aria-label={isListening ? "Stop voice input" : "Start voice input"}
                      >
                        {isListening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleSend()}
                        disabled={!draft.trim() || sendMutation.isPending || startFreshMutation.isPending}
                        className="size-13 rounded-full border border-white/12 bg-white/[0.08] text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] hover:bg-white/[0.14]"
                        aria-label="Send message"
                      >
                        {sendMutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[32px] border border-white/12 bg-white/[0.065] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Workspace status</p>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-foreground">Assistant controls</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Keep an eye on connections and interaction readiness while you work inside the conversation.
                </p>
                <div className="mt-5 space-y-3">
                  {providerConnections.length > 0 ? (
                    providerConnections.map(connection => (
                      <ProviderStatusPill
                        key={connection.provider}
                        connection={connection}
                        onConnect={handleConnectProvider}
                      />
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-sm text-muted-foreground">
                      No providers are connected yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/12 bg-white/[0.065] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Interaction</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Voice input</p>
                    <p className="mt-2 text-sm text-foreground">
                      {recognitionSupported
                        ? isListening
                          ? interimTranscript || "Listening for your next instruction."
                          : voiceCaptureMessage || "Ready when you want to talk."
                        : "This browser session does not support voice capture."}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Voice replies</p>
                    <p className="mt-2 text-sm text-foreground">
                      {speechSupported
                        ? isSpeakingReply
                          ? "A spoken reply is playing now."
                          : speechEnabled
                            ? "Spoken responses are enabled."
                            : "Spoken responses are currently muted."
                        : "Speech playback is unavailable in this browser session."}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
