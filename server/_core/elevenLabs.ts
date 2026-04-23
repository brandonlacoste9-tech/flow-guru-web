import { Express } from "express";
import { textToSpeech } from "../../api/lib/_core/elevenLabs.js";

// Re-export so sibling modules (briefing.ts) can import from this path
export { textToSpeech, generateSound, generateSoundAsDataUri } from "../../api/lib/_core/elevenLabs.js";
export type { TtsOptions, SoundGenerationOptions } from "../../api/lib/_core/elevenLabs.js";

export function registerElevenLabsRoutes(app: Express) {
  app.get("/api/speak", async (req, res) => {
    try {
      const text = req.query.text as string;
      if (!text) {
        return res.status(400).send("Text query parameter is required");
      }

      console.log(`[ElevenLabs] Synthesizing: "${text.slice(0, 50)}..."`);
      const audioBuffer = await textToSpeech({ text });

      res.setHeader("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[ElevenLabs Error]", error);
      res.status(500).send(error.message);
    }
  });
}
