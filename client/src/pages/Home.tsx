import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Cloud, Calendar, Send, Settings, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";
import { motion, AnimatePresence } from "framer-motion";
import { OrbVisualizer } from "@/components/OrbVisualizer";

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
    
    setIsSpeaking(true);
    // Use our new ElevenLabs endpoint
    const audio = new Audio(`/api/speak?text=${encodeURIComponent(text)}`);
    
    audio.onended = () => setIsSpeaking(false);
    audio.onerror = () => setIsSpeaking(false);

    audio.play().catch(() => {
      // Fallback if ElevenLabs fails
      if (!('speechSynthesis' in window)) {
        setIsSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    });
  };

  const formatEventTime = (iso: string | null, allDay: boolean) => {
    if (allDay || !iso) return "All day";
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return ""; }
  };

  const greeting = currentTime.getHours() < 12 ? "Good morning" : currentTime.getHours() < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";
  const hasContext = messages.length > 0;

  const handleConnectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar/start';
  };

  const handleConnectSpotify = () => {
    window.location.href = '/api/integrations/spotify/start';
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <motion.div
          animate={{
            backgroundColor: isListening ? '#EF4444' : sendMutation.isPending ? '#3B82F6' : isSpeaking ? '#22C55E' : '#0047FF',
            opacity: [0.1, 0.15, 0.1],
          }}
          transition={{ duration: 1 }}
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
          {/* Compact Connection Indicators */}
          <div className="hidden sm:flex gap-1.5 mr-2">
            {isGoogleConnected && <Calendar className="w-3.5 h-3.5 text-blue-400/60" />}
            {isSpotifyConnected && <Volume2 className="w-3.5 h-3.5 text-green-400/60" />}
          </div>

          {view === 'chat' && (
            <button 
              onClick={() => startFreshMutation.mutate()}
              title="Start New Session"
              className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-white/10 transition-all shadow-sm text-zinc-300 hover:text-white"
            >
              {startFreshMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            </button>
          )}

          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-white/10 transition-all shadow-sm">
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
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

          {/* Dashboard — only when no messages */}
          <AnimatePresence>
            {view === 'dashboard' && (
              <motion.div 
                className="pt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                {/* Visual Centerpiece: The Orb */}
                <OrbVisualizer 
                  state={isListening ? 'listening' : sendMutation.isPending ? 'thinking' : isSpeaking ? 'speaking' : 'idle'} 
                />

                {/* Time & Greeting */}
                <div className="mb-8">
                  <motion.h3 
                    className="text-[4rem] font-bold tracking-tighter leading-none mb-2 tabular-nums mix-blend-plus-lighter"
                    initial={{ opacity: 0, filter: "blur(10px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ delay: 0.1, duration: 0.8 }}
                  >
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </motion.h3>
                  <motion.h2 
                    className="text-2xl font-semibold tracking-tight text-zinc-300 ml-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {greeting}, <span className="text-white">{userName}</span>
                  </motion.h2>
                </div>

                {/* Live cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {/* Weather Card */}
                  <motion.div 
                    className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
                    <div className="flex items-center gap-2 mb-3">
                      <Cloud className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{weather?.locationName || "Weather"}</span>
                    </div>
                    {weather ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <p className="text-4xl font-bold tracking-tight">{weather.tempC}°</p>
                        </div>
                        <p className="text-sm text-zinc-400 capitalize mt-1 font-medium">{weather.label} <span className="text-zinc-600">•</span> Feels like {weather.feelsLikeC}°</p>
                      </>
                    ) : (
                      <div className="h-16 flex flex-col justify-center">
                        <div className="flex items-center justify-between w-full">
                          <p className="text-sm text-zinc-400">No location set</p>
                          <button 
                            onClick={() => {
                              const city = prompt("What city are you in?");
                              if (city) handleSend(`My city is ${city}`);
                            }}
                            className="text-[10px] uppercase font-bold tracking-wider text-blue-400 hover:text-blue-300"
                          >
                            Set
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-1">Tell me your city for weather updates.</p>
                      </div>
                    )}
                  </motion.div>

                  {/* Calendar Card */}
                  <motion.div 
                    className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all" />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-400" />
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Today</span>
                      </div>
                      {!isGoogleConnected && (
                         <button onClick={handleConnectCalendar} className="text-[10px] uppercase font-bold tracking-wider text-blue-400 hover:text-blue-300">Connect</button>
                      )}
                    </div>
                    
                    {isGoogleConnected ? (
                      todayEvents.length > 0 ? (
                        <div className="space-y-3 mt-2">
                          {todayEvents.slice(0, 3).map((e, i) => (
                            <div key={i} className="flex items-center justify-between group/event">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-1 h-1 rounded-full bg-green-500/50" />
                                <p className="text-sm font-medium truncate text-zinc-200 group-hover/event:text-white transition-colors">{e.title}</p>
                              </div>
                              <p className="text-xs text-zinc-500 shrink-0 font-medium">{formatEventTime(e.start, e.allDay)}</p>
                            </div>
                          ))}
                          {todayEvents.length > 3 && (
                            <p className="text-xs text-zinc-600 font-medium pt-1">+{todayEvents.length - 3} more events today</p>
                          )}
                        </div>
                      ) : (
                        <div className="h-14 flex flex-col justify-center">
                          <p className="text-[15px] font-medium text-zinc-300">Schedule is perfectly clear.</p>
                          <p className="text-xs text-zinc-500 mt-1">Enjoy your free time.</p>
                        </div>
                      )
                    ) : (
                      <div className="h-14 flex flex-col justify-center">
                        <p className="text-sm text-zinc-400">Connect your calendar to see upcoming events directly here.</p>
                      </div>
                    )}
                  </motion.div>
                  {/* Memory Card */}
                  <motion.div 
                    className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors sm:col-span-2"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all" />
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Saved Memory</span>
                    </div>
                    {memoryFacts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {memoryFacts.slice(0, 8).map((f, i) => {
                          const isPref = f.category === 'preference';
                          const isRoutine = f.category === 'daily_routine';
                          return (
                            <motion.span 
                              key={i} 
                              whileHover={{ scale: 1.05 }}
                              className={cn(
                                "px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all",
                                isPref ? "bg-purple-500/10 border-purple-500/20 text-purple-300" :
                                isRoutine ? "bg-blue-500/10 border-blue-500/20 text-blue-300" :
                                "bg-white/5 border-white/5 text-zinc-400"
                              )}
                            >
                              {f.factValue}
                            </motion.span>
                          );
                        })}
                        {memoryFacts.length > 8 && (
                          <span className="text-[10px] text-zinc-600 flex items-center ml-1">+{memoryFacts.length - 8} more</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">No personal facts remembered yet. Chat with me to save some!</p>
                    )}
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
                      className="bg-white/5 border border-white/5 backdrop-blur-md text-sm text-zinc-300 px-4 py-2.5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all font-medium"
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
              {/* Compact Orb in Chat View */}
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
                        ? "bg-gradient-to-tr from-blue-600 to-blue-500 text-white rounded-tr-sm shadow-blue-500/20"
                        : "bg-zinc-900/60 backdrop-blur-2xl text-zinc-100 rounded-tl-sm border border-white/10 shadow-xl"
                    )}>
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-1.5 opacity-50">
                          <Sparkles size={10} className="text-blue-400" />
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{assistantName}</span>
                        </div>
                      )}
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
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-cyan-500/20 rounded-[28px] blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Flow Guru..."
              className="relative w-full bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[24px] px-7 py-5 text-[16px] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-500 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
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
                className="w-[60px] h-[60px] rounded-[24px] bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white shrink-0 border border-white/10"
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
                      : "bg-zinc-900/80 backdrop-blur-2xl border-white/10 text-zinc-300 hover:text-white"
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
