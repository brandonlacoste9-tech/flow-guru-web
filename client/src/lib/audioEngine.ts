/**
 * audioEngine.ts
 *
 * Lightweight audio manager for Flow Guru.
 * Uses singleton HTMLAudioElements for reliable playback and autoplay unlocking.
 */

// ─── Singletons ──────────────────────────────────────────────────────────────
let musicAudio: HTMLAudioElement | null = null;
let voiceAudio: HTMLAudioElement | null = null;

// Initialize singletons (client-side only)
if (typeof window !== 'undefined') {
  musicAudio = new Audio();
  musicAudio.preload = 'auto';
  (musicAudio as any).playsInline = true;
  
  voiceAudio = new Audio();
  voiceAudio.preload = 'auto';
  (voiceAudio as any).playsInline = true;
}

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
  console.log(`[audioEngine] playUrl: ${url} on ${channel}`);
  
  const audio = channel === 'music' ? musicAudio : voiceAudio;
  if (!audio) {
    console.error('[audioEngine] Audio singletons not initialized');
    return new Audio(); // Fallback to avoid crashes
  }

  // Stop current
  audio.pause();
  audio.src = url;
  audio.load();

  if (channel === 'music') {
    audio.volume = effectiveMusicVolume();
    audio.onended = () => {
      console.log('[audioEngine] music ended');
      onEnded?.();
    };
  } else {
    audio.volume = 1.0;
    duckMusic(true);
    audio.onended = () => {
      console.log('[audioEngine] voice ended');
      duckMusic(false);
      onEnded?.();
    };
  }

  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      console.warn('[audioEngine] playback failed:', err);
      if (channel === 'voice') duckMusic(false);
      onEnded?.();
    });
  }

  return audio;
}

export function setMusicVolume(vol: number, muted: boolean): void {
  musicVolume = vol;
  musicMuted  = muted;
  applyMusicVolume();
}

export function setVoiceVolume(vol: number, _muted: boolean): void {
  if (voiceAudio) voiceAudio.volume = _muted ? 0 : vol;
}

export function duckMusic(duck: boolean): void {
  ducked = duck;
  applyMusicVolume();
}

export function stopMusic(): void {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.src = '';
    musicAudio.load(); // Forces cleanup of stream
  }
}

/** Unlock audio on iOS / Chrome — plays a silent buffer. */
export function unlockAudio(): void {
  // We play the silent buffer on both singletons to "prime" them
  const silentSrc = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  
  if (musicAudio) {
    const oldSrc = musicAudio.src;
    musicAudio.src = silentSrc;
    musicAudio.play().then(() => {
       musicAudio!.pause();
       musicAudio!.src = oldSrc;
    }).catch(() => {});
  }
  
  if (voiceAudio) {
    const oldSrc = voiceAudio.src;
    voiceAudio.src = silentSrc;
    voiceAudio.play().then(() => {
       voiceAudio!.pause();
       voiceAudio!.src = oldSrc;
    }).catch(() => {});
  }
}

import { useEffect } from 'react';

export function useAudioUnlock(): void {
  useEffect(() => {
    const handler = () => {
      console.log('[audioEngine] Unlocking audio via user gesture');
      unlockAudio();
      window.removeEventListener('click', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };
    // Use capture phase to ensure we run before other handlers
    window.addEventListener('click', handler, true);
    window.addEventListener('keydown', handler, true);
    window.addEventListener('touchstart', handler, true);
    return () => {
      window.removeEventListener('click', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };
  }, []);
}
