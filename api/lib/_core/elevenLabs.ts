import { ENV } from "./env.js";

/**
 * ElevenLabs API integration for Voice Synthesis and Voice Conversion
 */

export type TtsOptions = {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
};

export type SpeechToSpeechOptions = {
  audioUrl: string;
  voiceId?: string;
  modelId?: string;
};

const DEFAULT_VOICE_ID = "21m00Tcm4labaLnx8CuA"; // Rachel (Classic)
const DEFAULT_TTS_MODEL = "eleven_monolingual_v1";
const DEFAULT_STS_MODEL = "eleven_english_sts_v2";

/**
 * Convert text to speech using ElevenLabs
 */
export async function textToSpeech(options: TtsOptions): Promise<Buffer> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is not configured.");
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId || DEFAULT_TTS_MODEL,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${error}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Convert speech to another voice using ElevenLabs Speech-to-Speech
 */
export async function speechToSpeech(options: SpeechToSpeechOptions): Promise<Buffer> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is not configured.");
  }

  // Download source audio
  const audioResp = await fetch(options.audioUrl);
  if (!audioResp.ok) {
    throw new Error(`Failed to fetch source audio: ${audioResp.status}`);
  }
  const audioBlob = await audioResp.blob();

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`;

  const formData = new FormData();
  formData.append("audio", audioBlob);
  formData.append("model_id", options.modelId || DEFAULT_STS_MODEL);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs STS failed: ${response.status} ${error}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Get a list of available voices from ElevenLabs
 */
export async function getVoices(): Promise<any[]> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is not configured.");
  }

  const url = "https://api.elevenlabs.io/v1/voices";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs Get Voices failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.voices;
}
