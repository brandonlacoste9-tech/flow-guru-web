import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = (await req.json()) as { messages: UIMessage[]; userId?: string };
    const { messages, userId = 'anonymous' } = body;

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: deepseek('deepseek-chat'),
      system: `You are Flow Guru, a concise voice-first personal assistant for ${userId}.
Keep responses brief and conversational — they will be spoken aloud.
Use recallMemory before answering personal questions.
Use saveMemory when the user shares a fact about themselves.`,
      messages: modelMessages,
      stopWhen: stepCountIs(5),
      tools: {
        recallMemory: tool({
          description: 'Recall stored facts about the user',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const { data } = await supabase
              .from('user_facts')
              .select('fact, category, created_at')
              .eq('user_id', userId)
              .ilike('fact', `%${query}%`)
              .limit(5);
            return data ?? [];
          },
        }),
        saveMemory: tool({
          description: 'Persist a fact about the user',
          inputSchema: z.object({
            fact: z.string(),
            category: z.enum(['preference', 'personal', 'work', 'health', 'general']),
          }),
          execute: async ({ fact, category }) => {
            const { error } = await supabase
              .from('user_facts')
              .insert({ user_id: userId, fact, category });
            return { saved: !error, error: error?.message };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error('[api/chat] error:', err);
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
