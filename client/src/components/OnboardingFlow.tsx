import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Cloud, Music, Newspaper, Sparkles, ChevronRight, Check } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
  userName?: string;
}

const STEPS = [
  {
    id: 'welcome',
    icon: null,
    title: 'Welcome to FLO GURU',
    subtitle: 'Your premium personal assistant',
    body: 'FLO GURU is your intelligent daily companion — it learns your routines, keeps your schedule, and helps you flow through every day with ease.',
    cta: 'Get Started',
  },
  {
    id: 'ai',
    icon: Sparkles,
    title: 'Intelligent Conversations',
    subtitle: 'Ask anything, anytime',
    body: 'Talk to FLO GURU like a trusted advisor. Ask about your schedule, the weather, the news, or anything on your mind. It remembers your preferences and gets smarter over time.',
    cta: 'Next',
  },
  {
    id: 'calendar',
    icon: Calendar,
    title: 'Your Calendar, Elevated',
    subtitle: 'Never miss a moment',
    body: 'Connect your Google Calendar or create events directly in the app. FLO GURU will remind you of upcoming events and help you plan your day.',
    cta: 'Next',
  },
  {
    id: 'weather',
    icon: Cloud,
    title: 'Live Weather & News',
    subtitle: 'Always in the know',
    body: 'Get real-time weather for your location and curated top news headlines — all without leaving the app. Tap the cards on your dashboard to explore.',
    cta: 'Next',
  },
  {
    id: 'music',
    icon: Music,
    title: 'Focus Music',
    subtitle: 'Set the mood',
    body: 'Choose from curated radio stations — Focus, Chill, Energy, Sleep, and Space — to match your workflow. Great music makes everything flow better.',
    cta: 'Next',
  },
  {
    id: 'ready',
    icon: null,
    title: "You're All Set",
    subtitle: 'Welcome to the flow',
    body: 'Your dashboard is ready. Start by asking FLO GURU anything — or just explore the cards below. Everything is designed to help you move through your day with clarity and ease.',
    cta: 'Enter FLO GURU',
  },
];

const LEATHER_CARD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(160deg, #1e1208 0%, #140c04 100%)',
  border: '1px solid rgba(180,130,60,0.35)',
  boxShadow: '0 0 60px rgba(180,120,30,0.12), 0 20px 60px rgba(0,0,0,0.6)',
};

const GOLD_BTN_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #c8900a 0%, #8a5a06 100%)',
  color: '#1a0e04',
  boxShadow: '0 4px 20px rgba(200,144,10,0.35)',
};

const CORNER = (cls: string) => (
  <div
    className={`absolute w-5 h-5 ${cls}`}
    style={{ borderColor: 'rgba(200,144,10,0.65)' }}
  />
);

export function OnboardingFlow({ onComplete, userName }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const next = () => {
    if (isLast) {
      localStorage.setItem('floguru_onboarded', '1');
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,6,2,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="relative w-full max-w-sm mx-4 rounded-3xl p-8 flex flex-col items-center text-center"
          style={LEATHER_CARD_STYLE}
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {/* Gold corner accents */}
          {CORNER('top-3 left-3 border-t-2 border-l-2 rounded-tl-lg')}
          {CORNER('top-3 right-3 border-t-2 border-r-2 rounded-tr-lg')}
          {CORNER('bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg')}
          {CORNER('bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg')}

          {/* Logo or icon */}
          {isFirst || isLast ? (
            <div className="mb-6 relative flex items-center justify-center">
              {/* Outer glow */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: '160px', height: '160px',
                  background: 'radial-gradient(circle, rgba(212,160,23,0.4) 0%, rgba(180,120,10,0.2) 40%, transparent 70%)',
                  filter: 'blur(20px)',
                  animation: 'pulse 3s ease-in-out infinite',
                }}
              />
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: '120px', height: '120px',
                  background: 'radial-gradient(circle, rgba(255,200,50,0.5) 0%, rgba(210,150,20,0.3) 45%, transparent 70%)',
                  filter: 'blur(10px)',
                }}
              />
              <img
                src="/floguru-logo.png"
                alt="FLO GURU"
                className="relative w-20 h-20 rounded-full object-cover"
                style={{ boxShadow: '0 0 20px 6px rgba(212,160,23,0.55), 0 0 40px 12px rgba(180,120,10,0.3)' }}
              />
            </div>
          ) : current.icon ? (
            <div
              className="mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(200,144,10,0.2) 0%, rgba(140,90,6,0.1) 100%)',
                border: '1px solid rgba(200,144,10,0.3)',
                boxShadow: '0 0 20px rgba(200,144,10,0.15)',
              }}
            >
              {React.createElement(current.icon, { size: 28, style: { color: '#c8900a' } })}
            </div>
          ) : null}

          {/* Gold divider */}
          <div className="flex items-center gap-3 mb-5 w-full">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(200,144,10,0.5))' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(200,144,10,0.7)' }}>
              {current.subtitle}
            </span>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(200,144,10,0.5))' }} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold tracking-tight mb-3" style={{ color: '#f0e4cc' }}>
            {isFirst && userName ? `Welcome, ${userName}` : current.title}
          </h2>

          {/* Body */}
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'rgba(200,170,120,0.8)' }}>
            {current.body}
          </p>

          {/* Step dots */}
          <div className="flex gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === step ? '20px' : '6px',
                  height: '6px',
                  background: i === step ? '#c8900a' : 'rgba(200,144,10,0.25)',
                }}
              />
            ))}
          </div>

          {/* CTA Button */}
          <button
            onClick={next}
            className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2"
            style={GOLD_BTN_STYLE}
          >
            {isLast ? <Check size={16} /> : null}
            {current.cta}
            {!isLast ? <ChevronRight size={16} /> : null}
          </button>

          {/* Skip */}
          {!isLast && !isFirst && (
            <button
              onClick={() => {
                localStorage.setItem('floguru_onboarded', '1');
                onComplete();
              }}
              className="mt-4 text-xs uppercase tracking-wider transition-opacity hover:opacity-100"
              style={{ color: 'rgba(200,144,10,0.45)' }}
            >
              Skip intro
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
