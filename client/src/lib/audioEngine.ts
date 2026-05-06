/**
 * audioEngine.ts
 *
 * Lightweight audio manager for Flow Guru.
 * Uses plain HTMLAudioElement for playback (avoids CORS issues with
 * createMediaElementSource on cross-origin streams like SomaFM).
 *
 * Provides:
 *  - Separate music / voice channels
 *  - Volume control per channel
 *  - Auto-ducking of music while voice plays
 *  - iOS / Chrome autoplay-unlock helper
 */

// ─── State ───────────────────────────────────────────────────────────────────
let musicAudio: HTMLAudioElement | null = null;
let voiceAudio: HTMLAudioElement | null = null;

let musicVolume = 0.8;
let musicMuted  = false;
let ducked      = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function effectiveMusicVolume(): number {
  if (musicMuted) return 0;
  return ducked ? musicVolume * 0.2 : musicVolume;
}

function applyMusicVolume(): void {
  if (musicAudio) {
    musicAudio.volume = effectiveMusicVolume();
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Play a URL on either the music or voice channel. Returns the HTMLAudioElement. */
export function playUrl(
  url: string,
  channel: 'music' | 'voice' = 'music',
  onEnded?: () => void,
): HTMLAudioElement {
  const audio = new Audio(url);
  audio.crossOrigin = 'anonymous';

  if (channel === 'music') {
    // Stop previous music
    if (musicAudio) {
      musicAudio.pause();
      musicAudio.src = '';
    }
    musicAudio = audio;
    audio.volume = effectiveMusicVolume();
    audio.onended = () => {
      if (musicAudio === audio) musicAudio = null;
      onEnded?.();
    };
    audio.onerror = () => {
      // Retry without crossOrigin (some streams reject it)
      if (audio.crossOrigin) {
        const retry = new Audio(url);
        retry.volume = effectiveMusicVolume();
        retry.onended = audio.onended;
        retry.onerror = () => { onEnded?.(); };
        musicAudio = retry;
        retry.play().catch(() => { onEnded?.(); });
        return;
      }
      onEnded?.();
    };
  } else {
    // Voice channel
    if (voiceAudio) {
      voiceAudio.pause();
      voiceAudio.src = '';
    }
    voiceAudio = audio;
    audio.volume = 1.0;
    duckMusic(true);
    audio.onended = () => {
      if (voiceAudio === audio) voiceAudio = null;
      duckMusic(false);
      onEnded?.();
    };
    audio.onerror = () => {
      duckMusic(false);
      onEnded?.();
    };
  }

  audio.play().catch((err) => {
    console.warn('[audioEngine] playback failed:', url, err);
    if (channel === 'voice') duckMusic(false);
    onEnded?.();
  });

  return audio;
}

/** Set music volume (0–1). */
export function setMusicVolume(vol: number, muted: boolean): void {
  musicVolume = vol;
  musicMuted  = muted;
  applyMusicVolume();
}

/** Set voice volume (0–1). */
export function setVoiceVolume(vol: number, _muted: boolean): void {
  if (voiceAudio) voiceAudio.volume = _muted ? 0 : vol;
}

/** Duck (lower) music while voice is playing. */
export function duckMusic(duck: boolean): void {
  ducked = duck;
  applyMusicVolume();
}

/** Stop the currently playing music. */
export function stopMusic(): void {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.src = '';
    musicAudio = null;
  }
}

/** Unlock audio on iOS / Chrome — plays a silent buffer. Must be called after a user gesture. */
export function unlockAudio(): void {
  const silent = new Audio(
    'data:audio/mp3;base64,//OExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  );
  silent.volume = 0.01;
  silent.play().catch(() => {});
}

/** React hook — registers a one-time click/keydown listener to unlock audio. */
import { useEffect } from 'react';

export function useAudioUnlock(): void {
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);
}
