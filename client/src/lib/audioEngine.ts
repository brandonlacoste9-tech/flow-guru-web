import { useEffect } from 'react';

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let voiceGain: GainNode | null = null;
let currentAudio: HTMLAudioElement | null = null;

function ensureContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);

    musicGain = audioContext.createGain();
    musicGain.connect(masterGain);

    voiceGain = audioContext.createGain();
    voiceGain.connect(masterGain);
  }
  // Ensure the context is resumed (required after user interaction)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

/** Set the music volume (0‑1) */
export function setMusicVolume(volume: number, muted: boolean) {
  ensureContext();
  if (musicGain) {
    musicGain.gain.setTargetAtTime(muted ? 0 : volume, audioContext!.currentTime, 0.05);
  }
}

/** Set the voice volume (0‑1) */
export function setVoiceVolume(volume: number, muted: boolean) {
  ensureContext();
  if (voiceGain) {
    voiceGain.gain.setTargetAtTime(muted ? 0 : volume, audioContext!.currentTime, 0.05);
  }
}

/** Duck music volume for voice playback */
export function duckMusic(ducked: boolean) {
  ensureContext();
  if (musicGain) {
    musicGain.gain.setTargetAtTime(ducked ? 0.2 : 1.0, audioContext!.currentTime, 0.2);
  }
}

// Track sources to prevent "MediaElementAudioSourceNode has already been connected" errors
const sourceCache = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

/** Play an audio URL through the shared AudioContext. Returns the HTMLAudioElement for further control. */
export function playUrl(url: string, channel: 'music' | 'voice' = 'music', onEnded?: () => void) {
  ensureContext();
  
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous"; // Important for cross-origin streams like SomaFM
  
  let source = sourceCache.get(audio);
  if (!source) {
    source = audioContext!.createMediaElementSource(audio);
    sourceCache.set(audio, source);
  }

  const targetGain = channel === 'music' ? musicGain : voiceGain;
  source.disconnect();
  source.connect(targetGain!);

  if (channel === 'voice') {
    duckMusic(true);
    audio.addEventListener('ended', () => {
      duckMusic(false);
      onEnded?.();
    }, { once: true });
  } else {
    // For music, we track the current one to allow stopping it
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
    }
    currentAudio = audio;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      onEnded?.();
    };
  }

  audio.play().catch((err) => {
    console.warn(`Audio playback failed for ${url}:`, err);
    if (channel === 'voice') duckMusic(false);
  });
  
  return audio;
}

/** Stop the currently playing music audio, if any */
export function stopMusic() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

/** Unlock audio on iOS/Windows by playing a silent buffer – must be called after a user interaction */
export function unlockAudio() {
  ensureContext();
  const silent = new Audio('data:audio/mp3;base64,//OExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  silent.play().catch(() => {});
}

/** React hook – registers a one‑time click/keydown listener to unlock audio */
export function useAudioUnlock() {
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
