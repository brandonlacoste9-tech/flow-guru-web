import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';

interface OnboardingFlowProps {
  onComplete: () => void;
  userName?: string;
}

type StepId = 'assistant-name' | 'user-name' | 'wake' | 'alarm' | 'briefing' | 'done';

const STEPS: Array<{ id: StepId; subtitle: string; title: string; body: string; cta: string }> = [
  {
    id: 'assistant-name',
    subtitle: 'Welcome',
    title: 'Hi, I am FloGuru',
    body: 'You can rename me if you want. What would you like to call me?',
    cta: 'Next',
  },
  {
    id: 'user-name',
    subtitle: 'Personalized setup',
    title: 'What is your name?',
    body: 'I will use your name to make reminders and updates feel more personal.',
    cta: 'Next',
  },
  {
    id: 'wake',
    subtitle: 'Wake schedule',
    title: 'What time do you wake up?',
    body: 'Set your weekday wake-up routine so alarms and planning start on time.',
    cta: 'Save wake schedule',
  },
  {
    id: 'alarm',
    subtitle: 'Alarm style',
    title: 'Pick your alarm sound',
    body: 'Choose how your wake-up alarm sounds: chime, radio, or silent plus vibration.',
    cta: 'Save alarm style',
  },
  {
    id: 'briefing',
    subtitle: 'Daily briefing',
    title: 'Set your daily briefing time',
    body: 'I can send AI news and your calendar agenda each morning at your chosen time.',
    cta: 'Finish setup',
  },
  {
    id: 'done',
    subtitle: 'You are all set',
    title: 'Ready when you are',
    body: 'If you want, I can save your to-do lists, grocery lists, and calendar reminders anytime — just say the word.',
    cta: 'Enter Flow Guru',
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
  const [assistantAlias, setAssistantAlias] = useState('FloGuru');
  const [displayName, setDisplayName] = useState(userName ?? '');
  const [wakeTime, setWakeTime] = useState('08:00');
  const [alarmDays, setAlarmDays] = useState('1,2,3,4,5');
  const [alarmSound, setAlarmSound] = useState<'chime' | 'radio-focus' | 'none'>('radio-focus');
  const [briefingTime, setBriefingTime] = useState('09:15');
  const [isSaving, setIsSaving] = useState(false);

  const utils = trpc.useUtils();
  const saveProfileMutation = trpc.settings.saveProfile.useMutation();
  const addMemoryFactMutation = trpc.settings.addMemoryFact.useMutation();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const summaryName = useMemo(() => displayName.trim() || userName || 'friend', [displayName, userName]);

  const persistSetup = async () => {
    setIsSaving(true);
    try {
      await saveProfileMutation.mutateAsync({
        wakeUpTime: wakeTime,
        alarmDays,
        alarmSound,
      });

      const memoryWrites: Array<Promise<unknown>> = [];
      const trimmedAssistantAlias = assistantAlias.trim();
      const trimmedDisplayName = displayName.trim();

      if (trimmedAssistantAlias) {
        memoryWrites.push(addMemoryFactMutation.mutateAsync({
          factKey: 'assistant_name',
          factValue: trimmedAssistantAlias,
          category: 'preference',
        }));
      }

      if (trimmedDisplayName) {
        memoryWrites.push(addMemoryFactMutation.mutateAsync({
          factKey: 'user_name',
          factValue: trimmedDisplayName,
          category: 'profile',
        }));
      }

      memoryWrites.push(addMemoryFactMutation.mutateAsync({
        factKey: 'daily_briefing_time',
        factValue: briefingTime,
        category: 'preference',
      }));

      memoryWrites.push(addMemoryFactMutation.mutateAsync({
        factKey: 'daily_briefing_topics',
        factValue: 'ai news, calendar agenda',
        category: 'preference',
      }));

      await Promise.all(memoryWrites);
      await utils.assistant.bootstrap.invalidate();
      localStorage.setItem('floguru_onboarded', '1');
      onComplete();
    } catch {
      // Keep lightweight and quiet; user can still continue.
      localStorage.setItem('floguru_onboarded', '1');
      onComplete();
    } finally {
      setIsSaving(false);
    }
  };

  const next = async () => {
    if (current.id === 'user-name' && !displayName.trim()) return;
    if (current.id === 'done') {
      await persistSetup();
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const disableNext = (current.id === 'user-name' && !displayName.trim()) || isSaving;

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

          {/* Logo */}
          <div className="mb-6 relative flex items-center justify-center">
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
              width={80}
              height={80}
              className="relative w-20 h-20 rounded-full object-cover"
              style={{ boxShadow: '0 0 20px 6px rgba(212,160,23,0.55), 0 0 40px 12px rgba(180,120,10,0.3)' }}
            />
          </div>

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
            {current.id === 'done' ? `Ready when you are, ${summaryName}` : current.title}
          </h2>

          {/* Body */}
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'rgba(200,170,120,0.8)' }}>
            {current.body}
          </p>

          {current.id === 'assistant-name' && (
            <input
              type="text"
              value={assistantAlias}
              onChange={(e) => setAssistantAlias(e.target.value)}
              maxLength={64}
              placeholder="FloGuru"
              className="mb-6 w-full rounded-xl border border-[#6b4a22] bg-[#140c04] px-4 py-2.5 text-sm text-[#f0e4cc] placeholder:text-[#8f7653] focus:outline-none focus:border-[#c8900a]"
            />
          )}

          {current.id === 'user-name' && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              placeholder="Your name"
              className="mb-6 w-full rounded-xl border border-[#6b4a22] bg-[#140c04] px-4 py-2.5 text-sm text-[#f0e4cc] placeholder:text-[#8f7653] focus:outline-none focus:border-[#c8900a]"
            />
          )}

          {current.id === 'wake' && (
            <div className="mb-6 w-full space-y-3 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#c8900a]">Wake-up time</label>
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="w-full rounded-xl border border-[#6b4a22] bg-[#140c04] px-4 py-2.5 text-sm text-[#f0e4cc] focus:outline-none focus:border-[#c8900a]"
              />
              <label className="text-xs font-semibold uppercase tracking-wider text-[#c8900a]">Days</label>
              <button
                type="button"
                onClick={() => setAlarmDays(prev => prev === '1,2,3,4,5' ? '0,1,2,3,4,5,6' : '1,2,3,4,5')}
                className="w-full rounded-xl border border-[#6b4a22] px-4 py-2.5 text-sm text-[#f0e4cc] hover:border-[#c8900a] transition-colors"
              >
                {alarmDays === '1,2,3,4,5' ? 'Monday to Friday' : 'Every day'}
              </button>
            </div>
          )}

          {current.id === 'alarm' && (
            <div className="mb-6 w-full space-y-2">
              {[
                { id: 'radio-focus', label: 'Radio' },
                { id: 'chime', label: 'Chime' },
                { id: 'none', label: 'Silent + vibration' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAlarmSound(opt.id as 'chime' | 'radio-focus' | 'none')}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                    alarmSound === opt.id
                      ? 'border-[#c8900a] bg-[#2a1a0a] text-[#f0e4cc]'
                      : 'border-[#6b4a22] text-[#d9bf97] hover:border-[#c8900a]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {current.id === 'briefing' && (
            <div className="mb-6 w-full space-y-3 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#c8900a]">
                Briefing time
              </label>
              <input
                type="time"
                value={briefingTime}
                onChange={(e) => setBriefingTime(e.target.value)}
                className="w-full rounded-xl border border-[#6b4a22] bg-[#140c04] px-4 py-2.5 text-sm text-[#f0e4cc] focus:outline-none focus:border-[#c8900a]"
              />
              <p className="text-xs text-[#d9bf97]">
                Includes daily AI news plus your calendar agenda for the day.
              </p>
            </div>
          )}

          {current.id === 'done' && (
            <p className="mb-6 text-sm text-[#d9bf97]">
              And I am here anytime you need help, {summaryName} — ready when you are.
            </p>
          )}

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
            disabled={disableNext}
            className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2"
            style={GOLD_BTN_STYLE}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : isLast ? <Check size={16} /> : null}
            {current.cta}
            {!isLast && !isSaving ? <ChevronRight size={16} /> : null}
          </button>

          {/* Skip */}
          {!isLast && (
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
