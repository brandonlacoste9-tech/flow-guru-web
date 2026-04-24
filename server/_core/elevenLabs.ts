import { Express } from "express";
import { textToSpeech, textToSpeechStream } from "../../api/lib/_core/elevenLabs.js";
import { Readable } from "stream";

// Re-export so sibling modules (briefing.ts) can import from this path
export { textToSpeech, textToSpeechStream, generateSound, generateSoundAsDataUri } from "../../api/lib/_core/elevenLabs.js";
export type { TtsOptions, SoundGenerationOptions } from "../../api/lib/_core/elevenLabs.js";

export function registerElevenLabsRoutes(app: Express) {
  app.get("/api/speak", async (req, res) => {
    try {
      const text = req.query.text as string;
      const voiceId = req.query.voiceId as string | undefined;

      if (!text) {
        return res.status(400).send("Text query parameter is required");
      }

      console.log(`[ElevenLabs] Synthesizing Stream: "${text.slice(0, 50)}..."`);
      
      const stream = await textToSpeechStream({ text, voiceId });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Transfer-Encoding", "chunked");
      
      const nodeStream = Readable.fromWeb(stream as any);
      nodeStream.pipe(res);
      
    } catch (error: any) {
      console.error("[ElevenLabs Error]", error);
      res.status(500).send(error.message);
    }
  });
}
