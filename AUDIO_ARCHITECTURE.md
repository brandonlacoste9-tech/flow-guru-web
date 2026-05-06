# Flow Guru Audio Architecture & Troubleshooting Guide

This document explains the unified audio system in Flow Guru and how to maintain it.

## 🏗️ Core Architecture

The audio system is centralized in `client/src/lib/audioEngine.ts`. It uses a **Singleton Pattern** with two permanent `HTMLAudioElement` instances:

1.  **`musicAudio`**: Used for radio streams (SomaFM).
2.  **`voiceAudio`**: Used for AI voice synthesis (ElevenLabs) and alarms.

### Why Singletons?
Mobile browsers (especially iOS Safari) and modern desktop browsers have extremely strict **Autoplay Policies**. They will block any audio that isn't triggered by a direct user gesture (click/tap). 
- Reusing the same two elements is much more reliable than creating new ones.
- Once an element is "unlocked" via a user gesture, the browser allows us to swap the `.src` and play new sounds indefinitely.

## 🔓 The "Unlock" Mechanism

We use the `useAudioUnlock()` hook (called in `Home.tsx`) to prime the audio session.
- It listens for the **first** click, keypress, or touch on the entire page.
- It plays a **1-second silent WAV buffer** on both singletons.
- This "warms up" the audio session so that subsequent AI replies or station changes work instantly.

## 🛡️ Content Security Policy (CSP)

**CRITICAL:** If audio is silent in production but works locally, check `vercel.json`.
The site uses a strict CSP. If external origins aren't whitelisted, the browser will block the audio stream before it even starts.

Current required `media-src` origins:
- `self`: For local assets.
- `data:`: Required for base64-encoded AI voice synthesis.
- `blob:`: Required for some dynamic audio buffers.
- `https://ice1.somafm.com` through `https://ice5.somafm.com`: Radio streams.
- `https://api.elevenlabs.io`: Direct synthesis if used.

## 📻 Troubleshooting "The Silence"

If audio stops working, check these in order:

1.  **Browser Console**: Look for `[audioEngine]` logs.
    - If you see `CSP Violation`, update `media-src` in `vercel.json`.
    - If you see `Playback Rejected`, the user hasn't interacted with the page yet, or the "unlock" didn't fire.
2.  **CORS Issues**: **DO NOT** add `audio.crossOrigin = 'anonymous'` for radio streams. Most radio servers (like SomaFM) do not support CORS headers, and adding this attribute will cause the browser to block the stream.
3.  **Stream Race Conditions**: If stations aren't switching, ensure `audio.load()` is called after setting a new `src`. This forces the browser to drop the old stream connection immediately.
4.  **Ducking Logic**: If music is too quiet, check if a `voiceAudio` stream "hung" and didn't fire the `onended` event to call `duckMusic(false)`.

---
*Maintenance Note: This architecture was finalized on 2026-05-05 to solve persistent cross-browser silent-playback issues.*
