import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./drizzle/schema.js";
import { eq, desc, and } from "drizzle-orm";

let _db: any = null;

export async function getDb() {
  if (_db) return _db;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[Database] No DATABASE_URL found. Operating in persistence-free mode.");
    return null;
  }

  try {
    const client = postgres(dbUrl, { 
        ssl: 'require',
        connect_timeout: 5,
        max: 1 
    });
    _db = drizzle(client, { schema });
    return _db;
  } catch (error) {
    console.error("[Database] Connection failed:", error);
    return null;
  }
}

export async function getUserByOpenId(openId: string): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const results = await db.select().from(schema.users).where(eq(schema.users.openId, openId)).limit(1);
    return results[0] || null;
  } catch (err) {
    console.error("[DB] getUserByOpenId failed:", err);
    return null;
  }
}

export async function upsertUser(user: any): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const existing = await getUserByOpenId(user.openId);
    if (existing) {
      await db.update(schema.users).set({ ...user, updatedAt: new Date() }).where(eq(schema.users.openId, user.openId));
    } else {
      await db.insert(schema.users).values(user);
    }
  } catch (err) {
    console.error("[DB] upsertUser failed:", err);
  }
}

export async function findLatestConversationThread(userId: number): Promise<schema.ConversationThread | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const results = await db.select().from(schema.conversationThreads)
      .where(eq(schema.conversationThreads.userId, userId))
      .orderBy(desc(schema.conversationThreads.lastMessageAt))
      .limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}

export async function createConversationThread(data: any): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const results = await db.insert(schema.conversationThreads).values(data).returning({ id: schema.conversationThreads.id });
    return results[0]?.id || null;
  } catch (err) {
    return null;
  }
}

export async function listConversationMessages(threadId: number): Promise<schema.ConversationMessage[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.threadId, threadId))
      .orderBy(schema.conversationMessages.createdAt);
  } catch (err) {
    return [];
  }
}

export async function createConversationMessage(data: any): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const results = await db.insert(schema.conversationMessages).values(data).returning({ id: schema.conversationMessages.id });
    return results[0]?.id || null;
  } catch (err) {
    return null;
  }
}

export async function getProviderConnection(userId: number, provider: any): Promise<schema.ProviderConnection | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const results = await db.select().from(schema.providerConnections)
      .where(and(
        eq(schema.providerConnections.userId, userId),
        eq(schema.providerConnections.provider, provider)
      )).limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}

export async function upsertProviderConnection(data: any): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const existing = await getProviderConnection(data.userId, data.provider);
    if (existing) {
      await db.update(schema.providerConnections).set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.providerConnections.userId, data.userId),
          eq(schema.providerConnections.provider, data.provider)
        ));
    } else {
      await db.insert(schema.providerConnections).values(data);
    }
  } catch (err) {
    console.error("[DB] upsertProviderConnection failed:", err);
  }
}

export async function listProviderConnections(userId: number): Promise<schema.ProviderConnection[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(schema.providerConnections).where(eq(schema.providerConnections.userId, userId));
    } catch (err) {
      return [];
    }
}

export async function getUserMemoryProfile(userId: number): Promise<schema.UserMemoryProfile | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      const results = await db.select().from(schema.userMemoryProfiles).where(eq(schema.userMemoryProfiles.userId, userId)).limit(1);
      return results[0] || null;
    } catch (err) {
      return null;
    }
}

export async function upsertUserMemoryProfile(userId: number, data: any): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      const existing = await getUserMemoryProfile(userId);
      if (existing) {
        await db.update(schema.userMemoryProfiles).set({ ...data, updatedAt: new Date() }).where(eq(schema.userMemoryProfiles.userId, userId));
      } else {
        await db.insert(schema.userMemoryProfiles).values({ ...data, userId });
      }
    } catch (err) {
      console.error("[DB] upsertUserMemoryProfile failed:", err);
    }
}

export async function listUserMemoryFacts(userId: number): Promise<schema.UserMemoryFact[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(schema.userMemoryFacts).where(eq(schema.userMemoryFacts.userId, userId));
    } catch (err) {
      return [];
    }
}

export async function createUserMemoryFacts(userId: number, facts: any[]): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      const values = facts.map(f => ({ ...f, userId }));
      await db.insert(schema.userMemoryFacts).values(values);
    } catch (err) {
      console.error("[DB] createUserMemoryFacts failed:", err);
    }
}

export async function touchConversationThread(id: number): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await db.update(schema.conversationThreads).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(schema.conversationThreads.id, id));
    } catch (err) {
      console.error("[DB] touchConversationThread failed:", err);
    }
}

export async function getConversationThreadById(id: number): Promise<schema.ConversationThread | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      const results = await db.select().from(schema.conversationThreads).where(eq(schema.conversationThreads.id, id)).limit(1);
      return results[0] || null;
    } catch (err) {
      return null;
    }
}
