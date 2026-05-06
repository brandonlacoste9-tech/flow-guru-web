import { playUrl, stopMusic, unlockAudio } from '@/lib/audioEngine';

/**
 * useAlarmSound
 * Plays an alarm sound when a reminder fires.
 *
 * Browser autoplay policy: AudioContext and Audio elements require a prior
 * user gesture to play. We pre-warm via audioEngine's unlockAudio().
 *
 * Supports:
 *   'chime'        — plays Focus radio as a gentle wake-up tone
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

let radioTimeout: ReturnType<typeof setTimeout> | null = null;

function stopRadio(): void {
  if (radioTimeout) { clearTimeout(radioTimeout); radioTimeout = null; }
  stopMusic();
}

function playRadio(type: AlarmSoundType, durationMs: number): void {
  stopRadio();
  const url = RADIO_URLS[type];
  if (!url) return;
  playUrl(url, 'music');
  radioTimeout = setTimeout(stopRadio, durationMs);
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function playAlarmSound(type: AlarmSoundType, durationMs = 30000): void {
  if (type === 'none') return;
  if (type === 'chime') {
    // Use Focus radio as a gentle chime fallback
    playRadio('radio-focus', durationMs);
    return;
  }
  playRadio(type, durationMs);
}

export function stopAlarmSound(): void {
  stopRadio();
}

export function prewarmAudio(): void {
  unlockAudio();
}
