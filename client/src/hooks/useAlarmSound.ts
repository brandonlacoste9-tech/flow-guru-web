/**
 * useAlarmSound
 * Plays an alarm sound when a reminder fires.
 * Supports:
 *   - 'chime'   : synthesised ascending chime via Web Audio API (no file needed)
 *   - 'radio'   : plays a SomaFM radio stream for 30 seconds then stops
 *   - 'none'    : silent (voice-only)
 */

export type AlarmSoundType = 'chime' | 'radio-focus' | 'radio-chill' | 'radio-energy' | 'radio-sleep' | 'radio-space' | 'none';

const RADIO_URLS: Record<string, string> = {
  'radio-focus':  'https://ice1.somafm.com/groovesalad-128-mp3',
  'radio-chill':  'https://ice1.somafm.com/lush-128-mp3',
  'radio-energy': 'https://ice1.somafm.com/beatblender-128-mp3',
  'radio-sleep':  'https://ice1.somafm.com/sleepbot-192-mp3',
  'radio-space':  'https://ice1.somafm.com/deepspaceone-128-mp3',
};

// Synthesise a pleasant ascending chime using Web Audio API
function playChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
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
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.start(start);
      osc.stop(start + 0.9);
    });
    // Repeat chime 3 times
    setTimeout(() => playChimeOnce(ctx), 1100);
    setTimeout(() => playChimeOnce(ctx), 2200);
  } catch {
    // Web Audio not available — silent
  }
}

function playChimeOnce(ctx: AudioContext): void {
  const notes = [523.25, 659.25, 783.99, 1046.50];
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
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
    osc.start(start);
    osc.stop(start + 0.9);
  });
}

let radioAudio: HTMLAudioElement | null = null;
let radioTimeout: ReturnType<typeof setTimeout> | null = null;

function stopRadio() {
  if (radioTimeout) { clearTimeout(radioTimeout); radioTimeout = null; }
  if (radioAudio) { radioAudio.pause(); radioAudio.src = ''; radioAudio = null; }
}

function playRadio(type: AlarmSoundType, durationMs = 30000): void {
  stopRadio();
  const url = RADIO_URLS[type];
  if (!url) return;
  radioAudio = new Audio(url);
  radioAudio.volume = 0.7;
  radioAudio.play().catch(() => {}); // autoplay may be blocked — best effort
  radioTimeout = setTimeout(stopRadio, durationMs);
}

export function playAlarmSound(type: AlarmSoundType, durationMs = 30000): void {
  if (type === 'none') return;
  if (type === 'chime') { playChime(); return; }
  playRadio(type, durationMs);
}

export function stopAlarmSound(): void {
  stopRadio();
}
