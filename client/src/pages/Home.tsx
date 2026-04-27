import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Cloud, Calendar, Send, Settings, CheckCircle2, MessageSquarePlus, User, UserRound, Newspaper, ListTodo, BrainCircuit, MapPin, Globe } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";
import { motion, AnimatePresence } from "framer-motion";
import { OrbVisualizer } from "@/components/OrbVisualizer";
import { AuthModal } from "@/components/AuthModal";
import { useLocation } from "wouter";
import { MusicPlayer } from "@/components/MusicPlayer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WeatherForecastModal } from "@/components/WeatherForecastModal";
import { NewsModal } from "@/components/NewsModal";
import { useReminders } from "@/hooks/useReminders";
import { prewarmAudio } from "@/hooks/useAlarmSound";
import { OnboardingFlow } from "@/components/OnboardingFlow";

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

const SUGGESTIONS: TranslationKeys[] = [
  "suggest_calendar",
  "suggest_weather",
  "suggest_briefing",
];

export default function Home() {
  const [, navigate] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const { user, logout } = useAuth({ redirectOnUnauthenticated: false });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const resetToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('reset_token') || undefined : undefined;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<number | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');
  const [assistantName, setAssistantName] = useState('FLO GURU');
  const [weather, setWeather] = useState<any>(null);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [memoryFacts, setMemoryFacts] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState('');
  const [showForecast, setShowForecast] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [showNews, setShowNews] = useState(false);
  const [countryCode, setCountryCode] = useState<string>('us');
  // Guest mode: track how many messages sent without an account
  const [guestMessageCount, setGuestMessageCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('guest_msg_count') || '0', 10);
  });
  const [showSignInBanner, setShowSignInBanner] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('floguru_onboarded');
  });
  const [wakeUpTime, setWakeUpTime] = useState<string | null>(null);
  const [alarmDays, setAlarmDays] = useState<string>('0,1,2,3,4,5,6');
  const [alarmSound, setAlarmSound] = useState<import('@/hooks/useAlarmSound').AlarmSoundType>(() => {
    return (localStorage.getItem('alarmSound') as import('@/hooks/useAlarmSound').AlarmSoundType) || 'chime';
  });
  // ElevenLabs free default voices (no paid plan required)
  const VOICE_IDS = {
    male: 'nPczCjzI2devNBz1zQrb',   // Brian — warm, natural, conversational male
    female: 'EXAVITQu4vr4xnSDxMaL',  // Sarah — calm, natural female
  };
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>(() => {
    return (localStorage.getItem('voiceGender') as 'male' | 'female') || 'male';
  });
  // Use a ref so speakText always reads the latest voiceGender without stale closures
  const voiceGenderRef = useRef<'male' | 'female'>(voiceGender);
  useEffect(() => { voiceGenderRef.current = voiceGender; }, [voiceGender]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const geoFetchedRef = useRef(false);

  // Load wake-up time and alarm sound from profile for reminders
  const utils = trpc.useUtils();
  const profileQuery = trpc.settings.getProfile.useQuery(undefined);

  useEffect(() => {
    const data = profileQuery.data as any;
    if (!data) return;
    if (data.wakeUpTime) setWakeUpTime(data.wakeUpTime);
    if (data.alarmSound) {
      setAlarmSound(data.alarmSound as import('@/hooks/useAlarmSound').AlarmSoundType);
      localStorage.setItem('alarmSound', data.alarmSound);
    }
    if (data.alarmDays) setAlarmDays(data.alarmDays);
  }, [profileQuery.data]);

  const bootstrap = trpc.assistant.bootstrap.useQuery({ language }, { enabled: true });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-warm AudioContext on first user interaction so alarm sounds can play without gesture
  useEffect(() => {
    const unlock = () => { prewarmAudio(); window.removeEventListener('click', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('touchstart', unlock); };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => { window.removeEventListener('click', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('touchstart', unlock); };
  }, []);

  const addMemoryFactMutation = trpc.settings.addMemoryFact.useMutation();

  // Auto-geolocation: fetch weather client-side if bootstrap didn't return any
  useEffect(() => {
    if (bootstrap.isLoading) return;
    if (weather !== null) return;
    if (geoFetchedRef.current) return;
    if (!('geolocation' in navigator)) return;
    
    geoFetchedRef.current = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lon: longitude });
      try {
        const [cityRes, wxRes] = await Promise.all([
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`),
        ]);
        const cityData = cityRes.ok ? await cityRes.json() : {};
        const wxData = wxRes.ok ? await wxRes.json() : {};
        const c = wxData.current;
        if (!c || c.temperature_2m == null) return;
        
        const cityName = cityData.city || cityData.locality || cityData.principalSubdivision || 'Your location';
        
        // --- Persistence: Save to user memory so server knows it next time ---
        if (user && cityName !== 'Your location') {
          addMemoryFactMutation.mutate({
            factKey: 'home_location',
            factValue: cityName,
            category: 'preference'
          });
        }
        
        if (cityData.countryCode) setCountryCode(cityData.countryCode.toLowerCase());
        setWeather({
          tempC: Math.round(c.temperature_2m),
          feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
          label: weatherLabel(c.weather_code ?? 99),
          locationName: cityName,
        });
      } catch { /* silent */ }
    }, (err) => { 
      console.warn("Geolocation failed", err);
      // We don't reset geoFetchedRef here to avoid infinite loops if it's permanently denied
    });
  }, [bootstrap.isLoading, weather, user]);

  useEffect(() => {
    const data = bootstrap.data;
    if (!data) return;
    if (data.messages) setMessages(data.messages as Message[]);
    if (data.thread) setCurrentThreadId(data.thread.id);
    if (data.assistantName) setAssistantName(data.assistantName);
    if (data.weather) {
      setWeather(data.weather as any);
    }
    if (data.todayEvents) setTodayEvents(data.todayEvents);
    if (data.memoryFacts) setMemoryFacts(data.memoryFacts);
    if (data.providerConnections) {
      const gcal = (data.providerConnections as any[]).find(c => c.provider === "google-calendar" && c.status === "connected");
      setIsGoogleConnected(!!gcal);
    }
    if (data.proactiveGreeting && (!data.messages || data.messages.length === 0) && messages.length === 0) {
      const greetingMsg: Message = { id: 'proactive', role: 'assistant', content: data.proactiveGreeting };
      setMessages([greetingMsg]);
      if (speechEnabled) speakText(data.proactiveGreeting);
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

  // Streaming endpoint replaced speakMutation
  const playAudioStream = (url: string, cleanText: string) => {
    const audio = new Audio(url);
    audio.onended = () => setIsSpeaking(false);
    audio.onerror = () => {
      setIsSpeaking(false);
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.rate = 1.05;
      utt.pitch = 1.0;
      window.speechSynthesis.speak(utt);
    };
    audio.play().catch(() => {
      setIsSpeaking(false);
      // Fallback
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.rate = 1.05;
      utt.pitch = 1.0;
      window.speechSynthesis.speak(utt);
    });
  };

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: (result) => {
      setMessages(result.messages as Message[]);
      if (result.threadId) setCurrentThreadId(result.threadId);
      if (result.actionResult?.action === 'list.manage' && result.actionResult.status === 'executed') {
        void utils.list.all.invalidate();
        void utils.list.items.invalidate();
        void utils.assistant.bootstrap.invalidate({ language });
      }
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
      recognition.lang = language === 'en' ? 'en-US' : 'fr-FR';
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

    // Track guest usage and show sign-in nudge after 5 messages
    if (!user) {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      localStorage.setItem('guest_msg_count', String(newCount));
      if (newCount >= 5 && newCount % 5 === 0) {
        setShowSignInBanner(true);
      }
    }
    
    // If starting from dashboard, trigger a new backend thread
    const startsFresh = view === 'dashboard';

    setInputValue('');
    setView('chat');

    if (startsFresh) {
      setMessages([]);
    }

    sendMutation.mutate({
      message: text,
      threadId: startsFresh ? undefined : currentThreadId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language
    });
  };

  const speakText = (text: string) => {
    if (!speechEnabled) return;
    // Strip markdown before speaking
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    setIsSpeaking(true);
    
    const profileVoiceId = (profileQuery.data as any)?.voiceId;
    const finalVoiceId = profileVoiceId || VOICE_IDS[voiceGenderRef.current];
    
    const url = `/api/speak?text=${encodeURIComponent(clean)}&voiceId=${finalVoiceId}`;
    playAudioStream(url, clean);
  };

  const formatEventTime = (iso: string | null, allDay: boolean) => {
    if (allDay || !iso) return t('calendar_all_day');
    try {
      return new Date(iso).toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', { hour: "numeric", minute: "2-digit", hour12: language === 'en' });
    } catch { return ""; }
  };

  // Live query for today's local events (refreshes when calendar changes)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const todayLocalEventsQuery = trpc.calendar.list.useQuery(
    { startAt: todayStart.toISOString(), endAt: todayEnd.toISOString() },
    { refetchInterval: 60000, staleTime: 30000 }
  );

  // Fetch real Google Calendar events via API
  const [googleCalEvents, setGoogleCalEvents] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    const fetchGcal = async () => {
      try {
        const resp = await fetch('/api/integrations/google-calendar/events', { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (!cancelled && data.connected && data.events) {
            setGoogleCalEvents(data.events.map((e: any) => ({
              title: e.summary,
              start: e.startISO,
              allDay: e.allDay,
              color: 'blue',
              source: 'google',
            })));
            setIsGoogleConnected(true);
          }
        }
      } catch { /* silent */ }
    };
    fetchGcal();
    const interval = setInterval(fetchGcal, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Merge local events + Google Calendar events
  const liveLocalEvents = (todayLocalEventsQuery.data ?? []).map((e: any) => ({
    title: e.title,
    start: e.startAt ? new Date(e.startAt).toISOString() : null,
    allDay: Boolean(e.allDay),
    color: e.color ?? 'blue',
    source: 'local',
  }));
  // Combine: live local events + Google Calendar events (real API), deduplicate by title+start
  const bootstrapGoogleEvents = todayEvents.filter((e: any) => !liveLocalEvents.some((l: any) => l.title === e.title && l.start === e.start));
  const mergedGoogleEvents = googleCalEvents.length > 0 ? googleCalEvents : bootstrapGoogleEvents;
  const dedupedGoogle = mergedGoogleEvents.filter((e: any) => !liveLocalEvents.some((l: any) => l.title === e.title && l.start === e.start));
  const allTodayEvents = [...liveLocalEvents, ...dedupedGoogle].sort((a: any, b: any) => {
    if (!a.start) return 1; if (!b.start) return -1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  const EVENT_COLOR_MAP: Record<string, string> = {
    blue: 'bg-amber-700',    // Cognac leather
    green: 'bg-amber-800',   // Saddle leather
    red: 'bg-rose-900',      // Burgundy leather
    yellow: 'bg-amber-500',  // Amber leather
    purple: 'bg-stone-600',  // Dusty rose leather
    pink: 'bg-rose-800',     // Blush tan leather
    orange: 'bg-amber-600',  // Warm tan leather
    teal: 'bg-stone-500',    // Slate leather
  };

  const greeting = language === 'en'
    ? (currentTime.getHours() < 12 ? "Good morning" : currentTime.getHours() < 17 ? "Good afternoon" : "Good evening")
    : (currentTime.getHours() < 12 ? "Bonjour" : currentTime.getHours() < 17 ? "Bon après-midi" : "Bonsoir");
  const userName = user?.name?.split(' ')[0] || "Brandon";

  // AI reminders — checks calendar events and wake-up time every minute
  const handleBriefing = async () => {
    toast.promise(utils.assistant.getBriefing.fetch(), {
      loading: t('briefing_loading'),
      success: (data) => {
        const calCount = data.calendar.length;
        const listCount = data.lists.reduce((acc, l) => acc + l.items.length, 0);
        const w = data.weather;
        
        let prompt = (language === 'en' ? `Good morning, ${data.userName}! I'm ${data.assistantName}, and I've got your briefing ready. ` : `Bonjour, ${data.userName} ! Je suis ${data.assistantName}, et j'ai préparé votre briefing. `);
        
        if (w) {
          const weatherAny = w as any;
          const temp = Math.round(weatherAny.current?.temperatureC || weatherAny.tempC || 0);
          const label = weatherAny.current?.weatherLabel || weatherAny.label || (language === 'en' ? 'fair' : 'beau');
          const loc = weatherAny.location || weatherAny.locationName || (language === 'en' ? 'your area' : 'votre région');
          prompt += t('briefing_weather').replace('{temp}', temp.toString()).replace('{label}', label).replace('{location}', loc) + ' ';
        }
        
        if (calCount > 0) {
          prompt += t('briefing_events').replace('{count}', calCount.toString()).replace('{s}', calCount > 1 ? 's' : '') + ' ';
        } else {
          prompt += t('briefing_clear') + ' ';
        }
        
        if (listCount > 0) {
          prompt += t('briefing_tasks').replace('{count}', listCount.toString()).replace('{s}', listCount > 1 ? 's' : '') + ' ';
        }
        
        prompt += t('briefing_start');
        
        speakText(prompt);
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: prompt }]);
        return t('briefing_success');
      },
      error: t('briefing_error'),
    });
  };

  const { alarmState, dismissAlarm, snoozeAlarm } = useReminders({
    enabled: speechEnabled,
    userName,
    wakeUpTime,
    speakText,
    voiceGender,
    alarmSound,
    alarmDays,
    onWakeUp: handleBriefing,
  });

  const handleConnectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar/start';
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-['Outfit'] selection:bg-primary/30 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <motion.div
          animate={{
            backgroundColor: isListening ? '#EF4444' : sendMutation.isPending ? 'var(--primary)' : isSpeaking ? '#22C55E' : 'var(--primary)',
            opacity: [0.05, 0.1, 0.05],
          }}
          transition={{ duration: 1 }}
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-accent opacity-10 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'
          }}
        />
      </div>

      {/* Header */}
      <header className="px-4 sm:px-6 pt-5 pb-3 flex justify-between items-center z-50">
        <motion.div 
          className="flex items-center gap-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <img src="/floguru-logo.png" alt="FLO GURU" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-sm" />
          <h1 className="text-base sm:text-lg font-bold tracking-tighter uppercase">
            FLO GURU
            <span className="sr-only"> - Your Autonomous AI Lifestyle Companion</span>
          </h1>
        </motion.div>
        
        <motion.div 
          className="flex items-center gap-1.5 sm:gap-2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="hidden md:flex gap-1.5 mr-2">
            {isGoogleConnected && <Calendar className="w-3.5 h-3.5 text-primary/60" />}
          </div>

          {view === 'chat' && (
            <button 
              onClick={() => startFreshMutation.mutate()}
              title="Start New Session"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground"
            >
              {startFreshMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            </button>
          )}

          <button
            onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-primary font-bold text-[10px] sm:text-[11px]"
            title={language === 'en' ? 'Passer en français' : 'Switch to English'}
          >
            {language.toUpperCase()}
          </button>

          <button onClick={() => navigate("/calendar")}
            title={t('nav_calendar')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground">
            <Calendar size={14} />
          </button>

          <ThemeToggle />

          <button
            onClick={() => {
              const next = voiceGender === 'male' ? 'female' : 'male';
              setVoiceGender(next);
              localStorage.setItem('voiceGender', next);
              const msg = language === 'en' 
                ? `Voice switched to ${next === 'male' ? 'Brian' : 'Sarah'}`
                : `Voix changée pour ${next === 'male' ? 'Brian' : 'Sarah'}`;
              toast.success(msg);
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground"
          >
            {voiceGender === 'male' ? <User size={14} /> : <UserRound size={14} />}
          </button>
          
          <button onClick={() => navigate("/lists")}
            title={t('nav_lists')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground">
            <ListTodo size={14} />
          </button>

          <button onClick={() => navigate('/settings')}
            title={t('nav_settings')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground">
            <Settings size={14} />
          </button>

          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm">
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          {user ? (
            <button onClick={() => logout()}
              title={t('nav_sign_out')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-destructive/10 hover:border-destructive/30 transition-all text-muted-foreground hover:text-destructive shadow-sm">
              <LogOut size={14} />
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 h-8 sm:h-9 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-all text-primary text-[10px] sm:text-xs font-semibold shadow-sm">
              <User size={12} />
              <span className="hidden xs:inline">{t('nav_sign_in')}</span>
            </button>
          )}
        </motion.div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-5 scrollbar-hide z-10">
        <div className="max-w-2xl mx-auto pb-36">

          {/* Dashboard */}
          <AnimatePresence>
            {view === 'dashboard' && (
              <motion.div 
                className="pt-4 sm:pt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                 {/* FLO GURU Logo with gold leather glow */}
                <div className="flex justify-center" style={{ marginBottom: '2.5rem', paddingBottom: '0.5rem' }}>
                  <div className="relative flex items-center justify-center" style={{ width: '180px', height: '180px' }}>
                    {/* Wide outermost gold halo */}
                    <div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: '180px', height: '180px',
                        background: 'radial-gradient(circle, rgba(212,160,23,0.45) 0%, rgba(180,120,10,0.25) 40%, transparent 70%)',
                        filter: 'blur(24px)',
                        animation: 'pulse 3s ease-in-out infinite',
                      }}
                    />
                    {/* Mid gold ring glow */}
                    <div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: '140px', height: '140px',
                        background: 'radial-gradient(circle, rgba(255,200,50,0.55) 0%, rgba(210,150,20,0.35) 45%, transparent 70%)',
                        filter: 'blur(14px)',
                      }}
                    />
                    {/* Inner tight gold corona */}
                    <div
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: '110px', height: '110px',
                        background: 'radial-gradient(circle, rgba(255,220,80,0.70) 0%, rgba(220,170,30,0.45) 50%, transparent 70%)',
                        filter: 'blur(6px)',
                      }}
                    />
                    {/* Gold shimmer ring — only when AI is thinking */}
                    {sendMutation.isPending && (
                      <motion.div
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          width: '124px', height: '124px',
                          border: '2px solid transparent',
                          background: 'linear-gradient(#1a1208, #1a1208) padding-box, conic-gradient(from 0deg, rgba(255,220,80,0.9), rgba(212,160,23,0.4), rgba(255,220,80,0.9)) border-box',
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                      />
                    )}
                    {/* Logo */}
                    <motion.img
                      src="/floguru-logo.png"
                      alt="FLO GURU"
                      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover"
                      style={{ boxShadow: sendMutation.isPending ? '0 0 32px 12px rgba(255,220,80,0.7), 0 0 60px 20px rgba(180,120,10,0.45)' : '0 0 24px 8px rgba(212,160,23,0.6), 0 0 48px 16px rgba(180,120,10,0.35)' }}
                      animate={{
                        scale: isListening ? 1.08 : sendMutation.isPending ? [1, 1.04, 1] : isSpeaking ? [1, 1.05, 1] : 1,
                        rotate: sendMutation.isPending ? [0, 2, -2, 0] : 0,
                      }}
                      transition={{
                        scale: { duration: 0.3 },
                        rotate: sendMutation.isPending ? { repeat: Infinity, duration: 0.8 } : { duration: 0.3 },
                      }}
                    />
                  </div>
                </div>
                {/* Time & Greeting */}
                <div className="mb-6 sm:mb-8 text-center sm:text-left">
                  <motion.h3 
                    className="text-5xl sm:text-[4rem] font-bold tracking-tighter leading-none mb-2 tabular-nums"
                    initial={{ opacity: 0, filter: "blur(10px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ delay: 0.1, duration: 0.8 }}
                  >
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </motion.h3>
                  <motion.h2 
                    className="text-xl sm:text-2xl font-semibold tracking-tight text-muted-foreground ml-0 sm:ml-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {greeting}, <span className="text-foreground">{userName}</span>
                  </motion.h2>
                </div>

                {/* Live cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-8">
                  {/* Weather Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer leather-glow" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                    onClick={() => weather && setShowForecast(true)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <Cloud className="w-4 h-4 text-primary" />
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">{weather?.locationName || t('card_weather_title')}</span>
                    </div>
                    {weather ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl sm:text-4xl font-bold tracking-tight">{weather.tempC}°</p>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground capitalize mt-1 font-medium">{weather.label} <span className="text-border">•</span> {language === 'en' ? 'Feels like' : 'Ressenti'} {weather.feelsLikeC}°</p>
                        <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-primary mt-2">{t('card_weather_forecast')} →</p>
                      </>
                    ) : (
                      <div className="h-16 flex items-center justify-between bg-primary/5 rounded-2xl px-4 border border-primary/10 cursor-pointer group/loc" 
                           onClick={(e) => {
                             e.stopPropagation();
                             geoFetchedRef.current = false;
                             setWeather(null);
                             // This triggers the useEffect for auto-geolocation
                           }}>
                        <div className="flex flex-col justify-center">
                          <p className="text-xs font-bold text-primary">{t('card_weather_detect')}</p>
                          <p className="text-[9px] text-muted-foreground">{t('card_weather_sync')}</p>
                        </div>
                        <motion.div 
                          className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary"
                          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <MapPin size={18} />
                        </motion.div>
                      </div>
                    )}
                  </motion.div>

                  {/* Calendar Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer leather-glow" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => navigate("/calendar")}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('card_calendar_today')}</span>
                      </div>
                      <button
                        className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[9px] sm:text-[10px] uppercase font-bold tracking-wider hover:bg-primary/20 transition-colors"
                        onClick={(e) => {
                          if (isGoogleConnected) {
                            e.stopPropagation();
                            window.open('https://calendar.google.com/calendar/u/0/r', '_blank');
                          }
                        }}
                      >
                        {isGoogleConnected ? t('card_calendar_open_google') : t('card_calendar_open')}
                      </button>
                    </div>
                    
                    {allTodayEvents.length > 0 ? (
                      <div className="space-y-2 sm:space-y-2.5 mt-1 sm:mt-2">
                        {allTodayEvents.slice(0, 4).map((e: any, i: number) => (
                          <div key={i} className="flex items-center justify-between group/event">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0", EVENT_COLOR_MAP[e.color] ?? 'bg-primary/50')} />
                              <p className="text-xs sm:text-sm font-medium truncate text-foreground group-hover/event:text-primary transition-colors">{e.title}</p>
                            </div>
                            <p className="text-[10px] sm:text-xs text-muted-foreground shrink-0 font-medium ml-2">{formatEventTime(e.start, e.allDay)}</p>
                          </div>
                        ))}
                        {allTodayEvents.length > 4 && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground pt-0.5">+{allTodayEvents.length - 4} {language === 'en' ? 'more' : 'de plus'}</p>
                        )}
                      </div>
                    ) : (
                      <div className="h-14 flex flex-col justify-center">
                        <p className="text-sm sm:text-[15px] font-medium text-foreground">{t('card_calendar_clear')}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{t('card_calendar_no_events')}</p>
                      </div>
                    )}
                  </motion.div>

                  {/* News Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer leather-glow" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    onClick={() => setShowNews(true)}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <Newspaper className="w-4 h-4 text-primary" />
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('card_news_title')}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{language === 'en' ? "Today's Headlines" : "Titres du jour"}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{language === 'en' ? 'General · Tech · Business' : 'Général · Tech · Affaires'}</p>
                    <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-primary mt-3">{t('card_news_tap')} →</p>
                  </motion.div>

                  {/* Lists Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer leather-glow" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 }}
                    onClick={() => navigate("/lists")}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <ListTodo className="w-4 h-4 text-primary" />
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('card_lists_title')}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{language === 'en' ? 'Groceries & Todos' : 'Courses & Tâches'}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{language === 'en' ? 'Organize your day' : 'Organisez votre journée'}</p>
                    <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-primary mt-3">{language === 'en' ? 'View all' : 'Voir tout'} →</p>
                  </motion.div>

                  {/* Music Player Card */}
                  <motion.div
                    className="sm:col-span-1 leather-glow"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <MusicPlayer 
                      onStateChange={(playing, label) => {
                        setMusicPlaying(playing);
                        setCurrentStation(label);
                      }} 
                    />
                  </motion.div>

                  {/* Memory Spark Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer leather-glow" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E')", backgroundBlendMode: "overlay" }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.75 }}
                    onClick={() => navigate("/settings")}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-2 sm:mb-3">
                      <BrainCircuit className="w-4 h-4 text-primary" />
                      <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">{language === 'en' ? 'Memory Spark' : 'Étincelle de Mémoire'}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{language === 'en' ? 'AI Knowledge' : 'Connaissance IA'}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                      {language === 'en' 
                        ? <>Flow Guru has learned <span className="text-primary font-bold">{bootstrap.data?.memoryFacts?.length || 0}</span> facts about you.</>
                        : <>Flow Guru a appris <span className="text-primary font-bold">{bootstrap.data?.memoryFacts?.length || 0}</span> faits sur vous.</>}
                    </p>
                    <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-primary mt-3">{language === 'en' ? 'Manage Memories' : 'Gérer les mémoires'} →</p>
                  </motion.div>
                </div>

                {/* Suggestion chips */}
                <motion.div 
                  className="flex flex-wrap gap-2 sm:gap-2.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {SUGGESTIONS.map((s, idx) => (
                    <motion.button 
                      key={s} 
                      onClick={() => handleSend(t(s))}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 + (idx * 0.1) }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-card border border-border backdrop-blur-md text-[13px] sm:text-sm text-muted-foreground px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl hover:bg-secondary hover:text-foreground transition-all font-medium"
                    >
                      {t(s)}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          {view === 'chat' && (
            <div className="space-y-6 pt-4 sm:pt-6">
              <div className="flex justify-center mb-6 sm:mb-8">
                <div className="relative">
                  <div className={cn(
                    "absolute inset-0 rounded-full blur-2xl sm:blur-3xl transition-all duration-700",
                    isListening ? "bg-amber-400/50" :
                    sendMutation.isPending ? "bg-amber-600/40 animate-pulse" :
                    isSpeaking ? "bg-amber-500/45 animate-pulse" :
                    "bg-amber-900/30"
                  )} style={{ transform: isListening ? 'scale(1.4)' : isSpeaking ? 'scale(1.3)' : sendMutation.isPending ? 'scale(1.2)' : 'scale(1.1)' }} />
                  <div className="absolute inset-0 rounded-full blur-xl cognac-glow opacity-60" />
                  <motion.img
                    src="/floguru-logo.png"
                    alt="FLO GURU"
                    className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-xl"
                    animate={{
                      scale: isListening ? 1.08 : sendMutation.isPending ? [1, 1.04, 1] : isSpeaking ? [1, 1.05, 1] : 1,
                    }}
                    transition={{ scale: { duration: 0.3 }, repeat: (sendMutation.isPending || isSpeaking) ? Infinity : 0 }}
                  />
                </div>
              </div>

              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div 
                    key={message.id} 
                    className={cn("flex flex-col gap-2", message.role === 'user' ? "items-end" : "items-start")}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  >
                    <div className={cn(
                      "px-4 sm:px-5 py-3 sm:py-3.5 rounded-3xl text-sm sm:text-[15px] leading-relaxed max-w-[90%] sm:max-w-[85%] shadow-sm",
                      message.role === 'user'
                        ? "bg-primary text-primary-foreground rounded-tr-sm shadow-lg shadow-primary/20"
                        : "bg-card backdrop-blur-2xl text-foreground rounded-tl-sm border border-border shadow-xl"
                    )}>
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-1.5 opacity-50">
                          <Sparkles size={10} className="text-primary" />
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{assistantName}</span>
                        </div>
                      )}
                      {message.content}
                    </div>
                    {message.actionResult && message.actionResult.action !== 'none' && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-[95%] sm:max-w-[90%]"
                      >
                        <ActionResultCard result={message.actionResult} />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} className="h-32" />
            </div>
          )}
        </div>
      </main>

      {/* Input bar */}
      <footer className="p-4 sm:p-6 fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <motion.div 
          className="max-w-2xl mx-auto flex items-end gap-2 sm:gap-3 pointer-events-auto"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 28, delay: 0.2 }}
        >
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message FLO GURU..."
              className="relative w-full bg-card backdrop-blur-2xl border border-border rounded-[24px] px-5 sm:px-7 py-4 sm:py-5 text-sm sm:text-[16px] focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground shadow-xl"
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
                className="w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] rounded-[24px] bg-primary flex items-center justify-center shadow-lg shadow-primary/20 text-primary-foreground shrink-0 border border-border"
              >
                <Send size={20} className="sm:ml-0.5" />
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
                    className="absolute inset-0 bg-red-500/40 rounded-[24px]"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  />
                )}
                <motion.button 
                  onClick={toggleListening}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "relative w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] rounded-[24px] flex items-center justify-center transition-all shadow-lg z-10 border",
                    isListening 
                      ? "bg-red-500 text-white shadow-red-500/20 border-red-400/50" 
                      : "bg-card backdrop-blur-2xl border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </footer>

      {/* News Modal */}
      <NewsModal open={showNews} onClose={() => setShowNews(false)} locale={countryCode} locationName={weather?.locationName} />

      {/* Weather Forecast Modal */}
      {weather && (
        <WeatherForecastModal
          open={showForecast}
          onClose={() => setShowForecast(false)}
          lat={(weather as any).lat ?? coords?.lat ?? null}
          lon={(weather as any).lon ?? coords?.lon ?? null}
          locationName={(weather as any).locationName || (weather as any).location || ''}
          currentTempC={(weather as any).tempC ?? (weather as any).current?.temperatureC ?? 0}
          currentLabel={(weather as any).label || (weather as any).current?.weatherLabel || ''}
          feelsLikeC={(weather as any).feelsLikeC ?? (weather as any).current?.apparentTemperatureC ?? 0}
          language={language}
        />
      )}

      {/* ── Guest Sign-In Nudge Banner ── */}
      <AnimatePresence>
        {showSignInBanner && !user && (
          <motion.div
            key="signin-banner"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div className="bg-card border border-border rounded-3xl shadow-2xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Save your progress</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sign in to keep your chat history, memory, and settings across devices.</p>
                </div>
                <button
                  onClick={() => setShowSignInBanner(false)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0 mt-0.5"
                >×</button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowSignInBanner(false); setShowAuthModal(true); }}
                  className="flex-1 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => setShowSignInBanner(false)}
                  className="px-4 py-2.5 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground font-medium text-sm transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Auth Modal ── */}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
          userName={user?.name?.split(' ')[0]}
        />
      )}
      {(showAuthModal || resetToken) && (
        <AuthModal
          resetToken={resetToken}
          onClose={() => setShowAuthModal(false)}
          onSuccess={(name) => {
            setShowAuthModal(false);
            // Remove reset_token from URL if present
            if (resetToken) {
              window.history.replaceState({}, '', '/');
            }
            // Reload to pick up the new session cookie
            window.location.reload();
          }}
        />
      )}

      {/* ── Alarm Overlay ── */}
      <AnimatePresence>
        {alarmState.firing && (
          <motion.div
            key="alarm-overlay"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="bg-card border border-border rounded-3xl shadow-2xl px-8 py-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4"
            >
              {/* Pulsing bell icon */}
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                className="text-6xl select-none"
              >
                ⏰
              </motion.div>
              <div className="text-center">
                <p className="text-xl font-semibold text-foreground">Alarm</p>
                <p className="text-sm text-muted-foreground mt-1">{alarmState.label}</p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={snoozeAlarm}
                  className="flex-1 py-3 rounded-2xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-base transition-colors"
                >
                  Snooze 9 min
                </button>
                <button
                  onClick={dismissAlarm}
                  className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base transition-colors"
                >
                  Turn Off
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
