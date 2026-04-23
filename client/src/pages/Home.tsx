import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Cloud, Calendar, Send, Settings, CheckCircle2, MessageSquarePlus, User, UserRound } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";
import { motion, AnimatePresence } from "framer-motion";
import { OrbVisualizer } from "@/components/OrbVisualizer";
import { useLocation } from "wouter";
import { MusicPlayer } from "@/components/MusicPlayer";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Message {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  actionResult?: any;
}

const SUGGESTIONS = [
  "What's on my calendar today?",
  "What's the weather?",
  "Book lunch at noon tomorrow",
  "Remind me to call Mom at 5pm",
];

export default function Home() {
  const [, navigate] = useLocation();
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
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [memoryFacts, setMemoryFacts] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState('');
  // ElevenLabs voice: male = Callum, female = Rachel
  const VOICE_IDS = {
    male: 'N2lVS1wzUvBXUvBCW9ng',   // Callum — warm, energetic male
    female: '21m00Tcm4TlvDq8ikWAM',  // Rachel — calm, natural female
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
    if (data.memoryFacts) setMemoryFacts(data.memoryFacts);
    if (data.providerConnections) {
      const gcal = (data.providerConnections as any[]).find(c => c.provider === "google-calendar" && c.status === "connected");
      setIsGoogleConnected(!!gcal);
      const spot = (data.providerConnections as any[]).find(c => c.provider === "spotify" && c.status === "connected");
      setIsSpotifyConnected(!!spot);
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

  const speakMutation = trpc.assistant.speak.useMutation({
    onSuccess: (result) => {
      const audio = new Audio(result.audioDataUri);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      audio.play().catch(() => setIsSpeaking(false));
    },
    onError: () => {
      setIsSpeaking(false);
      // Fallback to browser TTS if ElevenLabs is unavailable
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
    }
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
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
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
    speakMutation.mutate(
      { text: clean, voiceId: VOICE_IDS[voiceGenderRef.current] },
      {
        onError: () => {
          setIsSpeaking(false);
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

  const greeting = currentTime.getHours() < 12 ? "Good morning" : currentTime.getHours() < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";

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
      <header className="px-6 pt-5 pb-3 flex justify-between items-center z-50">
        <motion.div 
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles className="text-primary w-6 h-6 animate-pulse" />
          <h1 className="text-lg font-bold tracking-tighter uppercase">{assistantName}</h1>
        </motion.div>
        
        <motion.div 
          className="flex items-center gap-2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="hidden sm:flex gap-1.5 mr-2">
            {isGoogleConnected && <Calendar className="w-3.5 h-3.5 text-primary/60" />}
            {isSpotifyConnected && <Volume2 className="w-3.5 h-3.5 text-primary/60" />}
          </div>

          {view === 'chat' && (
            <button 
              onClick={() => startFreshMutation.mutate()}
              title="Start New Session"
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground"
            >
              {startFreshMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            </button>
          )}

          <button onClick={() => navigate("/calendar")}
            title="Open Calendar"
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground">
            <Calendar size={14} />
          </button>

          <ThemeToggle />

          <button
            onClick={() => {
              const next = voiceGender === 'male' ? 'female' : 'male';
              setVoiceGender(next);
              localStorage.setItem('voiceGender', next);
              toast.success(`Voice switched to ${next === 'male' ? 'Callum (male)' : 'Rachel (female)'}`);
            }}
            title={`Voice: ${voiceGender === 'male' ? 'Male (Callum)' : 'Female (Rachel)'} — click to switch`}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm text-muted-foreground hover:text-foreground"
          >
            {voiceGender === 'male' ? <User size={14} /> : <UserRound size={14} />}
          </button>

          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-accent/10 transition-all shadow-sm">
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={() => logout()}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center bg-card backdrop-blur-md hover:bg-destructive/10 hover:border-destructive/30 transition-all text-muted-foreground hover:text-destructive shadow-sm">
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
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                <OrbVisualizer 
                  state={isListening ? 'listening' : sendMutation.isPending ? 'thinking' : isSpeaking ? 'speaking' : 'idle'} 
                />

                {/* Time & Greeting */}
                <div className="mb-8">
                  <motion.h3 
                    className="text-[4rem] font-bold tracking-tighter leading-none mb-2 tabular-nums"
                    initial={{ opacity: 0, filter: "blur(10px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ delay: 0.1, duration: 0.8 }}
                  >
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </motion.h3>
                  <motion.h2 
                    className="text-2xl font-semibold tracking-tight text-muted-foreground ml-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {greeting}, <span className="text-foreground">{userName}</span>
                  </motion.h2>
                </div>

                {/* Live cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {/* Weather Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-3">
                      <Cloud className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{weather?.locationName || "Weather"}</span>
                    </div>
                    {weather ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <p className="text-4xl font-bold tracking-tight">{weather.tempC}°</p>
                        </div>
                        <p className="text-sm text-muted-foreground capitalize mt-1 font-medium">{weather.label} <span className="text-border">•</span> Feels like {weather.feelsLikeC}°</p>
                      </>
                    ) : (
                      <div className="h-16 flex flex-col justify-center">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-sm text-muted-foreground">No location set</p>
                          <button 
                            onClick={() => {
                              const city = prompt("What city are you in?");
                              if (city) handleSend(`My city is ${city}`);
                            }}
                            className="text-[10px] uppercase font-bold tracking-wider text-primary hover:underline"
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Calendar Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Today</span>
                      </div>
                      <button onClick={() => navigate("/calendar")} className="text-[10px] uppercase font-bold tracking-wider text-primary hover:underline">Open Calendar</button>
                    </div>
                    
                    {todayEvents.length > 0 ? (
                      <div className="space-y-3 mt-2">
                        {todayEvents.slice(0, 3).map((e, i) => (
                          <div key={i} className="flex items-center justify-between group/event">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-1 h-1 rounded-full bg-primary/50" />
                              <p className="text-sm font-medium truncate text-foreground group-hover/event:text-primary transition-colors">{e.title}</p>
                            </div>
                            <p className="text-xs text-muted-foreground shrink-0 font-medium">{formatEventTime(e.start, e.allDay)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-14 flex flex-col justify-center">
                        <p className="text-[15px] font-medium text-foreground">Schedule is clear.</p>
                      </div>
                    )}
                  </motion.div>

                  {/* Memory Card */}
                  <motion.div 
                    className="bg-card backdrop-blur-xl border border-border rounded-3xl p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all" />
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Saved Memory</span>
                    </div>
                    {memoryFacts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {memoryFacts.slice(0, 8).map((f, i) => (
                          <motion.span 
                            key={i} 
                            whileHover={{ scale: 1.05 }}
                            className="px-2.5 py-1 rounded-full border border-border bg-secondary text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-muted-foreground"
                          >
                            {f.factValue}
                          </motion.span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No personal facts remembered yet.</p>
                    )}
                  </motion.div>

                  {/* Music Player Card */}
                  <motion.div
                    className="sm:col-span-1"
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
                </div>

                {/* Suggestion chips */}
                <motion.div 
                  className="flex flex-wrap gap-2.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {SUGGESTIONS.map((s, idx) => (
                    <motion.button 
                      key={s} 
                      onClick={() => handleSend(s)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 + (idx * 0.1) }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-card border border-border backdrop-blur-md text-sm text-muted-foreground px-4 py-2.5 rounded-2xl hover:bg-secondary hover:text-foreground transition-all font-medium"
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          {view === 'chat' && (
            <div className="space-y-6 pt-6">
              <div className="flex justify-center mb-8">
                <OrbVisualizer 
                  state={isListening ? 'listening' : sendMutation.isPending ? 'thinking' : isSpeaking ? 'speaking' : 'idle'} 
                />
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
                      "px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed max-w-[85%] shadow-sm",
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
                        className="w-full max-w-[90%]"
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
      <footer className="p-6 fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <motion.div 
          className="max-w-2xl mx-auto flex items-end gap-3 pointer-events-auto"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 28, delay: 0.2 }}
        >
          <div className="flex-1 relative group">
            <div className="absolute -inset-1 bg-primary/10 rounded-[28px] blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Flow Guru..."
              className="relative w-full bg-card backdrop-blur-2xl border border-border rounded-[24px] px-7 py-5 text-[16px] focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground shadow-xl"
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
                className="w-[60px] h-[60px] rounded-[24px] bg-primary flex items-center justify-center shadow-lg shadow-primary/20 text-primary-foreground shrink-0 border border-border"
              >
                <Send size={22} className="ml-0.5" />
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
                    "relative w-[60px] h-[60px] rounded-[24px] flex items-center justify-center transition-all shadow-lg z-10 border",
                    isListening 
                      ? "bg-red-500 text-white shadow-red-500/20 border-red-400/50" 
                      : "bg-card backdrop-blur-2xl border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isListening ? <MicOff size={22} /> : <Mic size={22} />}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </footer>
    </div>
  );
}
