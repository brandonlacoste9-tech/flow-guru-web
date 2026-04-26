import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { z } from 'zod';
import { and, eq, ilike, desc, sql } from 'drizzle-orm';
import { db } from './lib/db.js';
import { userFacts } from './lib/drizzle/schema.js';

export const config = { maxDuration: 60 };

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

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
            const rows = await db
              .select({
                fact: userFacts.fact,
                category: userFacts.category,
                createdAt: userFacts.createdAt,
              })
              .from(userFacts)
              .where(and(eq(userFacts.userId, userId), ilike(userFacts.fact, `%${query}%`)))
              .orderBy(desc(userFacts.createdAt))
              .limit(5);
            return rows;
          },
        }),
        saveMemory: tool({
          description: 'Persist a fact about the user',
          inputSchema: z.object({
            fact: z.string(),
            category: z.enum(['preference', 'personal', 'work', 'health', 'general']),
          }),
          execute: async ({ fact, category }) => {
            try {
              await db.insert(userFacts).values({ userId, fact, category });
              return { saved: true };
            } catch (err) {
              return { saved: false, error: (err as Error).message };
            }
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
