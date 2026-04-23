import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Cloud, Calendar, Send, CheckCircle2, MessageSquarePlus, Music, Navigation, Newspaper, AlarmClock, ChevronRight, Pause, ArrowLeft } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";
import { MusicPlayer, type MusicPlayerHandle } from "@/components/MusicPlayer";
import { motion, AnimatePresence } from "framer-motion";

const WEATHER_CODE_LABELS: [number, string][] = [
  [1, "clear"], [3, "partly cloudy"], [48, "foggy"], [57, "drizzle"],
  [65, "rainy"], [77, "snowy"], [82, "rain showers"], [86, "snow showers"], [99, "thunderstorms"],
];
function weatherLabel(code: number): string {
  return WEATHER_CODE_LABELS.find(([max]) => code <= max)?.[1] ?? "unsettled";
}

interface Message {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  actionResult?: any;
}

function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
}

function getTodayKey() {
  const d = new Date();
  return `flow_guru_briefed_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function Home() {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<number | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');
  const [assistantName, setAssistantName] = useState('Flow Guru');
  const [weather, setWeather] = useState<any>(null);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard');
  const [briefingScript, setBriefingScript] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [nowPlayingLabel, setNowPlayingLabel] = useState<string | null>(null);
  const geoFetchedRef = useRef(false);
  const musicPlayerRef = useRef<MusicPlayerHandle>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bootstrap = trpc.assistant.bootstrap.useQuery(undefined, { enabled: true });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const data = bootstrap.data;
    if (!data) return;
    if (data.messages) setMessages(data.messages as Message[]);
    if (data.thread) setCurrentThreadId(data.thread.id);
    if (data.assistantName) setAssistantName(data.assistantName);
    if (data.weather) setWeather(data.weather);
    if (data.todayEvents) setTodayEvents(data.todayEvents);
    if (data.providerConnections) {
      const gcal = (data.providerConnections as any[]).find(c => c.provider === "google-calendar" && c.status === "connected");
      setIsGoogleConnected(!!gcal);
    }
  }, [bootstrap.data]);

  // Auto-geolocation: fetch weather client-side if bootstrap didn't return any
  useEffect(() => {
    if (bootstrap.isLoading) return;
    if (weather !== null) return;
    if (geoFetchedRef.current) return;
    if (!('geolocation' in navigator)) return;
    geoFetchedRef.current = true;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const [cityRes, wxRes] = await Promise.all([
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`),
        ]);
        const cityData = cityRes.ok ? await cityRes.json() : {};
        const wxData = wxRes.ok ? await wxRes.json() : {};
        const c = wxData.current;
        if (!c || c.temperature_2m == null) return;
        const cityName = cityData.city || cityData.locality || cityData.principalSubdivision || "Your location";
        setWeather({
          tempC: Math.round(c.temperature_2m),
          feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
          label: weatherLabel(c.weather_code ?? 99),
          locationName: cityName,
        });
      } catch { /* silent */ }
    }, () => { /* denied — no problem */ });
  }, [bootstrap.isLoading, weather]);

  // Auto-trigger morning briefing once per day on load
  useEffect(() => {
    if (!bootstrap.data) return;
    const hour = new Date().getHours();
    const isMorning = hour >= 5 && hour < 12;
    const alreadyBriefed = localStorage.getItem(getTodayKey()) === "1";
    if (isMorning && !alreadyBriefed && !briefingMutation.isPending) {
      setBriefingLoading(true);
      briefingMutation.mutate();
    }
  }, [bootstrap.data]);

  const startFreshMutation = trpc.assistant.startFresh.useMutation({
    onSuccess: (result) => {
      setMessages([]);
      setView('dashboard');
      if (result.thread) setCurrentThreadId(result.thread.id);
    },
    onError: (err) => toast.error("Failed to start new session")
  });

  const speakMutation = trpc.assistant.speak.useMutation({
    onSuccess: (result) => {
      const audio = new Audio(result.audioDataUri);
      audio.play().catch(() => {});
    },
  });

  const briefingMutation = trpc.assistant.briefing.useMutation({
    onSuccess: (result) => {
      setBriefingScript(result.script ?? null);
      setBriefingLoading(false);
      if (result.audioDataUri) {
        const audio = new Audio(result.audioDataUri);
        audio.play().catch(() => {});
      }
      localStorage.setItem(getTodayKey(), "1");
    },
    onError: () => setBriefingLoading(false),
  });

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: (result) => {
      setMessages(result.messages as Message[]);
      if (result.threadId) setCurrentThreadId(result.threadId);
      if (speechEnabled && result.reply) speakText(result.reply);
    },
    onError: (err) => {
      toast.error(err.message || "Something went wrong");
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages, sendMutation.isPending]);

  // Voice
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => handleSend(event.results[0][0].transcript);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, [currentThreadId]);

  const toggleListening = () => {
    if (!recognitionRef.current) { toast.error("Voice not supported."); return; }
    if (isListening) recognitionRef.current.stop();
    else { setIsListening(true); recognitionRef.current.start(); }
  };

  const handleSend = (text: string) => {
    if (!text.trim() || sendMutation.isPending) return;
    setInputValue('');
    setView('chat');
    sendMutation.mutate({
      message: text,
      threadId: currentThreadId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  };

  const speakText = (text: string) => {
    // Strip markdown and action-card noise before speaking
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    speakMutation.mutate(
      { text: clean },
      {
        onError: () => {
          // Fallback to browser TTS if ElevenLabs is unavailable
          if (!('speechSynthesis' in window)) return;
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(clean);
          utt.rate = 1.05;
          utt.pitch = 1.0;
          window.speechSynthesis.speak(utt);
        },
      }
    );
  };

  const formatEventTime = (iso: string | null, allDay: boolean) => {
    if (allDay || !iso) return "All day";
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return ""; }
  };

  const hour = currentTime.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";

  const handleConnectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar/start';
  };

  // Next upcoming event (first event with a future start time)
  const nextEvent = todayEvents.find(e => e.start && new Date(e.start).getTime() > Date.now());

  type QuickAction = {
    icon: React.ElementType;
    label: string;
    action: () => void;
  };

  const quickActions: QuickAction[] = hour < 12
    ? [
        { icon: Music, label: "Focus music", action: () => musicPlayerRef.current?.play("focus") },
        { icon: Navigation, label: "Traffic", action: () => handleSend("how's traffic to work?") },
        { icon: Newspaper, label: "Top news", action: () => handleSend("what's in the news?") },
        { icon: Calendar, label: "My day", action: () => handleSend("what's on my calendar today?") },
      ]
    : hour < 17
    ? [
        { icon: Navigation, label: "Traffic home", action: () => handleSend("how's traffic home?") },
        { icon: Calendar, label: "This afternoon", action: () => handleSend("what do I have this afternoon?") },
        { icon: Newspaper, label: "Top news", action: () => handleSend("what's happening in the news?") },
        { icon: Music, label: "Focus music", action: () => musicPlayerRef.current?.play("focus") },
      ]
    : [
        { icon: Music, label: "Wind down", action: () => musicPlayerRef.current?.play("sleep") },
        { icon: Calendar, label: "Tomorrow", action: () => handleSend("what's on my calendar tomorrow?") },
        { icon: Newspaper, label: "Top news", action: () => handleSend("what's in the news tonight?") },
        { icon: AlarmClock, label: "Set reminder", action: () => handleSend("set a reminder for me") },
      ];

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#0047FF] to-[#00F0FF] opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'
          }}
        />
      </div>

      {/* Header */}
      <header className="px-6 pt-5 pb-3 flex justify-between items-center z-50">
        <motion.div 
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles className="text-blue-500 w-6 h-6 animate-pulse" />
          <h1 className="text-lg font-bold tracking-tighter uppercase">{assistantName}</h1>
        </motion.div>
        
        <motion.div 
          className="flex items-center gap-2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Connection Status Badge */}
          {isGoogleConnected ? (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
              <CheckCircle2 size={12} />
              <span>Calendar connected</span>
            </div>
          ) : (
            <button 
              onClick={handleConnectCalendar}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 border border-white/10 hover:border-blue-500/50 hover:bg-zinc-800 transition-all text-zinc-300 text-xs font-medium"
            >
              <Calendar size={12} />
              <span>Connect Calendar</span>
            </button>
          )}

          {view === 'chat' && (
            <>
              <button
                onClick={() => setView('dashboard')}
                title="Back to Home"
                className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-white/10 transition-all shadow-sm text-zinc-300 hover:text-white"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                onClick={() => startFreshMutation.mutate()}
                title="New Chat"
                className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-white/10 transition-all shadow-sm text-zinc-300 hover:text-white"
              >
                {startFreshMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
              </button>
            </>
          )}

          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className={cn(
              "w-9 h-9 rounded-full border flex items-center justify-center backdrop-blur-md transition-all shadow-sm",
              speakMutation.isPending
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-white/10 bg-black/50 hover:bg-white/10 text-zinc-400"
            )}>
            {speakMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={() => logout()}
            className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-red-500/10 hover:border-red-500/30 transition-all text-zinc-400 hover:text-red-400 shadow-sm">
            <LogOut size={14} />
          </button>
        </motion.div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-5 scrollbar-hide z-10">
        <div className="max-w-2xl mx-auto pb-36">

          {/* Dashboard */}
          <AnimatePresence>
            {view === 'dashboard' && (
              <motion.div
                className="pt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* Time & Greeting */}
                <div className="mb-7">
                  <motion.p
                    className="text-[4rem] font-bold tracking-tighter leading-none mb-1 tabular-nums"
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ delay: 0.1, duration: 0.7 }}
                  >
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </motion.p>
                  <motion.h2
                    className="text-xl font-semibold tracking-tight text-zinc-300 ml-0.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                  >
                    {greeting}, <span className="text-white">{userName}</span>
                  </motion.h2>
                </div>

                {/* Morning briefing card */}
                <AnimatePresence>
                  {(briefingLoading || briefingScript) && (
                    <motion.div
                      className="mb-5 bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-3xl p-5 backdrop-blur-xl"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Morning Briefing</span>
                        {briefingLoading && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin ml-auto" />}
                      </div>
                      {briefingScript ? (
                        <p className="text-[14px] text-zinc-300 leading-relaxed">{briefingScript}</p>
                      ) : (
                        <div className="h-10 flex items-center">
                          <div className="flex gap-1.5">
                            {[0, 0.15, 0.3].map((delay, i) => (
                              <motion.div key={i} className="w-1.5 h-1.5 bg-blue-400/60 rounded-full"
                                animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.7, delay }} />
                            ))}
                          </div>
                          <span className="text-sm text-zinc-500 ml-3">Preparing your briefing…</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Situation panel */}
                <motion.div
                  className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden mb-5 shadow-2xl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {/* Weather strip */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <Cloud className="w-4 h-4 text-blue-400 shrink-0" />
                      {weather ? (
                        <div>
                          <span className="text-white font-semibold text-[15px]">{weather.tempC}°C</span>
                          <span className="text-zinc-500 text-[13px] ml-2 capitalize">{weather.label}</span>
                          <span className="text-zinc-600 text-[12px] ml-1">· feels {weather.feelsLikeC}°</span>
                        </div>
                      ) : bootstrap.isLoading ? (
                        <span className="text-zinc-600 text-sm">Loading…</span>
                      ) : (
                        <span className="text-zinc-500 text-sm">Tell me your city to see weather</span>
                      )}
                    </div>
                    {weather && (
                      <span className="text-[11px] text-zinc-600 font-medium">{weather.locationName}</span>
                    )}
                  </div>

                  {/* Next event strip */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Calendar className="w-4 h-4 text-green-400 shrink-0" />
                      {!isGoogleConnected ? (
                        <button onClick={handleConnectCalendar} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                          Connect Google Calendar →
                        </button>
                      ) : nextEvent ? (
                        <div className="overflow-hidden">
                          <p className="text-white text-[14px] font-medium truncate">{nextEvent.title}</p>
                          <p className="text-zinc-500 text-[12px]">{formatEventTime(nextEvent.start, nextEvent.allDay)}</p>
                        </div>
                      ) : todayEvents.length > 0 ? (
                        <span className="text-zinc-400 text-sm">All done for today</span>
                      ) : (
                        <span className="text-zinc-500 text-sm">Nothing scheduled today</span>
                      )}
                    </div>
                    {nextEvent && (
                      <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full shrink-0 ml-3">
                        {formatCountdown(nextEvent.start)}
                      </span>
                    )}
                  </div>
                </motion.div>

                {/* Music player */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42 }}
                  className="mb-5"
                >
                  <MusicPlayer
                    ref={musicPlayerRef}
                    onStateChange={(playing, label) => setNowPlayingLabel(playing ? label : null)}
                  />
                </motion.div>

                {/* Quick-action chips */}
                <motion.div
                  className="grid grid-cols-2 gap-2.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.52 }}
                >
                  {quickActions.map((action, idx) => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.label}
                        onClick={action.action}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.56 + idx * 0.07 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-3 bg-white/4 hover:bg-white/8 border border-white/5 hover:border-white/10 rounded-2xl px-4 py-3.5 text-left transition-all group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-white/10 transition-colors">
                          <Icon className="w-4 h-4 text-zinc-300" />
                        </div>
                        <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{action.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 ml-auto group-hover:text-zinc-400 transition-colors" />
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          {view === 'chat' && (
            <div className="space-y-6 pt-6">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div 
                    key={message.id} 
                    className={cn("flex flex-col gap-2", message.role === 'user' ? "items-end" : "items-start")}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    <div className={cn(
                      "px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed max-w-[85%] shadow-sm",
                      message.role === 'user'
                        ? "bg-gradient-to-tr from-blue-600 to-blue-500 text-white rounded-tr-sm shadow-blue-500/20"
                        : "bg-zinc-900/80 backdrop-blur-xl text-zinc-100 rounded-tl-sm border border-white/5"
                    )}>
                      {message.content}
                    </div>
                    {message.actionResult && message.actionResult.action !== 'none' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-1 w-full max-w-[85%]"
                      >
                        <ActionResultCard result={message.actionResult} />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
                {sendMutation.isPending && (
                  <motion.div 
                    className="flex justify-start"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="bg-zinc-900/80 backdrop-blur-xl px-5 py-4 rounded-3xl rounded-tl-sm border border-white/5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <motion.div className="w-1.5 h-1.5 bg-blue-500 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
                          <motion.div className="w-1.5 h-1.5 bg-blue-500 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
                          <motion.div className="w-1.5 h-1.5 bg-blue-500 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} />
                        </div>
                        <span className="text-[13px] text-zinc-400 font-medium">Processing...</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>
      </main>

      {/* Input bar */}
      <footer className="p-4 pb-6 bg-gradient-to-t from-black via-black/95 to-transparent absolute bottom-0 left-0 right-0 z-50">
        {/* Mini music player — visible in chat mode when something is playing */}
        <AnimatePresence>
          {nowPlayingLabel && view === 'chat' && (
            <motion.div
              className="max-w-2xl mx-auto mb-2 flex items-center gap-3 bg-zinc-900/80 backdrop-blur-xl border border-white/8 rounded-2xl px-4 py-2.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div className="flex gap-[3px] items-end h-3 shrink-0">
                {[0, 0.12, 0.24].map((delay, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] bg-blue-400 rounded-full"
                    style={{ height: 3 }}
                    animate={{ height: [3, 10, 3] }}
                    transition={{ repeat: Infinity, duration: 0.55, delay, ease: "easeInOut" }}
                  />
                ))}
              </div>
              <Music size={12} className="text-blue-400 shrink-0" />
              <span className="text-xs text-zinc-400 flex-1 truncate font-medium">{nowPlayingLabel} · SomaFM</span>
              <button
                onClick={() => musicPlayerRef.current?.pause()}
                className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 transition-colors shrink-0"
                title="Stop music"
              >
                <Pause size={10} />
              </button>
              <button
                onClick={() => setView('dashboard')}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Open player →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="max-w-2xl mx-auto flex items-end gap-3"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
        >
          <div className="flex-1 relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-[28px] blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask me anything..."
              className="relative w-full bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-[24px] px-6 py-4 text-[15px] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-500 shadow-2xl"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputValue); }}
            />
          </div>
          
          <AnimatePresence mode="popLayout">
            {inputValue.trim() ? (
              <motion.button 
                key="send"
                onClick={() => handleSend(inputValue)}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-[56px] h-[56px] rounded-[24px] bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white shrink-0"
              >
                <Send size={20} className="ml-1" />
              </motion.button>
            ) : (
              <motion.div 
                key="mic"
                className="relative flex items-center justify-center shrink-0"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
              >
                {isListening && (
                  <motion.div 
                    className="absolute inset-0 bg-red-500/30 rounded-[24px]"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
                <motion.button 
                  onClick={toggleListening}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "relative w-[56px] h-[56px] rounded-[24px] flex items-center justify-center transition-colors shadow-lg z-10",
                    isListening 
                      ? "bg-red-500 text-white shadow-red-500/30" 
                      : "bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white"
                  )}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </footer>
    </div>
  );
}
