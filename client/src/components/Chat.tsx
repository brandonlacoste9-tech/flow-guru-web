import { useState } from 'react';
import { useFlowChat } from '../hooks/useFlowChat';

type ChatPart = { type: string; text?: string };
type ChatMsg = { id: string; role: string; parts: ChatPart[] };

export default function Chat({ userId = 'anonymous' }: { userId?: string }) {
  const { messages, sendMessage, status } = useFlowChat(userId);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto space-y-4">
        {(messages as ChatMsg[]).map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg max-w-[80%] ${
              m.role === 'user' ? 'bg-amber-100 ml-auto' : 'bg-stone-100'
            }`}
          >
            {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
          </div>
        ))}
        {status === 'streaming' && <div className="text-stone-500 italic">Thinking…</div>}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Flow Guru…"
          className="flex-1 p-3 border border-stone-300 rounded-lg"
          disabled={status === 'streaming'}
        />
        <button
          type="submit"
          disabled={status === 'streaming' || !input.trim()}
          className="px-6 py-3 bg-amber-700 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
