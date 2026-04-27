import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { z } from 'zod';
import { and, eq, ilike, desc } from 'drizzle-orm';
import {
  addListItem,
  createList,
  getDb,
  getListItems,
  getOrCreateAnonymousUser,
  getUserByOpenId,
  listUserLists,
  setListItemLocationTrigger,
  setListItemReminder,
  toggleListItem,
} from './lib/db.js';
import { userMemoryFacts } from './lib/drizzle/schema.js';

export const config = { maxDuration: 60 };

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const ANONYMOUS_OPEN_ID = '__flow_guru_anonymous__';

async function findListByName(userId: number, name: string) {
  const all = await listUserLists(userId);
  const target = name.trim().toLowerCase();
  return all.find(l => l.name.trim().toLowerCase() === target)
    ?? all.find(l => l.name.trim().toLowerCase().includes(target))
    ?? null;
}

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
    const isAnonymousRequest = openId === 'anonymous' || openId === ANONYMOUS_OPEN_ID;

    const user =
      (!isAnonymousRequest ? await getUserByOpenId(openId) : null) ??
      (await getOrCreateAnonymousUser());
    const userIdInt = user.id;
    const dbUserId = isAnonymousRequest || user.openId === ANONYMOUS_OPEN_ID ? null : user.id;

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
Use saveMemory when the user shares a fact about themselves (preferences, routine, health, work, hobbies, pets, etc.).

DESTINATIONS — Calendar and Lists are SEPARATE.

LISTS (use list_add_item / list_get_items / list_get_all / list_complete_item):
- Trigger words: "list", "grocery", "groceries", "shopping", "todo", "to-do",
  "buy", "pick up", "add <item>" without a time.
- Lists are identified by NAME only (no built-in type/category). Common names:
  "grocery", "todo", "shopping", "packing".
- If the user says "my list" without naming one, call list_get_all FIRST and ASK
  which list. Never guess.
- list_add_item auto-creates the list if it doesn't exist.

CALENDAR (not yet wired in this endpoint):
- Trigger words: "calendar", "schedule", "appointment", "meeting",
  "remind me at <time> <date>", any specific date+time.
- For now, if the user clearly asks for a calendar event, reply that calendar
  isn't connected on this endpoint yet. Do NOT silently put it on a list.

NEVER:
- Put a grocery item on the calendar.
- Put a timed event on a list.
- Guess "which list" — call list_get_all and ask.`,
      messages: modelMessages,
      stopWhen: stepCountIs(5),
      tools: {
        list_get_all: tool({
          description:
            "Return all of the user's lists with names. Call this FIRST when the user mentions " +
            "'my list' without naming which one, then ask which to use. Do not write to lists yet.",
          inputSchema: z.object({}),
          execute: async () => {
            if (!dbUserId) return { error: 'Sign in to use lists.' };
            const lists = await listUserLists(dbUserId);
            return { lists: lists.map(l => ({ id: l.id, name: l.name, icon: l.icon })) };
          },
        }),
        list_get_items: tool({
          description:
            "Read all items in a named list. Use when the user asks 'what's on my <X> list', " +
            "'show me my groceries', etc.",
          inputSchema: z.object({
            listName: z.string().trim().min(1, 'listName required'),
          }),
          execute: async ({ listName }) => {
            if (!dbUserId) return { error: 'Sign in to use lists.' };
            const list = await findListByName(dbUserId, listName);
            if (!list) return { error: `No list named "${listName}".` };
            const items = await getListItems(dbUserId, list.id);
            return {
              listName: list.name,
              items: items.map(i => ({
                id: i.id,
                content: i.content,
                done: i.completed === 1,
                reminderAt: i.reminderAt,
                locationTrigger: i.locationTrigger,
              })),
            };
          },
        }),
        list_add_item: tool({
          description:
            'Add an item to a NAMED list (grocery, todo, shopping, packing, etc.). ' +
            "If the list doesn't exist yet, this tool creates it. " +
            'NEVER use this for time-bound calendar events.',
          inputSchema: z.object({
            listName: z.string().trim().min(1, 'listName required').describe("e.g. 'grocery', 'todo', 'packing'"),
            item: z.string().trim().min(1, 'item required').describe('the single item or task text'),
            reminderAtISO: z.string().optional(),
            locationTrigger: z.string().optional(),
          }),
          execute: async ({ listName, item, reminderAtISO, locationTrigger }) => {
            if (!dbUserId) return { error: 'Sign in to use lists.' };
            const list = await findListByName(dbUserId, listName);
            const listId = list ? list.id : await createList(dbUserId, listName);
            const itemId = await addListItem(dbUserId, listId, item);

            if (reminderAtISO) {
              const reminderAt = new Date(reminderAtISO);
              if (!Number.isNaN(reminderAt.getTime())) {
                await setListItemReminder(dbUserId, itemId, reminderAt);
              }
            }
            if (locationTrigger) {
              await setListItemLocationTrigger(dbUserId, itemId, locationTrigger);
            }

            return { ok: true, listName: list?.name ?? listName, itemId };
          },
        }),
        list_complete_item: tool({
          description: 'Mark an item on a named list as done.',
          inputSchema: z.object({
            listName: z.string().trim().min(1, 'listName required'),
            item: z.string().trim().min(1, 'item required'),
          }),
          execute: async ({ listName, item }) => {
            if (!dbUserId) return { error: 'Sign in to use lists.' };
            const q = item.trim();
            if (!q) return { error: 'Specify which item to complete.' };
            const list = await findListByName(dbUserId, listName);
            if (!list) return { error: `No list named "${listName}".` };
            const items = await getListItems(dbUserId, list.id);
            const search = q.toLowerCase();         const target = items.find(i => i.completed === 0 && i.content.trim().toLowerCase() === search)           ?? items.find(i => i.completed === 0 && i.content.toLowerCase().includes(search));
            if (!target) return { error: `No item matching "${item}" on "${list.name}".` };
            await toggleListItem(dbUserId, target.id, true);
            return { ok: true };
          },
        }),
        recallMemory: tool({
          description: 'Recall stored facts about the user',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
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
          inputSchema: z.object({
            fact: z.string(),
            category: z.enum(['wake_up_time', 'daily_routine', 'preference', 'recurring_event', 'general']),
            factKey: z.string().optional(),
          }),
          execute: async ({ fact, category, factKey }) => {
            try {
              await db.insert(userMemoryFacts).values({
                userId: userIdInt,
                factValue: fact,
                category,
                factKey: factKey ?? null,
              });
              return { saved: true };
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
