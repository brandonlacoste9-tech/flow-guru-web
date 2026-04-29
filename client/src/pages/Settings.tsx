import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Brain, MessageSquare, Save, Trash2, Plus, Sparkles, CheckCircle2, AlertCircle, Volume2, Wand2, Share2, Loader2, CreditCard, Bell, Droplets, CalendarClock } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLoginUrl } from '@/const';
import { trackConversion } from '@/lib/telemetry';
import { usePushNotifications } from '@/hooks/usePushNotifications';

type Tab = 'profile' | 'alarms' | 'memory' | 'persona' | 'instructions' | 'billing' | 'integrations';

const ALARM_DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const ALARM_DAY_LABELS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;

const RADIO_URLS: Record<string, string> = {
  'radio-focus': 'https://ice6.somafm.com/groovesalad-128-mp3',
  'radio-chill': 'https://ice6.somafm.com/lush-128-mp3',
  'radio-energy': 'https://ice6.somafm.com/beatblender-128-mp3',
  'radio-sleep': 'https://ice6.somafm.com/sleepbot-128-mp3',
  'radio-space': 'https://ice6.somafm.com/deepspaceone-128-mp3',
};

function playChimePreview() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      osc.start(start);
      osc.stop(start + 0.7);
    });
  } catch (e) {
    toast.error('Could not play chime — try clicking elsewhere first.');
  }
}

let radioPreviewAudio: HTMLAudioElement | null = null;

function playRadioPreview(sound: string) {
  const url = RADIO_URLS[sound];
  if (!url) return;
  if (radioPreviewAudio) {
    radioPreviewAudio.pause();
    radioPreviewAudio = null;
  }
  radioPreviewAudio = new Audio(url);
  radioPreviewAudio.volume = 0.5;
  radioPreviewAudio.play().catch(() => toast.error('Could not play radio — browser blocked autoplay.'));
  setTimeout(() => {
    if (radioPreviewAudio) { radioPreviewAudio.pause(); radioPreviewAudio = null; }
  }, 8000);
  toast.info('Playing 8-second preview…');
}

