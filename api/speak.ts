import type { VercelRequest, VercelResponse } from "@vercel/node";
import { textToSpeech } from "./lib/_core/elevenLabs.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const text = req.query.text as string;
    const voiceId = req.query.voiceId as string | undefined;

    if (!text) {
      return res.status(400).send("Text query parameter is required");
    }

    console.log(`[Vercel Speak] Synthesizing: "${text.slice(0, 50)}..."`);
    
    const audioBuffer = await textToSpeech({ text, voiceId });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(audioBuffer);
    
  } catch (error: any) {
    console.error("[Vercel Speak Error]", error);
    res.status(500).send(error.message);
  }
}
