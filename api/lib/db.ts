import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./drizzle/schema.js";
import { eq, desc, and } from "drizzle-orm";

let _db: any = null;
let _tablesEnsured = false;

export async function getDb() {
  if (_db) return _db;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[Database] No DATABASE_URL found. Operating in persistence-free mode.");
    return null;
  }

  try {
    const client = postgres(dbUrl, {
      ssl: "require",
      connect_timeout: 10,
      max: 1,
      prepare: false, // Required for Neon pooler compatibility
    });
    _db = drizzle(client, { schema });
    return _db;
  } catch (error) {
    console.error("[Database] Connection failed:", error);
    return null;
  }
}

/**
 * Creates all fg_* tables and enum types idempotently on every cold start.
 * Uses a module-level flag so it only runs once per warm Vercel instance.
 */
async function ensureTables(db: any) {
  if (_tablesEnsured) return;

  try {
    const ddl = `
      -- Enum types (safe to re-run)
      DO $$ BEGIN
        CREATE TYPE fg_role AS ENUM ('user', 'admin');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE fg_memory_category AS ENUM ('wake_up_time', 'daily_routine', 'preference', 'recurring_event', 'general');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE fg_message_role AS ENUM ('system', 'user', 'assistant');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE fg_provider_type AS ENUM ('google-calendar', 'spotify');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE fg_connection_status AS ENUM ('not_connected', 'pending', 'connected', 'error');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      -- Tables
      CREATE TABLE IF NOT EXISTS fg_users (
        id SERIAL PRIMARY KEY,
        "openId" VARCHAR(64) NOT NULL UNIQUE,
        name TEXT,
        email VARCHAR(320),
        "loginMethod" VARCHAR(64),
        role fg_role DEFAULT 'user' NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "lastSignedIn" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fg_profiles (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL UNIQUE,
        "wakeUpTime" VARCHAR(64),
        "dailyRoutine" TEXT,
        "preferencesSummary" TEXT,
        "recurringEventsSummary" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fg_facts (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        category fg_memory_category NOT NULL DEFAULT 'general',
        "factKey" VARCHAR(128),
        "factValue" TEXT NOT NULL,
        confidence INTEGER DEFAULT 100 NOT NULL,
        "sourceMessageId" INTEGER,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS fg_facts_user_idx ON fg_facts("userId");

      CREATE TABLE IF NOT EXISTS fg_threads (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        title VARCHAR(255) DEFAULT 'Flow Guru Chat' NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "lastMessageAt" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fg_messages (
        id SERIAL PRIMARY KEY,
        "threadId" INTEGER NOT NULL,
        "userId" INTEGER NOT NULL,
        role fg_message_role NOT NULL,
        content TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fg_connections (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        provider fg_provider_type NOT NULL,
        status fg_connection_status DEFAULT 'pending' NOT NULL,
        "externalAccountId" VARCHAR(255),
        "externalAccountLabel" VARCHAR(255),
        "accessToken" TEXT,
        "refreshToken" TEXT,
        scope TEXT,
        "tokenType" VARCHAR(64),
        "expiresAtUnixMs" BIGINT,
        "lastError" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- Seed anonymous user so userId=1 fallback always resolves
      INSERT INTO fg_users ("openId", name, role)
      VALUES ('__anonymous__', 'Anonymous', 'user')
      ON CONFLICT ("openId") DO NOTHING;
    `;

    await db.execute(sql.raw(ddl));
    _tablesEnsured = true;
    console.log("[DB] Schema self-heal complete.");
  } catch (err) {
    console.error("[DB] Self-heal FAILED:", err);
    // Don't set _tablesEnsured so next request retries
  }
}

export async function getUserByOpenId(openId: string): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db.select().from(schema.users).where(eq(schema.users.openId, openId)).limit(1);
    return results[0] || null;
  } catch (err: any) {
    console.error("[DB] getUserByOpenId failed:", err.message);
    return null;
  }
}

export async function upsertUser(user: any): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    const existing = await getUserByOpenId(user.openId);
    if (existing) {
      await db.update(schema.users).set({ ...user, updatedAt: new Date() }).where(eq(schema.users.openId, user.openId));
    } else {
      await db.insert(schema.users).values(user);
    }
  } catch (err: any) {
    console.error("[DB] upsertUser failed:", err.message);
  }
}

export async function findLatestConversationThread(userId: number): Promise<schema.ConversationThread | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db
      .select()
      .from(schema.conversationThreads)
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
    await ensureTables(db);
    const results = await db
      .insert(schema.conversationThreads)
      .values(data)
      .returning({ id: schema.conversationThreads.id });
    const id = results[0]?.id;
    if (!id) throw new Error("Insert returned no id");
    return id;
  } catch (err: any) {
    console.error("[DB] createConversationThread FAILED:", err.message);
    return null;
  }
}

export async function listConversationMessages(threadId: number): Promise<schema.ConversationMessage[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    await ensureTables(db);
    return await db
      .select()
      .from(schema.conversationMessages)
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
    await ensureTables(db);
    const results = await db
      .insert(schema.conversationMessages)
      .values(data)
      .returning({ id: schema.conversationMessages.id });
    return results[0]?.id || null;
  } catch (err) {
    return null;
  }
}

export async function getProviderConnection(userId: number, provider: any): Promise<schema.ProviderConnection | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db
      .select()
      .from(schema.providerConnections)
      .where(and(eq(schema.providerConnections.userId, userId), eq(schema.providerConnections.provider, provider)))
      .limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}

export async function upsertProviderConnection(data: any): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    const existing = await getProviderConnection(data.userId, data.provider);
    if (existing) {
      await db
        .update(schema.providerConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.providerConnections.userId, data.userId),
            eq(schema.providerConnections.provider, data.provider),
          ),
        );
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
    await ensureTables(db);
    return await db
      .select()
      .from(schema.providerConnections)
      .where(eq(schema.providerConnections.userId, userId));
  } catch (err) {
    return [];
  }
}

export async function getUserMemoryProfile(userId: number): Promise<schema.UserMemoryProfile | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db
      .select()
      .from(schema.userMemoryProfiles)
      .where(eq(schema.userMemoryProfiles.userId, userId))
      .limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}

export async function upsertUserMemoryProfile(userId: number, data: any): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    const existing = await getUserMemoryProfile(userId);
    if (existing) {
      await db
        .update(schema.userMemoryProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.userMemoryProfiles.userId, userId));
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
    await ensureTables(db);
    return await db
      .select()
      .from(schema.userMemoryFacts)
      .where(eq(schema.userMemoryFacts.userId, userId));
  } catch (err) {
    return [];
  }
}

export async function createUserMemoryFacts(userId: number, facts: any[]): Promise<void> {
  if (!facts || facts.length === 0) return; // Guard: empty insert would crash postgres
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
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
    await ensureTables(db);
    await db
      .update(schema.conversationThreads)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.conversationThreads.id, id));
  } catch (err) {
    console.error("[DB] touchConversationThread failed:", err);
  }
}

export async function getConversationThreadById(id: number): Promise<schema.ConversationThread | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db
      .select()
      .from(schema.conversationThreads)
      .where(eq(schema.conversationThreads.id, id))
      .limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}
