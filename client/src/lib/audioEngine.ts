/**
 * audioEngine.ts
 *
 * Lightweight audio manager for Flow Guru.
 * Uses plain HTMLAudioElement for playback (avoids CORS issues).
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
  console.log(`[audioEngine] playUrl: ${url} on ${channel}`);
  const audio = new Audio();
  
  // CORS: Do NOT set anonymous for radio streams unless visualizing, 
  // as it triggers strict CORS checks which SomaFM fails.
  // audio.crossOrigin = 'anonymous'; 

  if (channel === 'music') {
    if (musicAudio) {
      musicAudio.pause();
      musicAudio.src = '';
    }
    musicAudio = audio;
    audio.volume = effectiveMusicVolume();
    audio.onended = () => {
      console.log('[audioEngine] music ended');
      if (musicAudio === audio) musicAudio = null;
      onEnded?.();
    };
  } else {
    if (voiceAudio) {
      voiceAudio.pause();
      voiceAudio.src = '';
    }
    voiceAudio = audio;
    audio.volume = 1.0;
    duckMusic(true);
    audio.onended = () => {
      console.log('[audioEngine] voice ended');
      if (voiceAudio === audio) voiceAudio = null;
      duckMusic(false);
      onEnded?.();
    };
  }

  audio.src = url;
  audio.play().catch((err) => {
    console.warn('[audioEngine] playback failed:', err);
    if (channel === 'voice') duckMusic(false);
    onEnded?.();
  });

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
    musicAudio = null;
  }
}

/** Unlock audio on iOS / Chrome — plays a silent buffer. */
export function unlockAudio(): void {
  // Valid 1-second silent MP3
  const silentSrc = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  const silent = new Audio(silentSrc);
  silent.volume = 0.01;
  silent.play().catch(() => {});
}

import { useEffect } from 'react';

export function useAudioUnlock(): void {
  useEffect(() => {
    const handler = () => {
      console.log('[audioEngine] Unlocking audio via user gesture');
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
