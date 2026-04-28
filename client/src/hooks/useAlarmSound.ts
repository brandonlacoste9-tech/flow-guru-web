/**
 * useAlarmSound
 * Plays an alarm sound when a reminder fires.
 *
 * Browser autoplay policy: AudioContext and Audio elements require a prior
 * user gesture to play. We pre-warm the AudioContext on the first user
 * interaction so it's in "running" state when the alarm fires later.
 *
 * Supports:
 *   'chime'        — synthesised ascending chime via Web Audio API
 *   'radio-*'      — SomaFM radio stream for 30 s then stops
 *   'none'         — silent (voice-only)
 */

export type AlarmSoundType =
  | 'chime'
  | 'radio-focus'
  | 'radio-chill'
  | 'radio-energy'
  | 'radio-sleep'
  | 'radio-space'
  | 'none';

const RADIO_URLS: Record<string, string> = {
  'radio-focus':  'https://ice1.somafm.com/groovesalad-128-mp3',
  'radio-chill':  'https://ice1.somafm.com/lush-128-mp3',
  'radio-energy': 'https://ice1.somafm.com/beatblender-128-mp3',
  'radio-sleep':  'https://ice1.somafm.com/sleepbot-192-mp3',
  'radio-space':  'https://ice1.somafm.com/deepspaceone-128-mp3',
};

// ─── Shared AudioContext (pre-warmed on first user gesture) ──────────────────
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _ctx;
}

/** Returns a running AudioContext, properly awaiting resume(). */
async function getRunningCtx(): Promise<AudioContext | null> {
  const ctx = getCtx();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return null; }
  }
  return ctx;
}

// Resume AudioContext when tab becomes visible again (browsers suspend it in background)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _ctx && _ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
  });
}

/**
 * Call this once on any user interaction (click, keydown, touchstart).
 * This unlocks the AudioContext so alarms can play without a gesture later.
 */
export function prewarmAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const doUnlock = () => {
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* ignore */ }
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(doUnlock).catch(() => {});
  } else {
    doUnlock();
  }
}

// ─── Chime ───────────────────────────────────────────────────────────────────
function scheduleChimeNotes(ctx: AudioContext, offsetSec: number): void {
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    // 0.15s safety buffer after resume to avoid scheduling notes in the past
    const t = ctx.currentTime + 0.15 + offsetSec + i * 0.22;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    osc.start(t);
    osc.stop(t + 0.85);
  });
}

async function playChime(): Promise<void> {
  // Must await resume() before scheduling notes — ctx.currentTime is 0 while suspended
  const ctx = await getRunningCtx();
  if (!ctx) return;
  scheduleChimeNotes(ctx, 0);
  scheduleChimeNotes(ctx, 1.1);
  scheduleChimeNotes(ctx, 2.2);
}

// ─── Radio ───────────────────────────────────────────────────────────────────
let radioAudio: HTMLAudioElement | null = null;
let radioTimeout: ReturnType<typeof setTimeout> | null = null;
let chimeInterval: ReturnType<typeof setInterval> | null = null;
let chimeStopTimeout: ReturnType<typeof setTimeout> | null = null;

function stopRadio(): void {
  if (radioTimeout) { clearTimeout(radioTimeout); radioTimeout = null; }
  if (radioAudio) {
    radioAudio.pause();
    radioAudio.src = '';
    radioAudio = null;
  }
}

function stopChimeLoop(): void {
  if (chimeInterval) {
    clearInterval(chimeInterval);
    chimeInterval = null;
  }
  if (chimeStopTimeout) {
    clearTimeout(chimeStopTimeout);
    chimeStopTimeout = null;
  }
}

function playChimeLoop(durationMs: number): void {
  stopChimeLoop();
  // Play immediately, then repeat at a steady cadence until stopped.
  void playChime();
  chimeInterval = setInterval(() => {
    void playChime();
  }, 8000);
  chimeStopTimeout = setTimeout(() => {
    stopChimeLoop();
  }, Math.max(1000, durationMs));
}

function playRadio(type: AlarmSoundType, durationMs: number): void {
  stopRadio();
  const url = RADIO_URLS[type];
  if (!url) return;
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.volume = 0.7;
  audio.src = url;
  radioAudio = audio;

  const tryPlay = () => {
    audio.play().catch(() => {
      // If autoplay blocked, await resume then retry once
      getRunningCtx().then(() => {
        audio.play().catch(() => {});
      });
    });
  };

  tryPlay();
  radioTimeout = setTimeout(stopRadio, durationMs);
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function playAlarmSound(type: AlarmSoundType, durationMs = 30000): void {
  if (type === 'none') return;
  if (type === 'chime') {
    playChimeLoop(durationMs);
    return;
  }
  playRadio(type, durationMs);
}

export function stopAlarmSound(): void {
  stopChimeLoop();
  stopRadio();
}
