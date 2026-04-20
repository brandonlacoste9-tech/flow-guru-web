import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  conversationMessages,
  conversationThreads,
  InsertConversationMessage,
  InsertConversationThread,
  InsertUser,
  InsertUserMemoryFact,
  InsertUserMemoryProfile,
  userMemoryFacts,
  userMemoryProfiles,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserMemoryProfile(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get memory profile: database not available");
    return undefined;
  }

  const result = await db.select().from(userMemoryProfiles).where(eq(userMemoryProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserMemoryProfile(input: InsertUserMemoryProfile) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert memory profile: database not available");
    return;
  }

  await db.insert(userMemoryProfiles).values(input).onDuplicateKeyUpdate({
    set: {
      wakeUpTime: input.wakeUpTime ?? null,
      dailyRoutine: input.dailyRoutine ?? null,
      preferencesSummary: input.preferencesSummary ?? null,
      recurringEventsSummary: input.recurringEventsSummary ?? null,
      updatedAt: new Date(),
    },
  });
}

export async function listUserMemoryFacts(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list memory facts: database not available");
    return [];
  }

  return db
    .select()
    .from(userMemoryFacts)
    .where(eq(userMemoryFacts.userId, userId))
    .orderBy(desc(userMemoryFacts.updatedAt), desc(userMemoryFacts.id));
}

export async function createUserMemoryFacts(facts: InsertUserMemoryFact[]) {
  if (facts.length === 0) {
    return;
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create memory facts: database not available");
    return;
  }

  await db.insert(userMemoryFacts).values(facts);
}

export async function findLatestConversationThread(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot load conversation thread: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(conversationThreads)
    .where(eq(conversationThreads.userId, userId))
    .orderBy(desc(conversationThreads.lastMessageAt), desc(conversationThreads.id))
    .limit(1);

  return result[0];
}

export async function createConversationThread(input: InsertConversationThread) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(conversationThreads).values(input).$returningId();
  return result[0]?.id;
}

export async function touchConversationThread(threadId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update thread timestamp: database not available");
    return;
  }

  await db
    .update(conversationThreads)
    .set({
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    })
    .where(eq(conversationThreads.id, threadId));
}

export async function listConversationMessages(threadId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot list messages: database not available");
    return [];
  }

  return db
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.threadId, threadId), eq(conversationMessages.userId, userId)))
    .orderBy(asc(conversationMessages.createdAt), asc(conversationMessages.id));
}

export async function createConversationMessage(input: InsertConversationMessage) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(conversationMessages).values(input).$returningId();
  return result[0]?.id;
}
