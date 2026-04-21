import { z } from "zod";
import { protectedProcedure, router } from "./trpc.js";
import { textToSpeech, speechToSpeech, getVoices } from "./elevenLabs.js";

export const voiceRouter = router({
  listVoices: protectedProcedure.query(async () => {
    const voices = await getVoices();
    return voices.map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
      category: v.category,
      labels: v.labels,
    }));
  }),

  generateSpeech: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(5000),
        voiceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const audioBuffer = await textToSpeech({
        text: input.text,
        voiceId: input.voiceId,
      });
      
      // We return base64 for tRPC compatibility since it's hard to stream buffers directly via JSON trpc
      return {
        audioBase64: audioBuffer.toString("base64"),
        format: "mp3",
      };
    }),

  changeVoice: protectedProcedure
    .input(
      z.object({
        audioUrl: z.string().url(),
        voiceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const audioBuffer = await speechToSpeech({
        audioUrl: input.audioUrl,
        voiceId: input.voiceId,
      });

      return {
        audioBase64: audioBuffer.toString("base64"),
        format: "mp3",
      };
    }),
});
