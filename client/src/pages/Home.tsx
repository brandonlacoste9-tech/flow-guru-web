import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Cloud, Calendar, Send } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bootstrap = trpc.assistant.bootstrap.useQuery(undefined, { enabled: true });

  useEffect(() => {
    const data = bootstrap.data;
    if (!data) return;
    if (data.messages) setMessages(data.messages as Message[]);
    if (data.thread) setCurrentThreadId(data.thread.id);
    if (data.assistantName) setAssistantName(data.assistantName);
    if (data.weather) setWeather(data.weather);
    if (data.todayEvents) setTodayEvents(data.todayEvents);
  }, [bootstrap.data]);

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: (result) => {
      setMessages(result.messages as Message[]);
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
    sendMutation.mutate({
      message: text,
      threadId: currentThreadId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const formatEventTime = (iso: string | null, allDay: boolean) => {
    if (allDay || !iso) return "All day";
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return ""; }
  };

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";
  const hasContext = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Header */}
      <header className="px-6 pt-5 pb-3 flex justify-between items-center z-50">
        <div className="flex items-center gap-2.5">
          <Sparkles className="text-blue-500 w-6 h-6 animate-pulse" />
          <h1 className="text-lg font-bold tracking-tighter uppercase">{assistantName}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
            {speechEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={() => logout()}
            className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-zinc-500 hover:text-red-400">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-5 scrollbar-hide">
        <div className="max-w-2xl mx-auto pb-36">

          {/* Dashboard — only when no messages */}
          {!hasContext && (
            <div className="pt-6 animate-in fade-in duration-500">
              {/* Greeting */}
              <h2 className="text-2xl font-bold tracking-tight mb-1">{greeting}, {userName}</h2>
              <p className="text-zinc-500 text-sm mb-6">Here's what's happening right now.</p>

              {/* Live cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {/* Weather */}
                {weather && (
                  <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{weather.locationName}</span>
                    </div>
                    <p className="text-2xl font-bold">{weather.tempC}°C</p>
                    <p className="text-sm text-zinc-400 capitalize">{weather.label}, feels like {weather.feelsLikeC}°</p>
                  </div>
                )}

                {/* Calendar */}
                <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Today</span>
                  </div>
                  {todayEvents.length > 0 ? (
                    <div className="space-y-1.5">
                      {todayEvents.slice(0, 3).map((e, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate mr-2">{e.title}</p>
                          <p className="text-xs text-zinc-500 shrink-0">{formatEventTime(e.start, e.allDay)}</p>
                        </div>
                      ))}
                      {todayEvents.length > 3 && (
                        <p className="text-xs text-zinc-600">+{todayEvents.length - 3} more</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No events — day's open 👌</p>
                  )}
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => handleSend(s)}
                    className="bg-[#1A1A1A] border border-white/5 text-sm text-zinc-300 px-4 py-2 rounded-full hover:bg-[#222] hover:border-white/10 transition-all active:scale-95">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {hasContext && (
            <div className="space-y-5 pt-4">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-2", message.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-5 py-3 rounded-[22px] text-[15px] leading-relaxed max-w-[85%]",
                    message.role === 'user'
                      ? "bg-blue-600 text-white rounded-tr-md"
                      : "bg-[#141414] text-zinc-100 rounded-tl-md border border-white/5"
                  )}>
                    {message.content}
                  </div>
                  {message.actionResult && message.actionResult.action !== 'none' && (
                    <ActionResultCard result={message.actionResult} />
                  )}
                </div>
              ))}
              {sendMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-[#141414] px-5 py-3 rounded-[22px] rounded-tl-md border border-white/5">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-xs text-zinc-500">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input bar */}
      <footer className="p-4 pb-5 bg-gradient-to-t from-black via-black/95 to-transparent fixed bottom-0 left-0 right-0">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 bg-[#141414] border border-white/5 rounded-full px-5 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder:text-zinc-600"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputValue); }}
          />
          {inputValue.trim() ? (
            <button onClick={() => handleSend(inputValue)}
              className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-500/30">
              <Send size={18} />
            </button>
          ) : (
            <div className="relative flex items-center justify-center">
              {isListening && <div className="absolute w-12 h-12 bg-blue-500/30 rounded-full animate-ping" />}
              <button onClick={toggleListening}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg z-10",
                  isListening ? "bg-red-500 scale-110" : "bg-blue-600 hover:scale-105 active:scale-95 shadow-blue-500/30"
                )}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