export function Settings() {
  const [, navigate] = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const [wakeUpTime, setWakeUpTime] = useState(() => localStorage.getItem('wakeUpTime') ?? '');
  const [alarmSound, setAlarmSound] = useState<string>('chime');
  const [alarmDays, setAlarmDays] = useState(() => localStorage.getItem('alarmDays') ?? '0,1,2,3,4,5,6');
  const [dailyRoutine, setDailyRoutine] = useState('');
  const [preferencesSummary, setPreferencesSummary] = useState('');
  const [profileDirty, setProfileDirty] = useState(false);

  const [instructions, setInstructions] = useState('');
  const [instructionsDirty, setInstructionsDirty] = useState(false);

  const [newFactKey, setNewFactKey] = useState('');
  const [newFactValue, setNewFactValue] = useState('');
  const [showAddFact, setShowAddFact] = useState(false);

  const [personaName, setPersonaName] = useState('');
  const [personaStyle, setPersonaStyle] = useState('');
  const [personaDirty, setPersonaDirty] = useState(false);

  const [voiceId, setVoiceId] = useState('');
  const [buddyPersonality, setBuddyPersonality] = useState('');
  const [voicePreviewLoading, setVoicePreviewLoading] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string>('');
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  const [lastAlarmSignalAt, setLastAlarmSignalAt] = useState<string | null>(null);
  const [waterBreakEnabled, setWaterBreakEnabled] = useState<boolean>(() => localStorage.getItem('fg_water_break_enabled') === '1');
  const [waterBreakIntervalMinutes, setWaterBreakIntervalMinutes] = useState<number>(() => {
    const raw = Number(localStorage.getItem('fg_water_break_interval_minutes') || '60');
    return Number.isFinite(raw) && raw >= 15 ? raw : 60;
  });
  const { permission, swReady, requestPermission } = usePushNotifications();

  const profileQuery = trpc.settings.getProfile.useQuery(undefined);

  useEffect(() => {
    const loadPushStatus = async () => {
      if (!('serviceWorker' in navigator)) {
        setPushSubscribed(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushSubscribed(Boolean(sub));
      } catch {
        setPushSubscribed(false);
      }
    };

    void loadPushStatus();
  }, [swReady, permission]);

  useEffect(() => {
    const readLastAlarmSignal = () => {
      try {
        setLastAlarmSignalAt(localStorage.getItem('fg_last_alarm_signal_at'));
      } catch {
        setLastAlarmSignalAt(null);
      }
    };
    readLastAlarmSignal();
    const id = window.setInterval(readLastAlarmSignal, 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('fg_water_break_enabled', waterBreakEnabled ? '1' : '0');
    localStorage.setItem('fg_water_break_interval_minutes', String(waterBreakIntervalMinutes));
  }, [waterBreakEnabled, waterBreakIntervalMinutes]);

  useEffect(() => {
    const data = profileQuery.data as any;
    if (!data) return;
    setWakeUpTime(data.wakeUpTime ?? '');
    setAlarmSound(data.alarmSound ?? 'chime');
    setAlarmDays(data.alarmDays ?? '0,1,2,3,4,5,6');
    localStorage.setItem('wakeUpTime', data.wakeUpTime ?? '');
    localStorage.setItem('alarmSound', data.alarmSound ?? 'chime');
    localStorage.setItem('alarmDays', data.alarmDays ?? '0,1,2,3,4,5,6');
    setDailyRoutine(data.dailyRoutine ?? '');
    setPreferencesSummary(data.preferencesSummary ?? '');
    setInstructions(data.customInstructions ?? '');
    setVoiceId(data.voiceId ?? '');
    setBuddyPersonality(data.buddyPersonality ?? '');
  }, [profileQuery.data]);

  const factsQuery = trpc.settings.getMemoryFacts.useQuery();
  const personaQuery = trpc.settings.getPersona.useQuery(undefined);

  useEffect(() => {
    const data = personaQuery.data as any;
    if (!data) return;
    setPersonaName(data.personaName ?? '');
    setPersonaStyle(data.personaStyle ?? '');
  }, [personaQuery.data]);

  const voicesQuery = trpc.settings.getVoices.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const now = new Date();
  const upcomingEventsQuery = trpc.calendar.list.useQuery(
    {
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { refetchInterval: 60000 }
  );

  const speakMutation = trpc.assistant.speak.useMutation({
    onSuccess: (data) => {
      const audio = new Audio(data.audioDataUri);
      audio.onended = () => setVoicePreviewLoading(null);
      audio.play().catch(() => setVoicePreviewLoading(null));
    },
    onError: () => setVoicePreviewLoading(null),
  });

  function handlePreviewVoice(vId: string, previewUrl?: string) {
    setVoicePreviewLoading(vId);
    if (previewUrl) {
      const audio = new Audio(previewUrl);
      audio.onended = () => setVoicePreviewLoading(null);
      audio.play().catch(() => setVoicePreviewLoading(null));
    } else {
      speakMutation.mutate({ text: "Hello! This is how I'll sound as your buddy.", voiceId: vId });
    }
  }

  const saveProfileMutation = trpc.settings.saveProfile.useMutation({
    onSuccess: () => {
      localStorage.setItem('wakeUpTime', wakeUpTime ?? '');
      localStorage.setItem('alarmSound', alarmSound ?? 'chime');
      localStorage.setItem('alarmDays', alarmDays ?? '0,1,2,3,4,5,6');
      localStorage.setItem('fg_water_break_enabled', waterBreakEnabled ? '1' : '0');
      localStorage.setItem('fg_water_break_interval_minutes', String(waterBreakIntervalMinutes));
      toast.success('Profile saved!');
      setProfileDirty(false);
      profileQuery.refetch();
    },
    onError: () => toast.error('Failed to save profile.'),
  });

  const saveInstructionsMutation = trpc.settings.saveCustomInstructions.useMutation({
    onSuccess: () => { toast.success('Custom instructions saved!'); setInstructionsDirty(false); },
    onError: () => toast.error('Failed to save instructions.'),
  });

  const savePersonaMutation = trpc.settings.savePersona.useMutation({
    onSuccess: () => { toast.success('Persona saved!'); setPersonaDirty(false); personaQuery.refetch(); },
    onError: () => toast.error('Failed to save persona.'),
  });

  const deleteFactMutation = trpc.settings.deleteMemoryFact.useMutation({
    onSuccess: () => { toast.success('Memory removed.'); factsQuery.refetch(); },
    onError: () => toast.error('Failed to remove memory.'),
  });

  const addFactMutation = trpc.settings.addMemoryFact.useMutation({
    onSuccess: () => {
      toast.success('Memory added!');
      setNewFactKey(''); setNewFactValue(''); setShowAddFact(false);
      factsQuery.refetch();
    },
    onError: () => toast.error('Failed to add memory.'),
  });

  const factsRaw = (factsQuery.data as any)?.facts ?? factsQuery.data ?? [];
  const facts = (() => {
    const source = (Array.isArray(factsRaw) ? factsRaw : []).filter((f: any) => f.factKey !== 'custom_instructions');
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const fact of source) {
      const normalizedValue = String(fact.factValue ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedKey = String(fact.factKey ?? '').trim().toLowerCase();
      const normalizedCategory = String(fact.category ?? '').trim().toLowerCase();
      const dedupeKey = `${normalizedCategory}::${normalizedKey}::${normalizedValue}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduped.push(fact);
    }
    return deduped;
  })();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const allowedTabs: Tab[] = ['profile', 'alarms', 'memory', 'persona', 'instructions', 'billing', 'integrations'];
    if (tabParam && allowedTabs.includes(tabParam as Tab)) {
      setActiveTab(tabParam as Tab);
    }
    const billing = params.get('billing');
    if (billing === 'success') {
      trackConversion('checkout_success');
      toast.success('Subscription started. Welcome to Flow Guru Monthly.');
    }
    if (billing === 'cancelled') {
      trackConversion('checkout_cancelled');
      toast.info('Checkout cancelled.');
    }
  }, []);

  async function fetchBillingStatus() {
    setBillingLoading(true);
    try {
      const response = await fetch('/api/billing/status', { credentials: 'include' });
      if (!response.ok) throw new Error('Billing status unavailable');
      const status = await response.json();
      setBillingStatus(status);
      trackConversion('billing_status_loaded', {
        authenticated: Boolean(status.authenticated),
        isPro: Boolean(status.isPro),
        plan: status.plan ?? 'unknown',
      });
    } catch (err: any) {
      toast.error(err?.message || 'Could not load billing status.');
    } finally {
      setBillingLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'billing') {
      trackConversion('billing_tab_opened');
      void fetchBillingStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'billing' || !billingStatus || billingStatus.isPro) return;
    trackConversion('upgrade_cta_shown', {
      surface: 'billing_plan_card',
      authenticated: Boolean(billingStatus.authenticated),
      plan: billingStatus.plan ?? 'free',
    });
  }, [activeTab, billingStatus?.authenticated, billingStatus?.isPro, billingStatus?.plan]);

  function handleSignInForUpgrade(source: string) {
    trackConversion('checkout_sign_in_clicked', { source });
    window.location.href = getLoginUrl();
  }

  async function handleUpgrade() {
    setCheckoutError(null);

    if (billingStatus?.authenticated === false) {
      const message = 'Sign in first so Flow Guru can attach the subscription to your account.';
      setCheckoutError(message);
      trackConversion('checkout_sign_in_required', { source: 'billing_button_preflight' });
      toast.info('Sign in to upgrade', {
        description: message,
        action: {
          label: 'Sign in',
          onClick: () => handleSignInForUpgrade('checkout_toast_preflight'),
        },
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      trackConversion('checkout_started', {
        plan: 'flow_guru_monthly',
        price: 'CA$4.99',
      });
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ promoCode: promoCode.trim() || undefined }),
      });
      const data = await response.json();
      if (response.status === 401) {
        const message = data.error || 'Please sign in again before upgrading.';
        setCheckoutError(message);
        trackConversion('checkout_sign_in_required', { source: 'checkout_response' });
        toast.info('Sign in to upgrade', {
          description: message,
          action: {
            label: 'Sign in',
            onClick: () => handleSignInForUpgrade('checkout_toast_response'),
          },
        });
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout unavailable');
      trackConversion('checkout_redirecting', {
        plan: 'flow_guru_monthly',
      });
      window.location.href = data.url;
    } catch (err: any) {
      trackConversion('checkout_failed', {
        reason: err?.message || 'unknown',
      });
      toast.error(err?.message || 'Could not start checkout.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleTestSound() {
    if (alarmSound === 'none') {
      toast.info('Silent mode — no sound will play.');
      return;
    }
    if (alarmSound === 'chime') {
      playChimePreview();
      toast.success('Playing chime preview…');
      return;
    }
    if (alarmSound.startsWith('radio-')) {
      playRadioPreview(alarmSound);
    }
  }

  const weekdaySet = new Set((alarmDays || '').split(',').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const nextWakeLabel = (() => {
    if (!wakeUpTime) return 'Not set';
    const [hRaw, mRaw] = wakeUpTime.split(':');
    const hh = Number(hRaw);
    const mm = Number(mRaw);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return 'Not set';
    const nowLocal = new Date();
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(nowLocal);
      candidate.setDate(nowLocal.getDate() + offset);
      candidate.setHours(hh, mm, 0, 0);
      if (weekdaySet.size && !weekdaySet.has(candidate.getDay())) continue;
      if (candidate <= nowLocal) continue;
      return candidate.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    }
    return 'Not scheduled';
  })();
  const snoozedUntilLabel = (() => {
    const value = localStorage.getItem('fg_alarm_snoozed_until');
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date()) return null;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  })();
  const activeAlarmLabel = localStorage.getItem('fg_alarm_active_label');
  const nextCalendarEventLabel = (() => {
    const events = (upcomingEventsQuery.data as any[]) || [];
    const next = events
      .filter((e: any) => e?.startAt)
      .map((e: any) => ({ title: e.title, startAt: new Date(e.startAt) }))
      .filter((e: any) => e.startAt.getTime() > Date.now())
      .sort((a: any, b: any) => a.startAt.getTime() - b.startAt.getTime())[0];
    if (!next) return 'No upcoming events';
    return `${next.title} at ${next.startAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  })();

  const TABS = [
    { id: 'profile' as Tab, label: t('settings_tab_profile'), icon: User },
    { id: 'alarms' as Tab, label: 'Alarms', icon: Bell },
    { id: 'memory' as Tab, label: t('settings_tab_memory'), icon: Brain },
    { id: 'persona' as Tab, label: t('settings_tab_persona'), icon: Wand2 },
    { id: 'instructions' as Tab, label: t('settings_tab_instructions'), icon: MessageSquare },
    { id: 'billing' as Tab, label: 'Billing', icon: CreditCard },
    { id: 'integrations' as Tab, label: t('settings_tab_integrations'), icon: Share2 },
  ];

  const PERSONA_STYLES = [
    { value: '', label: '⚡ Default', desc: 'High-energy & smooth' },
    { value: 'professional and concise', label: '💼 Professional', desc: 'Formal & to the point' },
    { value: 'casual and friendly like a best friend', label: '😎 Casual', desc: 'Relaxed & conversational' },
    { value: 'motivational and inspiring like a life coach', label: '🔥 Motivational', desc: 'Pumped up & inspiring' },
    { value: 'witty and humorous with clever jokes', label: '😂 Witty', desc: 'Funny & clever' },
    { value: 'calm, zen, and mindful', label: '🧘 Zen', desc: 'Calm & mindful' },
  ];

  const isBillingUnauthenticated = billingStatus?.authenticated === false;

  return (
    <div className="min-h-[100dvh] min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="max-w-2xl mx-auto flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate('/')} className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-bold tracking-tight">{t('settings_title')}</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-snug mt-0.5">{t('settings_desc')}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {/* Tabs: 2-column grid on phones & small viewports; horizontal strip only on large screens (sm/md alone match phone landscape width). */}
        <div
          className={cn(
            'mb-6 lg:mb-8',
            'grid grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:gap-1 lg:bg-secondary/40 lg:p-1 lg:rounded-2xl lg:overflow-x-auto lg:no-scrollbar lg:snap-x lg:snap-mandatory lg:touch-pan-x [-webkit-overflow-scrolling:touch]'
          )}
        >
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'rounded-xl text-xs font-semibold transition-all text-left lg:text-center',
                  'min-h-[44px] px-3 py-2.5 lg:py-2 lg:px-2 lg:min-w-[5.5rem] lg:max-w-[9rem] xl:min-w-[6rem] xl:max-w-none xl:flex-1 xl:min-w-[100px]',
                  'flex flex-row items-center gap-2 lg:flex-col lg:gap-1 lg:justify-center lg:snap-start lg:shrink-0',
                  'leading-snug lg:leading-tight',
                  activeTab === tab.id
                    ? 'bg-card shadow-sm text-foreground border border-border'
                    : 'bg-secondary/30 lg:bg-transparent text-muted-foreground hover:text-foreground active:bg-secondary/50'
                )}
              >
                <Icon size={16} className="lg:w-3.5 lg:h-3.5 shrink-0 opacity-90" aria-hidden />
                <span className="flex-1 min-w-0 whitespace-normal break-words">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <User size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">{t('settings_profile_title')}</h2>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">{t('settings_profile_desc')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('alarms');
                    window.history.replaceState({}, '', '/settings?tab=alarms');
                  }}
                  className="w-full rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-left text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  Open Alarms settings
                </button>
                
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_language')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setLanguage('en')}
                      className={cn('py-2.5 rounded-xl text-xs font-bold transition-all border',
                        language === 'en' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}
                    >
                      English
                    </button>
                    <button 
                      onClick={() => setLanguage('fr')}
                      className={cn('py-2.5 rounded-xl text-xs font-bold transition-all border',
                        language === 'fr' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}
                    >
                      Français
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_wakeup')}</label>
                  <input type="time" value={wakeUpTime} onChange={e => { setWakeUpTime(e.target.value); setProfileDirty(true); }}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_routine')}</label>
                  <textarea rows={3} value={dailyRoutine} onChange={e => { setDailyRoutine(e.target.value); setProfileDirty(true); }}
                    placeholder={t('settings_profile_routine_placeholder')}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_prefs')}</label>
                  <textarea rows={3} value={preferencesSummary} onChange={e => { setPreferencesSummary(e.target.value); setProfileDirty(true); }}
                    placeholder={t('settings_profile_prefs_placeholder')}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_alarm')}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={alarmSound} onChange={e => { setAlarmSound(e.target.value); setProfileDirty(true); }}
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors">
                      <option value="chime">🔔 {language === 'en' ? 'Chime (default)' : 'Carillon (défaut)'}</option>
                      <option value="none">🔇 {language === 'en' ? 'Silent (voice only)' : 'Silencieux (voix seulement)'}</option>
                      <option value="radio-focus">🎵 Radio — Focus (SomaFM)</option>
                      <option value="radio-chill">🎵 Radio — Chill (SomaFM)</option>
                      <option value="radio-energy">🎵 Radio — Energy (SomaFM)</option>
                      <option value="radio-sleep">🎵 Radio — Sleep (SomaFM)</option>
                      <option value="radio-space">🎵 Radio — Space (SomaFM)</option>
                    </select>
                    <button onClick={handleTestSound}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0">
                      <Volume2 size={14} /> {t('settings_profile_test_sound')}
                    </button>
                  </div>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">{language === 'en' ? 'Click Test to preview the selected alarm sound.' : 'Cliquez sur Tester pour prévisualiser le son de l\'alarme sélectionné.'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_alarm_days')}</label>
                  <div className="grid grid-cols-4 xs:grid-cols-7 gap-1 sm:gap-1.5">
                    {(language === 'en' ? ALARM_DAY_LABELS_EN : ALARM_DAY_LABELS_FR).map((day, idx) => {
                      const active = alarmDays.split(',').map(Number).includes(idx);
                      return (
                        <button key={day} type="button"
                          onClick={() => {
                            const current = alarmDays ? alarmDays.split(',').map(Number) : [];
                            const next = active ? current.filter(d => d !== idx) : [...current, idx].sort((a,b) => a-b);
                            setAlarmDays(next.join(','));
                            setProfileDirty(true);
                          }}
                          className={cn('py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all border',
                            active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                          {day}
                        </button>
                      );
                   })}
                  </div>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">{language === 'en' ? 'Select which days the wake-up alarm fires.' : 'Sélectionnez les jours où l\'alarme de réveil sonne.'}</p>
                </div>
                <div className="space-y-2 rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Alarm diagnostics
                    </p>
                    <button
                      type="button"
                      onClick={() => { void requestPermission(); }}
                      className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent/10 transition-colors"
                    >
                      Allow notifications
                    </button>
                  </div>
                  <div className="space-y-1 text-[11px] sm:text-xs">
                    <p><span className="text-muted-foreground">Notification permission:</span> {permission}</p>
                    <p><span className="text-muted-foreground">Service worker:</span> {swReady ? 'ready' : 'not ready'}</p>
                    <p><span className="text-muted-foreground">Push subscription:</span> {pushSubscribed === null ? 'checking…' : (pushSubscribed ? 'registered' : 'not registered')}</p>
                    <p><span className="text-muted-foreground">Last alarm signal:</span> {lastAlarmSignalAt ? new Date(lastAlarmSignalAt).toLocaleString() : 'none yet'}</p>
                  </div>
                </div>
                <button disabled={!profileDirty || saveProfileMutation.isPending}
                  onClick={() => saveProfileMutation.mutate({ 
                    wakeUpTime, dailyRoutine, preferencesSummary, alarmSound, alarmDays, voiceId, buddyPersonality 
                  } as any)}
                  className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all',
                    profileDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveProfileMutation.isPending ? t('settings_profile_saving') : t('settings_profile_save')}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'memory' && (
            <motion.div key="memory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Brain size={14} className="text-primary" />
                    <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Memory Manager</h2>
                  </div>
                  <button onClick={() => setShowAddFact(v => !v)} className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-primary hover:underline">
                    <Plus size={12} /> Add
                  </button>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-5 leading-relaxed">Everything your assistant has learned about you. Remove anything you don't want it to remember.</p>
                <AnimatePresence>
                  {showAddFact && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
                      <div className="bg-background border border-border rounded-2xl p-4 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add a memory</p>
                        <textarea
                          rows={2}
                          value={newFactValue}
                          onChange={e => setNewFactValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey && newFactValue.trim()) {
                              e.preventDefault();
                              addFactMutation.mutate({ factKey: 'note', factValue: newFactValue.trim() });
                            }
                          }}
                          placeholder="e.g. I prefer concise answers. My favourite food is sushi."
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setNewFactValue(''); setShowAddFact(false); }}
                            className="flex-1 border border-border py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-accent/10 transition-colors">
                            Cancel
                          </button>
                          <button
                            disabled={!newFactValue.trim() || addFactMutation.isPending}
                            onClick={() => addFactMutation.mutate({ factKey: 'note', factValue: newFactValue.trim() })}
                            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <Save size={13} />
                            {addFactMutation.isPending ? 'Saving...' : 'Save Memory'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {factsQuery.isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading memories...</p>}
                {!factsQuery.isLoading && facts.length === 0 && (
                  <div className="text-center py-8">
                    <Sparkles size={24} className="text-primary/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No memories yet. Chat with your assistant and it will start learning about you.</p>
                  </div>
                )}
                <div className="space-y-2.5">
                  {facts.map((fact: any) => (
                    <motion.div key={fact.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      className="flex items-start gap-3 bg-background border border-border rounded-2xl px-4 py-3.5 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-primary/70">{fact.factKey ?? fact.category}</p>
                        <p className="text-[13px] sm:text-sm text-foreground mt-0.5 leading-snug">{fact.factValue}</p>
                      </div>
                      <button onClick={() => deleteFactMutation.mutate({ factId: fact.id })}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'alarms' && (
            <motion.div key="alarms" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Wake Alarm</h2>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_wakeup')}</label>
                  <input type="time" value={wakeUpTime} onChange={e => { setWakeUpTime(e.target.value); setProfileDirty(true); }}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_alarm_days')}</label>
                  <div className="grid grid-cols-4 xs:grid-cols-7 gap-1 sm:gap-1.5">
                    {(language === 'en' ? ALARM_DAY_LABELS_EN : ALARM_DAY_LABELS_FR).map((day, idx) => {
                      const active = alarmDays.split(',').map(Number).includes(idx);
                      return (
                        <button key={day} type="button"
                          onClick={() => {
                            const current = alarmDays ? alarmDays.split(',').map(Number) : [];
                            const next = active ? current.filter(d => d !== idx) : [...current, idx].sort((a,b) => a-b);
                            setAlarmDays(next.join(','));
                            setProfileDirty(true);
                          }}
                          className={cn('py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all border',
                            active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settings_profile_alarm')}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={alarmSound} onChange={e => { setAlarmSound(e.target.value); setProfileDirty(true); }}
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors">
                      <option value="chime">🔔 Chime (default)</option>
                      <option value="none">🔇 Silent (voice only)</option>
                      <option value="radio-focus">🎵 Radio — Focus (SomaFM)</option>
                      <option value="radio-chill">🎵 Radio — Chill (SomaFM)</option>
                      <option value="radio-energy">🎵 Radio — Energy (SomaFM)</option>
                      <option value="radio-sleep">🎵 Radio — Sleep (SomaFM)</option>
                      <option value="radio-space">🎵 Radio — Space (SomaFM)</option>
                    </select>
                    <button onClick={handleTestSound}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0">
                      <Volume2 size={14} /> Test
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3 text-[11px] sm:text-xs space-y-1">
                  <p><span className="text-muted-foreground">Next wake:</span> {nextWakeLabel}</p>
                  <p><span className="text-muted-foreground">Snoozed until:</span> {snoozedUntilLabel ?? 'Not snoozed'}</p>
                  <p><span className="text-muted-foreground">Currently ringing:</span> {activeAlarmLabel ?? 'No active alarm'}</p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Droplets size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Water Break</h2>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-sm font-medium text-foreground">Enable water break reminders</p>
                  <button
                    type="button"
                    onClick={() => { setWaterBreakEnabled((v) => !v); setProfileDirty(true); }}
                    className={cn('rounded-xl px-3 py-1.5 text-xs font-bold transition-all border',
                      waterBreakEnabled ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border')}
                  >
                    {waterBreakEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">Interval</label>
                  <select
                    value={waterBreakIntervalMinutes}
                    onChange={(e) => { setWaterBreakIntervalMinutes(Number(e.target.value)); setProfileDirty(true); }}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={45}>Every 45 minutes</option>
                    <option value={60}>Every 60 minutes</option>
                    <option value={90}>Every 90 minutes</option>
                  </select>
                </div>
              </div>

              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Calendar Event Alerts</h2>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  Calendar alerts ring at your event reminder offsets and then repeat every 5 minutes until dismissed.
                </p>
                <div className="rounded-2xl border border-border bg-background px-4 py-3 text-[11px] sm:text-xs space-y-1">
                  <p><span className="text-muted-foreground">Next calendar alert:</span> {nextCalendarEventLabel}</p>
                  <p><span className="text-muted-foreground">Alert behavior:</span> 1 minute ring, repeat every 5 minutes until turned off</p>
                </div>
                <div className="space-y-2 rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Alarm diagnostics
                    </p>
                    <button
                      type="button"
                      onClick={() => { void requestPermission(); }}
                      className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent/10 transition-colors"
                    >
                      Allow notifications
                    </button>
                  </div>
                  <div className="space-y-1 text-[11px] sm:text-xs">
                    <p><span className="text-muted-foreground">Notification permission:</span> {permission}</p>
                    <p><span className="text-muted-foreground">Service worker:</span> {swReady ? 'ready' : 'not ready'}</p>
                    <p><span className="text-muted-foreground">Push subscription:</span> {pushSubscribed === null ? 'checking…' : (pushSubscribed ? 'registered' : 'not registered')}</p>
                    <p><span className="text-muted-foreground">Last alarm signal:</span> {lastAlarmSignalAt ? new Date(lastAlarmSignalAt).toLocaleString() : 'none yet'}</p>
                  </div>
                </div>
              </div>

              <button disabled={!profileDirty || saveProfileMutation.isPending}
                onClick={() => saveProfileMutation.mutate({
                  wakeUpTime, dailyRoutine, preferencesSummary, alarmSound, alarmDays, voiceId, buddyPersonality
                } as any)}
                className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all',
                  profileDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                <Save size={14} />{saveProfileMutation.isPending ? 'Saving...' : 'Save Alarm Settings'}
              </button>
            </motion.div>
          )}

          {activeTab === 'persona' && (
            <motion.div key="persona" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Wand2 size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Assistant Persona</h2>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">Give your assistant a custom name and personality style. This shapes how it speaks to you in every conversation.</p>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">Assistant Name</label>
                  <input type="text" value={personaName} maxLength={64}
                    onChange={e => { setPersonaName(e.target.value); setPersonaDirty(true); }}
                    placeholder="e.g. Aria, Max, Nova, Flow Guru"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Leave blank to use the default name "FLO GURU".</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">Personality Style</label>
                  <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                    {PERSONA_STYLES.map(opt => (
                      <button key={opt.value} onClick={() => { setPersonaStyle(opt.value); setPersonaDirty(true); }}
                        className={cn('flex flex-col items-start gap-0.5 px-4 py-3 rounded-2xl border text-left transition-all',
                          personaStyle === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40')}>
                        <span className="text-[13px] sm:text-sm font-semibold">{opt.label}</span>
                        <span className="text-[9px] sm:text-[10px] opacity-70">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button disabled={!personaDirty || savePersonaMutation.isPending}
                  onClick={() => savePersonaMutation.mutate({ personaName, personaStyle })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all',
                    personaDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{savePersonaMutation.isPending ? 'Saving...' : 'Save Persona'}
                </button>
              </div>

              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Volume2 size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Buddy Voice</h2>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">Choose the voice that best fits your buddy's personality.</p>
                
                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                  {voicesQuery.isLoading && <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>}
                  {voicesQuery.data?.map((v: any) => (
                    <div key={v.voice_id} className={cn(
                      "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                      voiceId === v.voice_id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    )} onClick={() => { setVoiceId(v.voice_id); setProfileDirty(true); }}>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate">{v.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{v.labels?.gender || 'Voice'} • {v.labels?.accent || 'Natural'}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v.voice_id, v.preview_url); }}
                        className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-primary/20 transition-all text-primary"
                        disabled={voicePreviewLoading === v.voice_id}
                      >
                        {voicePreviewLoading === v.voice_id ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">Buddy Personality (AI Context)</label>
                  <textarea rows={3} value={buddyPersonality} onChange={e => { setBuddyPersonality(e.target.value); setProfileDirty(true); }}
                    placeholder="e.g. You are a supportive and sarcastic companion who loves tech and deep house music."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none" />
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">This tells the AI how to behave and what to remember about its own personality.</p>
                </div>

                <button disabled={!profileDirty || saveProfileMutation.isPending}
                  onClick={() => saveProfileMutation.mutate({ 
                    wakeUpTime, dailyRoutine, preferencesSummary, alarmSound, alarmDays, voiceId, buddyPersonality 
                  })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all',
                    profileDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveProfileMutation.isPending ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'instructions' && (
            <motion.div key="instructions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-primary" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Custom Instructions</h2>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">These instructions are applied to every conversation. Use them to define how your assistant should behave.</p>
                <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
                  <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] sm:text-xs text-foreground leading-relaxed">
                    <span className="font-bold">Honesty is always enforced.</span> Your assistant will never lie, fabricate facts, or return mock data — regardless of what is written here.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Instructions</label>
                  <textarea rows={8} value={instructions} onChange={e => { setInstructions(e.target.value); setInstructionsDirty(true); }}
                    placeholder={"Examples:\n- Always call me Brandon\n- Keep all responses under 2 sentences\n- You are my personal productivity coach\n- Always suggest a next action after answering\n- Speak to me like a close friend"}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none font-mono" />
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground text-right">{instructions.length}/2000</p>
                </div>
                <button disabled={!instructionsDirty || saveInstructionsMutation.isPending}
                  onClick={() => saveInstructionsMutation.mutate({ instructions })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all',
                    instructionsDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveInstructionsMutation.isPending ? 'Saving...' : 'Save Instructions'}
                </button>
              </div>
              <div className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">Instructions take effect on the next message you send. They apply to every conversation going forward.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'integrations' && (
            <motion.div key="integrations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <IntegrationsPanel />
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div key="billing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-primary" />
                    <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Billing</h2>
                  </div>
                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                    billingStatus?.isPro ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                  )}>
                    {billingLoading ? 'Loading' : billingStatus?.isPro ? 'Pro' : 'Free'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">
                  Start free, then upgrade when Flow Guru becomes part of your daily routine.
                </p>

                {(isBillingUnauthenticated || checkoutError) && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-bold text-foreground">Sign in to upgrade</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {checkoutError ?? 'Create or sign into your account first so your Flow Guru Monthly plan is linked to you.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSignInForUpgrade('billing_inline_prompt')}
                      className="shrink-0 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90"
                    >
                      Sign in
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                    <div>
                      <p className="text-sm font-bold">Free</p>
                      <p className="text-2xl font-black mt-1">$0</p>
                    </div>
                    <ul className="space-y-2 text-[11px] sm:text-xs text-muted-foreground">
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />10 assistant messages per day</li>
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />Basic lists, weather, and calendar view</li>
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />Limited memory for trying the assistant</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-bold">Flow Guru Monthly</p>
                      <p className="text-2xl font-black mt-1">CA$4.99<span className="text-xs font-semibold text-muted-foreground">/mo</span></p>
                    </div>
                    <ul className="space-y-2 text-[11px] sm:text-xs text-muted-foreground">
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />More assistant usage for daily planning</li>
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />Full memory and smart list workflows</li>
                      <li className="flex gap-2"><CheckCircle2 size={13} className="text-primary shrink-0 mt-0.5" />Calendar integrations, voice, and upcoming automation tools</li>
                    </ul>
                    <div className="space-y-1">
                      <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Promo code
                      </label>
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Enter promo code"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold tracking-wide focus:outline-none focus:border-primary/50"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Share code: <span className="font-semibold text-primary">GURU1976</span>
                      </p>
                    </div>
                    <button
                      disabled={checkoutLoading || billingStatus?.isPro}
                      onClick={isBillingUnauthenticated ? () => handleSignInForUpgrade('billing_plan_button') : handleUpgrade}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                        billingStatus?.isPro
                          ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      )}
                    >
                      {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                      {billingStatus?.isPro ? 'Current plan' : isBillingUnauthenticated ? 'Sign in to upgrade' : 'Upgrade to Monthly'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={fetchBillingStatus}
                  disabled={billingLoading}
                  className="w-full border border-border rounded-2xl py-3 text-xs font-semibold text-muted-foreground hover:bg-accent/10 transition-colors"
                >
                  {billingLoading ? 'Refreshing...' : 'Refresh billing status'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ── Integrations Panel (fetches live status) ──────────────────────── */
function IntegrationsPanel() {
  const [status, setStatus] = React.useState<{ googleCalendar: boolean; googleCalendarLabel?: string }>({ googleCalendar: false });
  const [loading, setLoading] = React.useState(true);

  const fetchStatus = async () => {
    try {
      const resp = await fetch('/api/integrations/status', { credentials: 'include' });
      if (resp.ok) {
        setStatus(await resp.json());
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  React.useEffect(() => { fetchStatus(); }, []);

  const disconnect = async (provider: string) => {
    try {
      await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST', credentials: 'include' });
      toast.success(`${provider === 'google-calendar' ? 'Google Calendar' : provider} disconnected`);
      fetchStatus();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Share2 size={14} className="text-primary" />
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-muted-foreground">Service Integrations</h2>
      </div>
      <p className="text-[11px] sm:text-xs text-muted-foreground -mt-2 leading-relaxed">Connect your external accounts to allow your assistant to manage your schedule and music.</p>

      <div className="space-y-3">

        {/* Google Calendar */}
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between p-4 bg-background border border-border rounded-2xl gap-3">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm-7-7h5v5h-5v-5z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">Google Calendar</p>
              {status.googleCalendar ? (
                <p className="text-[10px] text-blue-500 uppercase tracking-wider font-semibold break-words">Connected as {status.googleCalendarLabel ?? 'User'}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Schedule & Events</p>
              )}
            </div>
          </div>
          {status.googleCalendar ? (
            <button
              onClick={() => disconnect('google-calendar')}
              className="w-full xs:w-auto px-6 py-3 rounded-2xl bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/api/integrations/google-calendar/start'}
              className="w-full xs:w-auto px-8 py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all shrink-0 shadow-lg shadow-primary/20"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
        <AlertCircle size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Flow Guru uses end-to-end encryption for your service tokens. We never store your passwords, and you can revoke access at any time from your Google account settings.
        </p>
      </div>
    </div>
  );
}
