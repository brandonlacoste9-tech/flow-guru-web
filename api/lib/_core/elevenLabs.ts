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

const DEFAULT_VOICE_ID = "CwhRBWXzGAHq8TQ4Fs17"; // Roger - Laid-Back, Casual, Resonant (account voice, free-tier safe)

const DEFAULT_TTS_MODEL = "eleven_turbo_v2_5";
const DEFAULT_STS_MODEL = "eleven_english_sts_v2";

const ttsCache = new Map<string, Buffer>();

const FALLBACK_VOICES = [
  { voice_id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", labels: { gender: "Male", accent: "US" } },
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", labels: { gender: "Female", accent: "US" } },
  { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", labels: { gender: "Female", accent: "US" } },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", labels: { gender: "Female", accent: "US" } },
  { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", labels: { gender: "Male", accent: "US" } },
  { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", labels: { gender: "Female", accent: "US" } },
  { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", labels: { gender: "Male", accent: "US" } },
  { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold", labels: { gender: "Male", accent: "US" } },
  { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", labels: { gender: "Male", accent: "US" } },
  { voice_id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", labels: { gender: "Male", accent: "US" } },
] as const;

export async function textToSpeech(options: TtsOptions): Promise<Buffer> {
  const apiKey = ENV.elevenLabsApiKey;
  const useLocalTts = ENV.useLocalAi && !options.voiceId;
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || DEFAULT_TTS_MODEL;
  
  const cacheKey = `${voiceId}:${modelId}:${options.text}`;
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey)!;
  }

  // Helper to fallback to Google TTS
  const fallbackToGoogleTTS = async (reason: string) => {
    console.warn(`[Flow Guru] Falling back to basic Google TTS. Reason: ${reason}`);
    try {
      const encodedText = encodeURIComponent(options.text.slice(0, 200)); 
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodedText}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        ttsCache.set(cacheKey, buffer);
        return buffer;
      }
    } catch (e) {
      console.warn("[Flow Guru] Google TTS fallback also failed", e);
    }
    throw new Error("Voice synthesis failed entirely.");
  };

  if (!apiKey && !useLocalTts) {
    return fallbackToGoogleTTS("ElevenLabs API key is missing");
  }

  const url = useLocalTts ? `${ENV.localAiUrl}/tts` : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const body: any = useLocalTts 
    ? { model: "en-us-librispeech-low.onnx", input: options.text }
    : {
        text: options.text,
        model_id: options.modelId || DEFAULT_TTS_MODEL,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
      };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(ENV.useLocalAi ? {} : { "xi-api-key": apiKey }),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Flow Guru] ElevenLabs API Error (${response.status}):`, errorText);
      return fallbackToGoogleTTS(`ElevenLabs API rejected the request (${response.status}) - Check Vercel logs for exact reason.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    ttsCache.set(cacheKey, buffer);
    return buffer;
  } catch (err: any) {
    console.error("[Flow Guru] ElevenLabs Network Exception:", err);
    return fallbackToGoogleTTS("Network error communicating with ElevenLabs");
  }
}

/**
 * Convert text to speech using ElevenLabs and return a stream for faster playback
 */
export async function textToSpeechStream(options: TtsOptions): Promise<ReadableStream<Uint8Array>> {
  const apiKey = ENV.elevenLabsApiKey;
  const useLocalTts = ENV.useLocalAi && !options.voiceId;
  if (!apiKey && !useLocalTts) {
    throw new Error("ElevenLabs API key is not configured.");
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const url = useLocalTts ? `${ENV.localAiUrl}/tts` : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

  const body: any = useLocalTts 
    ? { model: "en-us-librispeech-low.onnx", input: options.text } // LocalAI TTS payload
    : {
        text: options.text,
        model_id: options.modelId || DEFAULT_TTS_MODEL,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
      };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(ENV.useLocalAi ? {} : { "xi-api-key": apiKey }),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${error}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  return response.body;
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
    console.warn("[ElevenLabs] API key missing for getVoices; using fallback voices.");
    return [...FALLBACK_VOICES];
  }

  try {
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
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    if (voices.length > 0) return voices;
    console.warn("[ElevenLabs] Empty voice list returned; using fallback voices.");
    return [...FALLBACK_VOICES];
  } catch (error) {
    console.warn("[ElevenLabs] getVoices failed; using fallback voices.", error);
    return [...FALLBACK_VOICES];
  }
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

export function registerElevenLabsRoutes(app: any) {
  app.get("/api/speak", async (req: any, res: any) => {
    try {
      const text = req.query.text as string;
      const voiceId = req.query.voiceId as string | undefined;

      if (!text) {
        return res.status(400).send("Text query parameter is required");
      }

      console.log(`[ElevenLabs] Synthesizing: "${text.slice(0, 50)}..."`);
      
      const audioBuffer = await textToSpeech({ text, voiceId });

      res.setHeader("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
      
    } catch (error: any) {
      console.error("[ElevenLabs Error]", error);
      res.status(500).send(error.message);
    }
  });
}
