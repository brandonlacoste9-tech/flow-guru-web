import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Brain, MessageSquare, Save, Trash2, Plus, Sparkles, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

type Tab = 'profile' | 'memory' | 'instructions';

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

  const profileQuery = trpc.settings.getProfile.useQuery(undefined);

  // React Query v5: onSuccess on useQuery is removed — use useEffect watching .data instead
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

  // Fixed: use correct procedure name 'listFacts'
  const factsQuery = trpc.settings.listFacts.useQuery();

  const saveProfileMutation = trpc.settings.saveProfile.useMutation({
    onSuccess: () => { toast.success('Profile saved!'); setProfileDirty(false); profileQuery.refetch(); },
    onError: () => toast.error('Failed to save profile.'),
  });

  const saveInstructionsMutation = trpc.settings.saveCustomInstructions.useMutation({
    onSuccess: () => { toast.success('Custom instructions saved!'); setInstructionsDirty(false); },
    onError: () => toast.error('Failed to save instructions.'),
  });

  // Fixed: use correct procedure name 'deleteFact' and correct input key 'id'
  const deleteFactMutation = trpc.settings.deleteFact.useMutation({
    onSuccess: () => { toast.success('Memory removed.'); factsQuery.refetch(); },
    onError: () => toast.error('Failed to remove memory.'),
  });

  // Fixed: use correct procedure name 'addFact'
  const addFactMutation = trpc.settings.addFact.useMutation({
    onSuccess: () => {
      toast.success('Memory added!');
      setNewFactKey(''); setNewFactValue(''); setShowAddFact(false);
      factsQuery.refetch();
    },
    onError: () => toast.error('Failed to add memory.'),
  });

  const facts = (Array.isArray(factsQuery.data) ? factsQuery.data : []).filter((f: any) => f.factKey !== 'custom_instructions');

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
    { id: 'instructions' as Tab, label: 'Instructions', icon: MessageSquare },
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
        <div className="flex gap-2 mb-8 bg-secondary/40 p-1 rounded-2xl">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  activeTab === tab.id ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground')}>
                <Icon size={14} />{tab.label}
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
                <button disabled={!profileDirty || saveProfileMutation.isLoading}
                  onClick={() => saveProfileMutation.mutate({ wakeUpTime, dailyRoutine, preferencesSummary, alarmSound, alarmDays } as any)}
                  className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                    profileDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveProfileMutation.isLoading ? 'Saving...' : 'Save Profile'}
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
                        <input type="text" value={newFactKey} onChange={e => setNewFactKey(e.target.value)} placeholder="Key (e.g. favourite_food)"
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" />
                        <input type="text" value={newFactValue} onChange={e => setNewFactValue(e.target.value)} placeholder="Value (e.g. sushi)"
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" />
                        <button disabled={!newFactKey.trim() || !newFactValue.trim() || addFactMutation.isLoading}
                          onClick={() => addFactMutation.mutate({ factKey: newFactKey.trim(), factValue: newFactValue.trim() })}
                          className="w-full bg-primary text-primary-foreground py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                          {addFactMutation.isLoading ? 'Adding...' : 'Add Memory'}
                        </button>
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
                      {/* Fixed: use correct input key 'id' not 'factId' */}
                      <button onClick={() => deleteFactMutation.mutate({ id: fact.id })}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    </motion.div>
                  ))}
                </div>
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
                <button disabled={!instructionsDirty || saveInstructionsMutation.isLoading}
                  onClick={() => saveInstructionsMutation.mutate({ instructions })}
                  className={cn('w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all',
                    instructionsDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground cursor-not-allowed')}>
                  <Save size={14} />{saveInstructionsMutation.isLoading ? 'Saving...' : 'Save Instructions'}
                </button>
              </div>
              <div className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3">
                <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">Instructions take effect on the next message you send. They apply to every conversation going forward.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
