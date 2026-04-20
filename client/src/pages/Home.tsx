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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // tRPC Hooks
  const bootstrap = trpc.assistant.bootstrap.useQuery(undefined, {
    enabled: true,
  });

  useEffect(() => {
    const data = bootstrap.data;
    if (!data) return;
    if (data.messages) setMessages(data.messages as Message[]);
    if (data.thread) setCurrentThreadId(data.thread.id);
  }, [bootstrap.data]);

  const sendMutation = trpc.assistant.send.useMutation({
    onSuccess: (result) => {
      setMessages(result.messages as Message[]);
      if (speechEnabled) speakText(result.reply);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send message");
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sendMutation.isPending]);

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

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const isGuest = !isAuthenticated;

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden">
      {/* Header */}
      <header className="p-8 flex justify-between items-center z-50 bg-gradient-to-b from-black via-black/80 to-transparent">
        <div className="flex items-center gap-3">
            <Sparkles className="text-blue-500 w-8 h-8 animate-pulse" />
            <div>
                <h1 className="text-2xl font-bold tracking-tighter uppercase leading-none">Flow Guru</h1>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[.3em] mt-1 ml-0.5">Powered by Neon</p>
            </div>
        </div>
        
        <div className="flex items-center gap-4">
            <button 
                onClick={() => setSpeechEnabled(!speechEnabled)}
                className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all"
            >
                {speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button 
                onClick={() => logout()}
                className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-zinc-500 hover:text-red-400"
            >
                <LogOut size={18} />
            </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-8 pb-40">
          {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-3", message.role === 'user' ? "items-end" : "items-start")}>
                    <div className={cn(
                        "px-8 py-5 rounded-[32px] text-[20px] font-medium leading-relaxed max-w-[85%] shadow-2xl transition-all hover:scale-[1.01]",
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
                <div className="bg-[#1C1C1E] px-8 py-5 rounded-[32px] rounded-tl-md">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Footer / Input Area */}
      <footer className="p-12 flex flex-col items-center gap-6 bg-gradient-to-t from-black via-black/90 to-transparent fixed bottom-0 left-0 right-0">
        
        <div className="max-w-2xl w-full relative flex items-center gap-4">
            <input 
              type="text"
              placeholder="Type or tell me anything..."
              className="flex-1 bg-[#1C1C1E] border border-white/5 rounded-full px-8 py-5 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSend((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />

            <div className="relative flex items-center justify-center">
                {isListening && (
                    <div className="absolute w-20 h-20 bg-blue-500/30 rounded-full animate-ping" />
                )}
                <button 
                    onClick={toggleListening}
                    className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-3xl z-10",
                        isListening ? "bg-red-500 scale-110" : "bg-blue-600 hover:scale-105 active:scale-95 shadow-blue-500/40"
                    )}
                >
                    {isListening ? <MicOff size={28} /> : <Mic size={28} />}
                </button>
            </div>
        </div>

        <p className={cn("text-[10px] font-black uppercase tracking-[.4em] transition-colors", isListening ? "text-red-500" : "text-zinc-700")}>
            {isListening ? "Listening Now" : "Flow Guru Active"}
        </p>
      </footer>
    </div>
  );
}
