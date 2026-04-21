import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Sparkles, LogOut } from 'lucide-react';
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

export default function Home() {
  const { user, logout, isAuthenticated } = useAuth({ redirectOnUnauthenticated: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<number | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const userName = user?.name?.split(' ')[0] || "there";

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Header */}
      <header className="px-6 pt-6 pb-4 flex justify-between items-center z-50 bg-gradient-to-b from-black via-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <Sparkles className="text-blue-500 w-7 h-7 animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase leading-none">Flow Guru</h1>
            <p className="text-[9px] text-zinc-600 uppercase tracking-[.3em] mt-0.5">personal assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSpeechEnabled(!speechEnabled)}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
            {speechEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={() => logout()}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-zinc-500 hover:text-red-400">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-y-auto px-6 py-2 scrollbar-hide">
        <div className="max-w-2xl mx-auto space-y-6 pb-36">
          {/* Empty state */}
          {messages.length === 0 && !sendMutation.isPending && (
            <div className="flex flex-col items-center justify-center pt-20 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">{greeting}, {userName}</h2>
              <p className="text-zinc-500 text-sm max-w-sm">
                Tell me what you need — book an event, check your calendar, set a reminder, or just chat.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={cn("flex flex-col gap-2", message.role === 'user' ? "items-end" : "items-start")}>
              <div className={cn(
                "px-5 py-3.5 rounded-[24px] text-[15px] leading-relaxed max-w-[85%]",
                message.role === 'user'
                  ? "bg-blue-600 text-white rounded-tr-md"
                  : "bg-[#1C1C1E] text-zinc-100 rounded-tl-md border border-white/5"
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
              <div className="bg-[#1C1C1E] px-5 py-3.5 rounded-[24px] rounded-tl-md border border-white/5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-xs text-zinc-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="p-4 pb-6 flex flex-col items-center gap-3 bg-gradient-to-t from-black via-black/95 to-transparent fixed bottom-0 left-0 right-0">
        <div className="max-w-2xl w-full flex items-center gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Book physio at 9:30, check my calendar, set a reminder..."
            className="flex-1 bg-[#1C1C1E] border border-white/5 rounded-full px-6 py-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSend(inputValue);
              }
            }}
          />
          <div className="relative flex items-center justify-center">
            {isListening && <div className="absolute w-14 h-14 bg-blue-500/30 rounded-full animate-ping" />}
            <button
              onClick={toggleListening}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl z-10",
                isListening ? "bg-red-500 scale-110" : "bg-blue-600 hover:scale-105 active:scale-95 shadow-blue-500/40"
              )}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </div>
        <p className={cn("text-[9px] font-black uppercase tracking-[.4em] transition-colors", isListening ? "text-red-500" : "text-zinc-700")}>
          {isListening ? "Listening..." : "Flow Guru Active"}
        </p>
      </footer>
    </div>
  );
}
