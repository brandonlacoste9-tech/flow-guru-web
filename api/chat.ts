import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { z } from 'zod';
import { and, eq, ilike, desc } from 'drizzle-orm';
import { getDb, getUserByOpenId, getOrCreateAnonymousUser } from './lib/db.js';
import { userMemoryFacts } from './lib/drizzle/schema.js';

export const config = { maxDuration: 60 };

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const ANONYMOUS_OPEN_ID = '__flow_guru_anonymous__';
const normalizeMemoryText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const recallMemoryInputSchema = z.object({ query: z.string() });
const saveMemoryInputSchema = z.object({
  fact: z.string(),
  category: z.enum(['wake_up_time', 'daily_routine', 'preference', 'recurring_event', 'general']),
  factKey: z.string().optional(),
});

type RecallMemoryInput = z.infer<typeof recallMemoryInputSchema>;
type SaveMemoryInput = z.infer<typeof saveMemoryInputSchema>;
type MemoryFactRow = { id: number; factValue: string; factKey: string | null };

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      openId?: string;
      userId?: string;
    };
    const openId = body.openId ?? body.userId ?? ANONYMOUS_OPEN_ID;

    const user =
      (await getUserByOpenId(openId)) ??
      (await getOrCreateAnonymousUser());
    const userIdInt = user.id;

    const db = await getDb();
    if (!db) {
      throw new Error('Database unavailable');
    }

    const modelMessages = await convertToModelMessages(body.messages);

    const result = streamText({
      model: deepseek('deepseek-chat'),
      system: `You are Flow Guru, a concise voice-first personal assistant.
Keep responses brief and conversational — they will be spoken aloud.
Use recallMemory before answering personal questions.
Use saveMemory when the user shares a fact about themselves (preferences, routine, health, work, hobbies, pets, etc.).`,
      messages: modelMessages,
      stopWhen: stepCountIs(5),
      tools: {
        recallMemory: tool({
          description: 'Recall stored facts about the user',
          inputSchema: recallMemoryInputSchema,
          execute: async ({ query }: RecallMemoryInput) => {
            const rows = await db
              .select({
                fact: userMemoryFacts.factValue,
                category: userMemoryFacts.category,
                createdAt: userMemoryFacts.createdAt,
              })
              .from(userMemoryFacts)
              .where(and(
                eq(userMemoryFacts.userId, userIdInt),
                ilike(userMemoryFacts.factValue, `%${query}%`),
              ))
              .orderBy(desc(userMemoryFacts.createdAt))
              .limit(5);
            return rows;
          },
        }),
        saveMemory: tool({
          description: 'Persist a fact about the user',
          inputSchema: saveMemoryInputSchema,
          execute: async ({ fact, category, factKey }: SaveMemoryInput) => {
            try {
              const cleanFact = fact.trim();
              const cleanFactKey = factKey?.trim() || null;

              if (!cleanFact) return { saved: false, error: 'Empty memory fact.' };

              const existingRows = await db
                .select({
                  id: userMemoryFacts.id,
                  factValue: userMemoryFacts.factValue,
                  factKey: userMemoryFacts.factKey,
                })
                .from(userMemoryFacts)
                .where(and(
                  eq(userMemoryFacts.userId, userIdInt),
                  eq(userMemoryFacts.category, category),
                ))
                .orderBy(desc(userMemoryFacts.updatedAt))
                .limit(100);

              const normalizedIncoming = normalizeMemoryText(cleanFact);

              if (cleanFactKey) {
                const keyedMatch = (existingRows as MemoryFactRow[]).find((row: MemoryFactRow) => (row.factKey ?? '').trim() === cleanFactKey);
                if (keyedMatch) {
                  if (normalizeMemoryText(keyedMatch.factValue) === normalizedIncoming) {
                    return { saved: true, deduped: true };
                  }
                  await db
                    .update(userMemoryFacts)
                    .set({ factValue: cleanFact, updatedAt: new Date() })
                    .where(eq(userMemoryFacts.id, keyedMatch.id));
                  return { saved: true, updated: true };
                }
              }

              const duplicate = (existingRows as MemoryFactRow[]).find((row: MemoryFactRow) => normalizeMemoryText(row.factValue) === normalizedIncoming);
              if (duplicate) return { saved: true, deduped: true };

              await db.insert(userMemoryFacts).values({
                userId: userIdInt,
                factValue: cleanFact,
                category,
                factKey: cleanFactKey,
              });
              return { saved: true, inserted: true };
            } catch (err) {
              console.error('saveMemory failed', err);
              return { saved: false, error: String(err) };
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error('chat handler error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
