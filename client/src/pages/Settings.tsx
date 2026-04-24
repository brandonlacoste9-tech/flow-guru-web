import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Brain, MessageSquare, Save, Trash2, Plus, Sparkles, CheckCircle2, AlertCircle, Volume2, Wand2, Gift, Copy, Share2 } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

type Tab = 'profile' | 'memory' | 'persona' | 'instructions' | 'referral' | 'integrations';

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
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const [wakeUpTime, setWakeUpTime] = useState('');
  const [alarmSound, setAlarmSound] = useState<string>('chime');
  const [alarmDays, setAlarmDays] = useState<string>('0,1,2,3,4,5,6');
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

  const profileQuery = trpc.settings.getProfile.useQuery(undefined);

  useEffect(() => {
    const data = profileQuery.data as any;
    if (!data) return;
    setWakeUpTime(data.wakeUpTime ?? '');
    setAlarmSound(data.alarmSound ?? 'chime');
    setAlarmDays(data.alarmDays ?? '0,1,2,3,4,5,6');
    setDailyRoutine(data.dailyRoutine ?? '');
    setPreferencesSummary(data.preferencesSummary ?? '');
    setInstructions(data.customInstructions ?? '');
  }, [profileQuery.data]);

  const factsQuery = trpc.settings.getMemoryFacts.useQuery();
  const personaQuery = trpc.settings.getPersona.useQuery(undefined);
  const referralQuery = trpc.settings.getReferralInfo.useQuery(undefined);

  useEffect(() => {
    const data = personaQuery.data as any;
    if (!data) return;
    setPersonaName(data.personaName ?? '');
    setPersonaStyle(data.personaStyle ?? '');
  }, [personaQuery.data]);

  const saveProfileMutation = trpc.settings.saveProfile.useMutation({
    onSuccess: () => { toast.success('Profile saved!'); setProfileDirty(false); profileQuery.refetch(); },
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
  const facts = (Array.isArray(factsRaw) ? factsRaw : []).filter((f: any) => f.factKey !== 'custom_instructions');

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

  const TABS = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'memory' as Tab, label: 'Memory', icon: Brain },
    { id: 'persona' as Tab, label: 'Persona', icon: Wand2 },
    { id: 'instructions' as Tab, label: 'Instructions', icon: MessageSquare },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Share2 },
    { id: 'referral' as Tab, label: 'Referral', icon: Gift },
  ];

  const PERSONA_STYLES = [
    { value: '', label: '⚡ Default', desc: 'High-energy & smooth' },
    { value: 'professional and concise', label: '💼 Professional', desc: 'Formal & to the point' },
    { value: 'casual and friendly like a best friend', label: '😎 Casual', desc: 'Relaxed & conversational' },
    { value: 'motivational and inspiring like a life coach', label: '🔥 Motivational', desc: 'Pumped up & inspiring' },
    { value: 'witty and humorous with clever jokes', label: '😂 Witty', desc: 'Funny & clever' },
    { value: 'calm, zen, and mindful', label: '🧘 Zen', desc: 'Calm & mindful' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/')} className="w-9 h-9 rounded-2xl border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-bold tracking-tight">AI Settings</h1>
            <p className="text-xs text-muted-foreground">Train and personalise your assistant</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Scrollable tab bar */}
        <div className="flex gap-1.5 mb-8 bg-secondary/40 p-1 rounded-2xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn('flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap',
                  activeTab === tab.id ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground')}>
                <Icon size={13} />{tab.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <User size={14} className="text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Personal Profile</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">Tell your assistant about yourself so it can give better, more personalised responses.</p>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wake-up Time</label>
                  <input type="time" value={wakeUpTime} onChange={e => { setWakeUpTime(e.target.value); setProfileDirty(true); }}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily Routine</label>
                  <textarea rows={3} value={dailyRoutine} onChange={e => { setDailyRoutine(e.target.value); setProfileDirty(true); }}
                    placeholder="e.g. I wake up at 6am, work out, then start work at 9am. I take a lunch break at noon..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preferences & Interests</label>
                  <textarea rows={3} value={preferencesSummary} onChange={e => { setPreferencesSummary(e.target.value); setProfileDirty(true); }}
                    placeholder="e.g. I love hip-hop, tech, fitness. I prefer concise answers. I'm building a SaaS startup..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alarm Sound</label>
                  <div className="flex gap-2">
                    <select value={alarmSound} onChange={e => { setAlarmSound(e.target.value); setProfileDirty(true); }}
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors">
                      <option value="chime">🔔 Chime (default)</option>
                      <option value="none">🔇 Silent (voice only)</option>
                      <option value="radio-focus">🎵 Radio — Focus (Groove Salad)</option>
                      <option value="radio-chill">🎵 Radio — Chill (Lush)</option>
                      <option value="radio-energy">🎵 Radio — Energy (Beat Blender)</option>
                      <option value="radio-sleep">🎵 Radio — Sleep (Sleep Bot)</option>
                      <option value="radio-space">🎵 Radio — Space (Deep Space One)</option>
                    </select>
                    <button onClick={handleTestSound}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0">
                      <Volume2 size={14} /> Test
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Click Test to preview the selected alarm sound.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alarm Days</label>
                  <div className="flex gap-1.5">
                    {(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const).map((day, idx) => {
                      const active = alarmDays.split(',').map(Number).includes(idx);
                      return (
                        <button key={day} type="button"
                          onClick={() => {
                            const current = alarmDays ? alarmDays.split(',').map(Number) : [];
                            const next = active ? current.filter(d => d !== idx) : [...current, idx].sort((a,b) => a-b);
                            setAlarmDays(next.join(','));
                            setProfileDirty(true);
                          }}
                          className={cn('flex-1 py-2 rounded-xl text-xs font-bold transition-all border',
                            active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Select which days of the week the wake-up alarm fires.</p>
                </div>
                <button disabled={!profileDirty || saveProfileMutation.isPending}
                  onClick={() => saveProfileMutation.mutate({ wakeUpTime, dailyRoutine, preferencesSummary, alarmSound, alarmDays } as any)}
                  className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                    profileDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'memory' && (
            <motion.div key="memory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-card border border-border rounded-3xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Brain size={14} className="text-primary" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Memory Manager</h2>
                  </div>
                  <button onClick={() => setShowAddFact(v => !v)} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary hover:underline">
                    <Plus size={12} /> Add
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-5">Everything your assistant has learned about you. Remove anything you don't want it to remember.</p>
                <AnimatePresence>
                  {showAddFact && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
                      <div className="bg-background border border-border rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add a memory</p>
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
                            className="flex-1 border border-border py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-accent/10 transition-colors">
                            Cancel
                          </button>
                          <button
                            disabled={!newFactValue.trim() || addFactMutation.isPending}
                            onClick={() => addFactMutation.mutate({ factKey: 'note', factValue: newFactValue.trim() })}
                            className="flex-1 bg-primary text-primary-foreground py-2 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
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
                <div className="space-y-2">
                  {facts.map((fact: any) => (
                    <motion.div key={fact.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      className="flex items-start gap-3 bg-background border border-border rounded-2xl px-4 py-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{fact.factKey ?? fact.category}</p>
                        <p className="text-sm text-foreground mt-0.5 leading-snug">{fact.factValue}</p>
                      </div>
                      <button onClick={() => deleteFactMutation.mutate({ factId: fact.id })}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'persona' && (
            <motion.div key="persona" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Wand2 size={14} className="text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Assistant Persona</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">Give your assistant a custom name and personality style. This shapes how it speaks to you in every conversation.</p>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assistant Name</label>
                  <input type="text" value={personaName} maxLength={64}
                    onChange={e => { setPersonaName(e.target.value); setPersonaDirty(true); }}
                    placeholder="e.g. Aria, Max, Nova, Flow Guru"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
                  <p className="text-[10px] text-muted-foreground">Leave blank to use the default name "FLO GURU".</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personality Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERSONA_STYLES.map(opt => (
                      <button key={opt.value} onClick={() => { setPersonaStyle(opt.value); setPersonaDirty(true); }}
                        className={cn('flex flex-col items-start gap-0.5 px-4 py-3 rounded-2xl border text-left transition-all',
                          personaStyle === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40')}>
                        <span className="text-sm font-semibold">{opt.label}</span>
                        <span className="text-[10px]">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button disabled={!personaDirty || savePersonaMutation.isPending}
                  onClick={() => savePersonaMutation.mutate({ personaName, personaStyle })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                    personaDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{savePersonaMutation.isPending ? 'Saving...' : 'Save Persona'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'instructions' && (
            <motion.div key="instructions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={14} className="text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Custom Instructions</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">These instructions are applied to every conversation. Use them to define how your assistant should behave.</p>
                <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
                  <CheckCircle2 size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">
                    <span className="font-bold">Honesty is always enforced.</span> Your assistant will never lie, fabricate facts, or return mock data — regardless of what is written here.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Instructions</label>
                  <textarea rows={8} value={instructions} onChange={e => { setInstructions(e.target.value); setInstructionsDirty(true); }}
                    placeholder={"Examples:\n- Always call me Brandon\n- Keep all responses under 2 sentences\n- You are my personal productivity coach\n- Always suggest a next action after answering\n- Speak to me like a close friend"}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none font-mono" />
                  <p className="text-[10px] text-muted-foreground text-right">{instructions.length}/2000</p>
                </div>
                <button disabled={!instructionsDirty || saveInstructionsMutation.isPending}
                  onClick={() => saveInstructionsMutation.mutate({ instructions })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                    instructionsDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveInstructionsMutation.isPending ? 'Saving...' : 'Save Instructions'}
                </button>
              </div>
              <div className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">Instructions take effect on the next message you send. They apply to every conversation going forward.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'integrations' && (
            <motion.div key="integrations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <IntegrationsPanel />
            </motion.div>
          )}
          {activeTab === 'referral' && (
            <motion.div key="referral" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Gift size={14} className="text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Referral Program</h2>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">Share your referral code with friends. When they sign up using your code, you both earn bonus credits.</p>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Referral Code</label>
                  {(referralQuery.data as any)?.referralCode ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono font-bold tracking-widest text-primary">
                        {(referralQuery.data as any).referralCode}
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText((referralQuery.data as any).referralCode); toast.success('Copied to clipboard!'); }}
                        className="w-11 h-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground">
                        <Copy size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="bg-background border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground">
                      {referralQuery.isLoading ? 'Loading...' : 'Sign in to get your referral code.'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
                  <Sparkles size={14} className="text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Credits Balance</p>
                    <p className="text-xs text-muted-foreground">{(referralQuery.data as any)?.credits ?? 0} credits earned from referrals</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const code = (referralQuery.data as any)?.referralCode;
                    if (code) {
                      navigator.clipboard.writeText(`Join me on FLO GURU — the AI personal assistant that actually knows you. Sign up with my code ${code} at https://floguru.com`);
                      toast.success('Share message copied!');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all">
                  <Share2 size={14} />Share Your Code
                </button>
              </div>
              <div className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                <Gift size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">Referral credits can be used toward premium features. Credits are added automatically when your friend signs up using your code.</p>
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
  const [status, setStatus] = React.useState<{ googleCalendar: boolean; spotify: boolean; googleCalendarLabel?: string; spotifyLabel?: string }>({ googleCalendar: false, spotify: false });
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
      toast.success(`${provider === 'spotify' ? 'Spotify' : 'Google Calendar'} disconnected`);
      fetchStatus();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Share2 size={14} className="text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Service Integrations</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Connect your external accounts to allow your assistant to manage your schedule and music.</p>

      <div className="space-y-3">
        {/* Spotify */}
        <div className="flex items-center justify-between p-4 bg-background border border-border rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.307c-.216.354-.678.468-1.032.252-2.86-1.748-6.458-2.143-10.697-1.174-.405.093-.812-.162-.905-.567-.093-.405.162-.812.567-.905 4.636-1.06 8.597-.613 11.77 1.332.355.216.469.678.252 1.032zm1.465-3.266c-.272.443-.848.583-1.291.311-3.273-2.012-8.261-2.593-12.13-1.418-.496.15-.1.026-.646-.246-.15-.496.104-.1.026-.646.246 4.316-1.31 9.805-.66 13.513 1.616.443.272.583.848.311 1.291zm.143-3.41c-3.926-2.332-10.4-2.55-14.17-1.405-.603.183-1.242-.163-1.425-.766-.183-.603.163-1.242.766-1.425 4.32-1.313 11.474-1.06 16.002 1.626.541.321.716 1.022.395 1.563-.32.541-1.022.716-1.563.395l-.005.005z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold">Spotify</p>
              {status.spotify ? (
                <p className="text-[10px] text-[#1DB954] uppercase tracking-wider font-semibold">Connected as {status.spotifyLabel ?? 'Spotify'}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Music & Playlists</p>
              )}
            </div>
          </div>
          {status.spotify ? (
            <button
              onClick={() => disconnect('spotify')}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/api/integrations/spotify/start'}
              className="px-4 py-2 rounded-xl bg-secondary text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all"
            >
              Connect
            </button>
          )}
        </div>

        {/* Google Calendar */}
        <div className="flex items-center justify-between p-4 bg-background border border-border rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm-7-7h5v5h-5v-5z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold">Google Calendar</p>
              {status.googleCalendar ? (
                <p className="text-[10px] text-blue-500 uppercase tracking-wider font-semibold">Connected as {status.googleCalendarLabel ?? 'Google'}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Schedule & Events</p>
              )}
            </div>
          </div>
          {status.googleCalendar ? (
            <button
              onClick={() => disconnect('google-calendar')}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/api/integrations/google-calendar/start'}
              className="px-4 py-2 rounded-xl bg-secondary text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
        <AlertCircle size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Flow Guru uses end-to-end encryption for your service tokens. We never store your passwords, and you can revoke access at any time from your Google or Spotify account settings.
        </p>
      </div>
    </div>
  );
}
