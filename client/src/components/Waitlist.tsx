import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';

const Waitlist = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: window.location.pathname }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setMessage(data.message || 'You\'re on the list!');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Failed to connect to server.');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-6 rounded-[2rem] bg-primary/10 border border-primary/20 flex flex-col items-center text-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-xl font-bold">Welcome aboard!</h3>
            <p className="text-muted-foreground">{message}</p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSubmit}
            className="relative"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-grow group">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={status === 'loading'}
                  className="w-full px-6 py-4 rounded-full bg-card border border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all leather-glow"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 min-w-[120px]"
              >
                {status === 'loading' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Join Waitlist
                    <Send size={16} />
                  </>
                )}
              </button>
            </div>
            {status === 'error' && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-6 left-6 text-xs text-destructive font-medium"
              >
                {message}
              </motion.p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Waitlist;
