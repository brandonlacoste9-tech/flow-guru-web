import { Express } from "express";
import { textToSpeech, textToSpeechStream } from "../../api/lib/_core/elevenLabs.js";
import { Readable } from "stream";

// Re-export so sibling modules (briefing.ts) can import from this path
export { textToSpeech, textToSpeechStream, generateSound, generateSoundAsDataUri, getVoices } from "../../api/lib/_core/elevenLabs.js";
export type { TtsOptions, SoundGenerationOptions } from "../../api/lib/_core/elevenLabs.js";

export function registerElevenLabsRoutes(app: Express) {
  app.get("/api/speak", async (req, res) => {
    try {
      const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam - free-tier safe voice
      const text = req.query.text as string;
      const voiceId = (req.query.voiceId as string | undefined) ?? DEFAULT_VOICE_ID;

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
