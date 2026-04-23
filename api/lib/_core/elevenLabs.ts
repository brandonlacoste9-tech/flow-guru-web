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

const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Brian — warm, natural, conversational
const DEFAULT_TTS_MODEL = "eleven_turbo_v2_5"; // Fastest + highest quality
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
        stability: options.stability ?? 0.35,
        similarity_boost: options.similarityBoost ?? 0.85,
        style: 0.2,
        use_speaker_boost: true,
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

export type SoundGenerationOptions = {
  /** Description of the sound to generate, e.g. "morning alarm chime", "relaxing ocean waves" */
  text: string;
  /** Duration in seconds (0.5 to 22). If omitted, the model picks an optimal length. */
  durationSeconds?: number;
  /** If true, the sound will loop seamlessly */
  loop?: boolean;
  /** 0 to 1 — how closely the model follows the prompt */
  promptInfluence?: number;
};

/**
 * Generate a sound effect or ambient audio using ElevenLabs Sound Generation API.
 * Returns raw audio as a Buffer (MP3).
 */
export async function generateSound(options: SoundGenerationOptions): Promise<Buffer> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is not configured.");
  }

  const url = "https://api.elevenlabs.io/v1/sound-generation";

  const body: Record<string, unknown> = {
    text: options.text,
    model_id: "eleven_text_to_sound_v2",
  };
  if (options.durationSeconds != null) body.duration_seconds = options.durationSeconds;
  if (options.loop != null) body.loop = options.loop;
  if (options.promptInfluence != null) body.prompt_influence = options.promptInfluence;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs Sound Generation failed: ${response.status} ${error}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generate a sound and return it as a base64 data URI for immediate playback.
 */
export async function generateSoundAsDataUri(options: SoundGenerationOptions): Promise<string> {
  const buffer = await generateSound(options);
  return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
}
