import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Send, LogOut } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ActionResultCard } from "@/components/ActionResultCard";

interface ToolCall {
  name: string;
  result: string;
}

interface Message {
  id: string | number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  actionResult?: any;
  tool_calls?: ToolCall[];
}

const TOOL_ICONS: Record<string, string> = {
  playMusic: '🎵',
  createCalendarEvent: '📅',
  getWeather: '🌤',
  setReminder: '⏰',
};

function getToolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

const quickActions = [
  { icon: "🎵", label: "Play music" },
  { icon: "📅", label: "Book time" },
  { icon: "🌤", label: "Weather" },
  { icon: "⏰", label: "Reminder" },
];

export default function Home() {
  const { logout } = useAuth({ redirectOnUnauthenticated: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<number | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<"chat" | "memory" | "routines">("chat");

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
      if (speechEnabled) speakText(result.reply);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send message");
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

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
    if (!recognitionRef.current) { toast.error("Voice not supported in this browser."); return; }
    if (isListening) { recognitionRef.current.stop(); }
    else { setIsListening(true); recognitionRef.current.start(); }
  };

  const handleSend = (text: string) => {
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ message: text, threadId: currentThreadId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setInputValue('');
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const renderMessage = (message: Message) => {
    if (message.role === 'tool' || (message.tool_calls && message.tool_calls.length > 0)) {
      const toolCalls: ToolCall[] = message.tool_calls ?? [{ name: message.content, result: message.content }];
      return (
        <div key={message.id} className="flex flex-col gap-2 items-start">
          {toolCalls.map((tc, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-5 py-4 max-w-[85%]"
              style={{ background: 'rgba(99,80,255,0.08)', border: '1px solid rgba(99,80,255,0.2)', borderRadius: '14px' }}
            >
              <span className="text-xl mt-0.5">{getToolIcon(tc.name)}</span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#c4b5fd' }}>{tc.name}</div>
                <div className="text-sm text-zinc-300">{tc.result}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div key={message.id} className={cn("flex flex-col gap-3", message.role === 'user' ? "items-end" : "items-start")}>
        <div
          className="px-8 py-5 text-[20px] font-medium leading-relaxed max-w-[85%] transition-all hover:scale-[1.01]"
          style={
            message.role === 'user'
              ? { background: 'linear-gradient(135deg, #5b44f2, #7c6af5)', borderRadius: '18px 18px 4px 18px', boxShadow: '0 4px 20px rgba(91,68,242,0.3)', color: 'white' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px 18px 18px 4px', color: 'rgb(244 244 245)' }
          }
        >
          {message.content}
        </div>
        {message.actionResult && message.actionResult.action !== 'none' && (
          <ActionResultCard result={message.actionResult} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white font-['Outfit'] selection:bg-blue-500/30 overflow-hidden relative">
      <div className="ambient-glow" />

      <header className="p-8 flex justify-between items-center z-50 bg-gradient-to-b from-black via-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6350ff, #a78bfa)', boxShadow: '0 0 16px rgba(99,80,255,0.5)' }}
          >
            FG
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase leading-none">Flow Guru</h1>
            <p className="text-[10px] uppercase tracking-[.3em] mt-1 ml-0.5 flex items-center gap-1" style={{ color: '#71717a' }}>
              <span className="text-green-400 animate-pulse">●</span>
              <span>Online</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setSpeechEnabled(!speechEnabled)} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all">
            {speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button onClick={() => logout()} className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-zinc-500 hover:text-red-400">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 px-8 pb-4 z-40">
        {(["chat", "memory", "routines"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all"
            style={activeTab === tab
              ? { border: '1px solid rgba(99,80,255,0.6)', background: 'rgba(99,80,255,0.15)', color: '#a78bfa' }
              : { border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: '#666' }}
          >
            {tab}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-8 pb-40">
          {messages.map(renderMessage)}
          {sendMutation.isPending && (
            <div className="flex justify-start">
              <div className="px-8 py-5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px 18px 18px 4px' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#a78bfa' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="p-12 flex flex-col items-center gap-4 bg-gradient-to-t from-black via-black/90 to-transparent fixed bottom-0 left-0 right-0">
        <div className="max-w-2xl w-full flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => setInputValue(action.label)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105"
              style={{ background: 'rgba(99,80,255,0.12)', border: '1px solid rgba(99,80,255,0.25)', color: '#a78bfa' }}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        <div className="max-w-2xl w-full relative flex items-center gap-4">
          <div
            className="flex-1 flex items-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px' }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type or tell me anything..."
              className="flex-1 bg-transparent px-8 py-5 text-lg focus:outline-none placeholder:text-zinc-600"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputValue); }}
            />
            {inputValue.trim() && (
              <button
                onClick={() => handleSend(inputValue)}
                disabled={sendMutation.isPending}
                className="mr-3 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6350ff, #a78bfa)', boxShadow: '0 0 12px rgba(99,80,255,0.5)' }}
              >
                <Send size={18} className="text-white" />
              </button>
            )}
          </div>

          <div className="relative flex items-center justify-center">
            {isListening && <div className="absolute w-20 h-20 rounded-full animate-ping" style={{ background: 'rgba(99,80,255,0.3)' }} />}
            <button
              onClick={toggleListening}
              className={cn("w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 z-10", isListening ? "bg-red-500 scale-110" : "hover:scale-105 active:scale-95")}
              style={isListening ? undefined : { background: 'linear-gradient(135deg, #6350ff, #a78bfa)', boxShadow: '0 0 20px rgba(99,80,255,0.45)' }}
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
