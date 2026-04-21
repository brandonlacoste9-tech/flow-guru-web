import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut, Sun, Music, CloudRain, TreePine, Moon, Brain, Play, Pause, Radio } from 'lucide-react';
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

const QUICK_SOUNDS = [
  { type: "focus" as const, icon: Brain, label: "Focus", color: "from-violet-600 to-indigo-700" },
  { type: "relax" as const, icon: Moon, label: "Relax", color: "from-blue-600 to-cyan-700" },
  { type: "rain" as const, icon: CloudRain, label: "Rain", color: "from-slate-600 to-gray-700" },
  { type: "nature" as const, icon: TreePine, label: "Nature", color: "from-emerald-600 to-green-700" },
  { type: "wake_up" as const, icon: Sun, label: "Wake Up", color: "from-amber-500 to-orange-600" },
  { type: "wind_down" as const, icon: Music, label: "Wind Down", color: "from-rose-600 to-pink-700" },
] as const;

export default function Home() {
  const { user, logout, isAuthenticated } = useAuth({ redirectOnUnauthenticated: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<number | undefined>(undefined);
  const [showChat, setShowChat] = useState(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // tRPC Hooks
  const bootstrap = trpc.assistant.bootstrap.useQuery(undefined, { enabled: true });

  useEffect(() => {
    const data = bootstrap.data;
    if (!data) return;
    if (data.messages) setMessages(data.messages as Message[]);
    if (data.thread) setCurrentThreadId(data.thread.id);
  }, [bootstrap.data]);

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: (result) => {
      setMessages(result.messages as Message[]);
      setShowChat(true);
      if (speechEnabled) speakText(result.reply);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send message");
    }
  });

  const briefingMutation = trpc.assistant.briefing.useMutation({
    onSuccess: (result: any) => {
      setBriefingLoading(false);
      playAudio(result.audioDataUri);
      toast.success("Playing your briefing 🎙️");
    },
    onError: (err: any) => {
      setBriefingLoading(false);
      toast.error(err.message || "Couldn't generate briefing");
    }
  });

  const quickSoundMutation = trpc.assistant.quickSound.useMutation({
    onSuccess: (result: any) => {
      playAudio(result.audioDataUri);
      toast.success(`Playing ${result.label} 🎶`);
    },
    onError: (err: any) => {
      setPlayingSound(null);
      toast.error(err.message || "Couldn't generate sound");
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sendMutation.isPending]);

  // Audio playback
  const playAudio = (dataUri: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(dataUri);
    audio.onended = () => setPlayingSound(null);
    audio.play();
    audioRef.current = audio;
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingSound(null);
  };

  // Voice setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        handleSend(text);
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, [currentThreadId]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Voice not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const handleSend = (text: string) => {
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate({
      message: text,
      threadId: currentThreadId,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  };

  const handleBriefing = () => {
    setBriefingLoading(true);
    briefingMutation.mutate();
  };

  const handleQuickSound = (type: typeof QUICK_SOUNDS[number]["type"]) => {
    if (playingSound === type) {
      stopAudio();
      return;
    }
    setPlayingSound(type);
    quickSoundMutation.mutate({ type, durationSeconds: 15 });
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Header */}
      <header className="px-6 pt-6 pb-2 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <Sparkles className="text-blue-500 w-7 h-7 animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase leading-none">Flow Guru</h1>
            <p className="text-[9px] text-zinc-600 uppercase tracking-[.3em] mt-0.5">your ai assistant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all"
          >
            {speechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button 
            onClick={() => logout()}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-zinc-500 hover:text-red-400"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-6 scrollbar-hide">
        <div className="max-w-2xl mx-auto">
          
          {/* Greeting */}
          <div className="py-6">
            <h2 className="text-3xl font-bold tracking-tight">{greeting}, {userName}</h2>
            <p className="text-zinc-500 mt-1 text-sm">What would you like to do?</p>
          </div>

          {/* Daily Briefing Card */}
          <button
            onClick={handleBriefing}
            disabled={briefingLoading}
            className="w-full bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-6 mb-6 text-left hover:scale-[1.01] active:scale-[0.99] transition-all shadow-2xl shadow-blue-900/30 disabled:opacity-70"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
                  {briefingLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Radio className="w-7 h-7" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">Daily Briefing</h3>
                  <p className="text-blue-200 text-sm mt-0.5">Weather • Calendar • Your day ahead</p>
                </div>
              </div>
              <Play className="w-8 h-8 text-blue-200" />
            </div>
          </button>

          {/* Quick Sounds Grid */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-[.2em] text-zinc-500 mb-3 px-1">Quick Sounds</h3>
            <div className="grid grid-cols-3 gap-3">
              {QUICK_SOUNDS.map((sound) => {
                const Icon = sound.icon;
                const isActive = playingSound === sound.type;
                const isLoading = quickSoundMutation.isPending && playingSound === sound.type;
                return (
                  <button
                    key={sound.type}
                    onClick={() => handleQuickSound(sound.type)}
                    disabled={quickSoundMutation.isPending && playingSound !== sound.type}
                    className={cn(
                      "rounded-2xl p-4 flex flex-col items-center gap-2 transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50",
                      isActive ? `bg-gradient-to-br ${sound.color} shadow-lg` : "bg-[#1C1C1E] hover:bg-[#2C2C2E]"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : isActive ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Icon className="w-6 h-6 text-zinc-400" />
                    )}
                    <span className={cn("text-xs font-semibold", isActive ? "text-white" : "text-zinc-500")}>{sound.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="w-full bg-[#1C1C1E] rounded-2xl p-4 mb-4 flex items-center justify-between hover:bg-[#2C2C2E] transition-all"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-semibold text-zinc-300">
                {showChat ? "Hide Chat" : messages.length > 0 ? `Chat (${messages.length} messages)` : "Ask Flow Guru anything"}
              </span>
            </div>
            <span className="text-zinc-600 text-xs">{showChat ? "▲" : "▼"}</span>
          </button>

          {/* Chat Messages */}
          {showChat && (
            <div className="space-y-4 pb-44 animate-in slide-in-from-top-4 duration-300">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-2", message.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-5 py-3 rounded-2xl text-[15px] leading-relaxed max-w-[85%]",
                    message.role === 'user' ? "bg-blue-600 text-white rounded-tr-md" : "bg-[#1C1C1E] text-zinc-100 rounded-tl-md"
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
                  <div className="bg-[#1C1C1E] px-5 py-3 rounded-2xl rounded-tl-md">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Footer / Input Area */}
      <footer className="p-4 pb-6 flex flex-col items-center gap-3 bg-gradient-to-t from-black via-black/95 to-transparent fixed bottom-0 left-0 right-0">
        <div className="max-w-2xl w-full relative flex items-center gap-3">
          <input 
            type="text"
            placeholder="Ask anything..."
            className="flex-1 bg-[#1C1C1E] border border-white/5 rounded-full px-6 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSend((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
          <div className="relative flex items-center justify-center">
            {isListening && (
              <div className="absolute w-16 h-16 bg-blue-500/30 rounded-full animate-ping" />
            )}
            <button 
              onClick={toggleListening}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl z-10",
                isListening ? "bg-red-500 scale-110" : "bg-blue-600 hover:scale-105 active:scale-95 shadow-blue-500/40"
              )}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
          </div>
        </div>
        <p className={cn("text-[9px] font-black uppercase tracking-[.4em] transition-colors", isListening ? "text-red-500" : "text-zinc-700")}>
          {isListening ? "Listening Now" : "Flow Guru Active"}
        </p>
      </footer>
    </div>
  );
}
