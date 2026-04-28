import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./drizzle/schema.js";
import { eq, desc, and, gte, lte } from "drizzle-orm";

let _db: any = null;
/** Raw postgres.js client — required for self-heal DDL (`unsafe`), not the `postgres` factory. */
let _pg: ReturnType<typeof postgres> | null = null;

/** Ensures idempotent DDL runs once per serverless instance (not only when fg_users SELECT fails). */
let schemaReadyPromise: Promise<void> | null = null;

const ANONYMOUS_OPEN_ID = "__flow_guru_anonymous__";
const normalizeMemoryText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const EXPECTED_TABLES = [
  "fg_users",
  "fg_threads",
  "fg_messages",
  "fg_profiles",
  "fg_facts",
  "fg_connections",
  "fg_local_events",
  "fg_lists",
  "fg_list_items",
  "fg_push_subscriptions",
  "fg_subscriptions",
  "fg_stripe_events",
] as const;

/**
 * Minimal Flow Guru DDL for empty / partial Neon databases.
 * IF NOT EXISTS keeps real Drizzle migrations safe; fills missing fg_threads etc.
 */
const FLOW_GURU_DDL = `
CREATE TABLE IF NOT EXISTS fg_users (
    id SERIAL PRIMARY KEY,
    "openId" VARCHAR(64) NOT NULL UNIQUE,
    name TEXT,
    email VARCHAR(320),
    "loginMethod" VARCHAR(64),
    role TEXT DEFAULT 'user' NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "lastSignedIn" TIMESTAMP DEFAULT NOW() NOT NULL,
    "passwordHash" TEXT,
    "promoCode" VARCHAR(64),
    "resetToken" VARCHAR(128),
    "resetTokenExpiresAt" TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fg_threads (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    title VARCHAR(255) DEFAULT 'Flow Guru Chat' NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "lastMessageAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "shareToken" VARCHAR(64)
);
CREATE TABLE IF NOT EXISTS fg_push_subscriptions (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_subscriptions (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL UNIQUE,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT UNIQUE,
    "stripePriceId" TEXT,
    status TEXT DEFAULT 'free' NOT NULL,
    "currentPeriodEnd" TIMESTAMP,
    "cancelAtPeriodEnd" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_stripe_events (
    id SERIAL PRIMARY KEY,
    "eventId" TEXT NOT NULL UNIQUE,
    type TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_lists (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(64),
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_list_items (
    id SERIAL PRIMARY KEY,
    "listId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "completed" INTEGER DEFAULT 0 NOT NULL,
    "reminderAt" TIMESTAMP,
    "locationTrigger" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_messages (
    id SERIAL PRIMARY KEY,
    "threadId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_profiles (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL UNIQUE,
    "wakeUpTime" VARCHAR(64),
    "dailyRoutine" TEXT,
    "preferencesSummary" TEXT,
    "recurringEventsSummary" text,
    "alarmSound" varchar(64) DEFAULT 'chime',
    "alarmDays" varchar(32) DEFAULT '0,1,2,3,4,5,6',
    "voiceId" varchar(64),
    "buddyPersonality" text,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_facts (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    "factKey" VARCHAR(128),
    "factValue" TEXT NOT NULL,
    confidence INTEGER DEFAULT 100 NOT NULL,
    "sourceMessageId" INTEGER,
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS fg_connections (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
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
CREATE TABLE IF NOT EXISTS fg_local_events (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    "startAt" TIMESTAMP NOT NULL,
    "endAt" TIMESTAMP NOT NULL,
    location TEXT,
    "allDay" INTEGER DEFAULT 0 NOT NULL,
    "color" VARCHAR(32) DEFAULT 'blue',
    "reminderMinutes" TEXT DEFAULT '30,15,5',
    "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);
ALTER TABLE fg_local_events ADD COLUMN IF NOT EXISTS "color" VARCHAR(32) DEFAULT 'blue';
ALTER TABLE fg_local_events ADD COLUMN IF NOT EXISTS "reminderMinutes" TEXT DEFAULT '30,15,5';
ALTER TABLE fg_profiles ADD COLUMN IF NOT EXISTS "alarmSound" VARCHAR(64) DEFAULT 'chime';
ALTER TABLE fg_profiles ADD COLUMN IF NOT EXISTS "alarmDays" VARCHAR(32) DEFAULT '0,1,2,3,4,5,6';
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "promoCode" VARCHAR(64);
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "resetToken" VARCHAR(128);
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "resetTokenExpiresAt" TIMESTAMP;
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "referralCode" VARCHAR(32);
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "referredBy" VARCHAR(32);
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "personaName" VARCHAR(64);
ALTER TABLE fg_users ADD COLUMN IF NOT EXISTS "personaStyle" VARCHAR(64);
ALTER TABLE fg_threads ADD COLUMN IF NOT EXISTS "shareToken" VARCHAR(64);
ALTER TABLE fg_profiles ADD COLUMN IF NOT EXISTS "voiceId" VARCHAR(64);
ALTER TABLE fg_profiles ADD COLUMN IF NOT EXISTS "buddyPersonality" TEXT;
ALTER TABLE fg_lists ADD COLUMN IF NOT EXISTS "icon" VARCHAR(64);
ALTER TABLE fg_list_items ADD COLUMN IF NOT EXISTS "reminderAt" TIMESTAMP;
ALTER TABLE fg_list_items ADD COLUMN IF NOT EXISTS "locationTrigger" TEXT;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'free' NOT NULL;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP;
ALTER TABLE fg_subscriptions ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" INTEGER DEFAULT 0 NOT NULL;
`;

async function ensureSchemaOnce(): Promise<void> {
  if (!_pg) return;
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      // Neon pooler (transaction mode) rejects multiple commands in a single unsafe() call.
      // Split on semicolons and run each statement individually.
      const statements = FLOW_GURU_DDL
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      for (const stmt of statements) {
        const isCreate = /^CREATE\s+TABLE/i.test(stmt);
        try {
          await _pg!.unsafe(stmt + ';');
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          if (isCreate) {
            console.error("[DB] CREATE TABLE failed - schema bootstrap aborted:", msg);
            throw new Error(`Schema bootstrap failed on: ${stmt.slice(0, 80)}... - ${msg}`);
          }
          console.warn("[DB] DDL stmt warning (non-fatal):", msg.slice(0, 200));
        }
      }

      for (const table of EXPECTED_TABLES) {
        try {
          await _pg!.unsafe(`SELECT 1 FROM ${table} LIMIT 0;`);
        } catch (err: any) {
          throw new Error(`Schema assertion failed: table ${table} not present after DDL - ${err?.message ?? String(err)}`);
        }
      }
      console.log("[DB] Schema bootstrap OK - all", EXPECTED_TABLES.length, "fg_ tables verified");
    })().catch(err => {
      schemaReadyPromise = null;
      console.error("[DB] ensureSchemaOnce failed; will retry on next request:", err?.message);
      throw err;
    });
  }
  await schemaReadyPromise;
}

export async function getDb() {
  if (_db) return _db;

  // FG_DATABASE_URL is our own clean URL (no channel_binding) set directly in Vercel.
  // Fall back to other standard env vars if not set.
  const rawUrl =
    process.env.FG_DATABASE_URL ||
    process.env.POSTGRES_URL_NO_SSL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!rawUrl) {
    console.warn("[Database] No DATABASE_URL found. Operating in persistence-free mode.");
    return null;
  }

  // postgres.js doesn't support channel_binding — strip it from the URL
  let dbUrl = rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete('channel_binding');
    dbUrl = url.toString();
  } catch (e) {
    // Fallback to simple replace if URL parsing fails
    dbUrl = rawUrl.replace(/[?&]channel_binding=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
  }
  console.log('[DB] Connecting to:', dbUrl.replace(/:[^:@]+@/, ':***@'));

  try {
    const client = postgres(dbUrl, {
      ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      connect_timeout: 15,
      max: 1,
      // Neon pooler (transaction mode) + postgres.js: prepared statements break; disable them.
      prepare: false,
    });
    _pg = client;
    await ensureSchemaOnce();
    _db = drizzle(client, { schema });
    return _db;
  } catch (error) {
    console.error("[Database] Connection failed:", error);
    _pg = null;
    _db = null;
    schemaReadyPromise = null;
    return null;
  }
}

/**
 * Public assistant routes allow unauthenticated use; DB rows must still reference a real user.
 * Uses a stable synthetic openId so guest chat shares one logical profile (or upgrade later).
 */
export async function getOrCreateAnonymousUser(): Promise<schema.User> {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }
  await ensureTables(db);
  const existing = await getUserByOpenId(ANONYMOUS_OPEN_ID);
  if (existing) return existing;

  await db.insert(schema.users).values({
    openId: ANONYMOUS_OPEN_ID,
    name: "Guest",
    email: null,
    loginMethod: "anonymous",
    lastSignedIn: new Date(),
  });
  const created = await getUserByOpenId(ANONYMOUS_OPEN_ID);
  if (!created) {
    throw new Error("Failed to create anonymous user row");
  }
  return created;
}

export async function resolveAssistantUserId(user: schema.User | null): Promise<number> {
  if (user?.id != null) return user.id;
  const anon = await getOrCreateAnonymousUser();
  return anon.id;
}

/** Run idempotent DDL once per cold start; safe if tables already exist from Drizzle migrations. */
async function ensureTables(_dbUnused?: any) {
  await ensureSchemaOnce();
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

export async function getUserByEmail(email: string): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await (db as any).execute(
      `SELECT * FROM fg_users WHERE lower(email) = lower('${email.replace(/'/g, "''")}') LIMIT 1`
    );
    return (results.rows || results)[0] || null;
  } catch (err: any) {
    console.error("[DB] getUserByEmail failed:", err.message);
    return null;
  }
}

export async function getUserByResetToken(token: string): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await (db as any).execute(
      `SELECT * FROM fg_users WHERE "resetToken" = '${token.replace(/'/g, "''")}' AND "resetTokenExpiresAt" > NOW() LIMIT 1`
    );
    return (results.rows || results)[0] || null;
  } catch (err: any) {
    console.error("[DB] getUserByResetToken failed:", err.message);
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
    const db = await getDb();
    if (!db) throw new Error("Database connection unavailable");
    await ensureTables(db);
    const results = await db.insert(schema.conversationThreads).values(data).returning({ id: schema.conversationThreads.id });
    return results[0]?.id || null;
}

export async function listConversationMessages(threadId: number): Promise<schema.ConversationMessage[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    await ensureTables(db);
    return await db.select().from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.threadId, threadId))
      .orderBy(schema.conversationMessages.createdAt);
  } catch (err) {
    return [];
  }
}

export async function createConversationMessage(data: any): Promise<number | null> {
    const db = await getDb();
    if (!db) throw new Error("Database connection unavailable");
    await ensureTables(db);
    const results = await db.insert(schema.conversationMessages).values(data).returning({ id: schema.conversationMessages.id });
    return results[0]?.id || null;
}

export async function getProviderConnection(userId: number, provider: any): Promise<schema.ProviderConnection | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
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
    await ensureTables(db);
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
      await ensureTables(db);
      return await db.select().from(schema.providerConnections).where(eq(schema.providerConnections.userId, userId));
    } catch (err) {
      return [];
    }
}

export async function getUserMemoryProfile(userId: number): Promise<schema.UserMemoryProfile | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      await ensureTables(db);
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
      await ensureTables(db);
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
      await ensureTables(db);
      return await db.select().from(schema.userMemoryFacts).where(eq(schema.userMemoryFacts.userId, userId));
    } catch (err) {
      return [];
    }
}

export async function createUserMemoryFacts(userId: number, facts: any[]): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await ensureTables(db);
      for (const fact of facts) {
        const cleanFactValue = typeof fact.factValue === "string" ? fact.factValue.trim() : "";
        const cleanFactKey = typeof fact.factKey === "string" && fact.factKey.trim() ? fact.factKey.trim() : null;
        const category = fact.category ?? "general";

        if (!cleanFactValue) continue;

        const existingRows = await db
          .select({
            id: schema.userMemoryFacts.id,
            factValue: schema.userMemoryFacts.factValue,
            factKey: schema.userMemoryFacts.factKey,
          })
          .from(schema.userMemoryFacts)
          .where(
            and(
              eq(schema.userMemoryFacts.userId, userId),
              eq(schema.userMemoryFacts.category, category)
            )
          )
          .orderBy(desc(schema.userMemoryFacts.updatedAt))
          .limit(100);

        const normalizedIncoming = normalizeMemoryText(cleanFactValue);
        const keyedMatch = cleanFactKey
          ? existingRows.find((row: any) => (row.factKey ?? "").trim() === cleanFactKey)
          : null;

        if (keyedMatch) {
          if (normalizeMemoryText(keyedMatch.factValue) === normalizedIncoming) continue;
          await db
            .update(schema.userMemoryFacts)
            .set({ factValue: cleanFactValue, updatedAt: new Date() })
            .where(eq(schema.userMemoryFacts.id, keyedMatch.id));
          continue;
        }

        const duplicate = existingRows.find((row: any) => normalizeMemoryText(row.factValue) === normalizedIncoming);
        if (duplicate) continue;

        await db.insert(schema.userMemoryFacts).values({
          ...fact,
          userId,
          category,
          factValue: cleanFactValue,
          factKey: cleanFactKey,
        });
      }
    } catch (err) {
      console.error("[DB] createUserMemoryFacts failed:", err);
    }
}

export async function deleteUserMemoryFact(userId: number, factId: number): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await ensureTables(db);
      await db.delete(schema.userMemoryFacts).where(
        and(eq(schema.userMemoryFacts.id, factId), eq(schema.userMemoryFacts.userId, userId))
      );
    } catch (err) {
      console.error('[DB] deleteUserMemoryFact failed:', err);
    }
}

export async function touchConversationThread(id: number): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await ensureTables(db);
      await db.update(schema.conversationThreads).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(schema.conversationThreads.id, id));
    } catch (err) {
      console.error("[DB] touchConversationThread failed:", err);
    }
}

export async function getConversationThreadById(id: number): Promise<schema.ConversationThread | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      await ensureTables(db);
      const results = await db.select().from(schema.conversationThreads).where(eq(schema.conversationThreads.id, id)).limit(1);
      return results[0] || null;
    } catch (err) {
      return null;
    }
}

export async function createLocalEvent(data: any): Promise<number | null> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database connection unavailable");
      await ensureTables(db);
      // Ensure only schema-defined columns are passed (strip unknown keys)
      const safeData = {
        userId: data.userId,
        title: data.title,
        description: data.description ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        location: data.location ?? null,
        allDay: data.allDay ?? 0,
        color: data.color ?? 'blue',
        reminderMinutes: data.reminderMinutes ?? '30,15,5',
      };
      console.log('[DB] createLocalEvent:', JSON.stringify({ ...safeData, startAt: safeData.startAt?.toISOString?.(), endAt: safeData.endAt?.toISOString?.() }));
      const results = await db.insert(schema.localEvents).values(safeData).returning({ id: schema.localEvents.id });
      console.log('[DB] createLocalEvent result:', JSON.stringify(results));
      return results[0]?.id || null;
    } catch (err: any) {
      console.error('[DB] createLocalEvent FAILED:', err?.message ?? err);
      throw err;
    }
}

export async function listLocalEvents(userId: number, startAfter?: Date, endBefore?: Date): Promise<schema.LocalEvent[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      await ensureTables(db);
      const conditions: any[] = [eq(schema.localEvents.userId, userId)];
      if (startAfter) conditions.push(gte(schema.localEvents.startAt, startAfter));
      if (endBefore) conditions.push(lte(schema.localEvents.startAt, endBefore));
      return await db.select().from(schema.localEvents)
        .where(and(...conditions))
        .orderBy(schema.localEvents.startAt);
    } catch (err) {
      console.error("[DB] listLocalEvents failed:", err);
      return [];
    }
}

export async function updateLocalEvent(userId: number, eventId: number, data: Partial<{
  title: string; description: string | null; startAt: Date; endAt: Date; location: string | null; allDay: number; color: string; reminderMinutes: string | null;
}>): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await ensureTables(db);
      await db.update(schema.localEvents)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(schema.localEvents.id, eventId), eq(schema.localEvents.userId, userId)));
    } catch (err) {
      console.error("[DB] updateLocalEvent failed:", err);
    }
}

export async function deleteLocalEvent(userId: number, eventId: number): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      await ensureTables(db);
      await db.delete(schema.localEvents).where(and(
        eq(schema.localEvents.id, eventId),
        eq(schema.localEvents.userId, userId)
      ));
    } catch (err) {
      console.error("[DB] deleteLocalEvent failed:", err);
    }
}

// ─── Persona ────────────────────────────────────────────────────────────────
export async function updateUserPersona(userId: number, personaName: string, personaStyle: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    await db.update(schema.users).set({ personaName, personaStyle, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  } catch (err: any) {
    console.error("[DB] updateUserPersona failed:", err.message);
  }
}

export async function getUserById(id: number): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return results[0] || null;
  } catch (err) {
    return null;
  }
}

// ─── Referral ────────────────────────────────────────────────────────────────
export async function getUserByReferralCode(code: string): Promise<schema.User | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await (db as any).execute(
      `SELECT * FROM fg_users WHERE "referralCode" = '${code.replace(/'/g, "''")}' LIMIT 1`
    );
    return (results.rows || results)[0] || null;
  } catch (err) {
    return null;
  }
}

export async function addCredits(userId: number, amount: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    await (db as any).execute(`UPDATE fg_users SET credits = credits + ${amount} WHERE id = ${userId}`);
  } catch (err: any) {
    console.error("[DB] addCredits failed:", err.message);
  }
}

// ─── Share Token ─────────────────────────────────────────────────────────────
export async function setThreadShareToken(threadId: number, userId: number, token: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    await db.update(schema.conversationThreads)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(and(eq(schema.conversationThreads.id, threadId), eq(schema.conversationThreads.userId, userId)));
  } catch (err: any) {
    console.error("[DB] setThreadShareToken failed:", err.message);
  }
}

export async function getThreadByShareToken(token: string): Promise<schema.ConversationThread | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    await ensureTables(db);
    const results = await (db as any).execute(
      `SELECT * FROM fg_threads WHERE "shareToken" = '${token.replace(/'/g, "''")}' LIMIT 1`
    );
    return (results.rows || results)[0] || null;
  } catch (err) {
    return null;
  }
}
// ─── Push Notifications ──────────────────────────────────────────────────────
export async function upsertPushSubscription(userId: number, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await ensureTables(db);
    
    // Check if subscription already exists for this endpoint
    const existing = await db.select().from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    const values = {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    };

    if (existing.length > 0) {
      await db.update(schema.pushSubscriptions).set(values).where(eq(schema.pushSubscriptions.id, existing[0].id));
    } else {
      await db.insert(schema.pushSubscriptions).values(values);
    }
  } catch (err: any) {
    console.error("[DB] upsertPushSubscription failed:", err.message);
  }
}

// ─── Lists & Items ───────────────────────────────────────────────────────────
export async function listUserLists(userId: number): Promise<schema.List[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    await ensureTables(db);
    return await db.select().from(schema.lists).where(eq(schema.lists.userId, userId)).orderBy(desc(schema.lists.createdAt));
  } catch (err: any) {
    console.error("[DB] listUserLists failed:", err?.message ?? err);
    return [];
  }
}

export async function getListItems(userId: number, listId: number): Promise<schema.ListItem[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    await ensureTables(db);
    return await db.select().from(schema.listItems)
      .where(and(eq(schema.listItems.userId, userId), eq(schema.listItems.listId, listId)))
      .orderBy(schema.listItems.createdAt);
  } catch (err: any) {
    console.error("[DB] getListItems failed:", err?.message ?? err);
    return [];
  }
}

export async function createList(userId: number, name: string, icon?: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTables(db);
  const results = await db.insert(schema.lists).values({ 
    userId, 
    name, 
    icon: icon || 'list' 
  }).returning({ id: schema.lists.id });
  
  const id = results[0]?.id;
  if (!id) throw new Error("Failed to create list: No ID returned");
  return id;
}

export async function addListItem(userId: number, listId: number, content: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTables(db);
  const results = await db.insert(schema.listItems).values({ 
    userId, 
    listId, 
    content, 
    completed: 0 
  }).returning({ id: schema.listItems.id });
  
  const id = results[0]?.id;
  if (!id) throw new Error("Failed to add list item: No ID returned");
  return id;
}

export async function toggleListItem(userId: number, itemId: number, completed: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.update(schema.listItems).set({ completed: completed ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.userId, userId)));
}

export async function deleteListItem(userId: number, itemId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.delete(schema.listItems).where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.userId, userId)));
}

export async function deleteList(userId: number, listId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  // Delete all items first
  await db.delete(schema.listItems).where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.userId, userId)));
  // Delete the list
  await db.delete(schema.lists).where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)));
}

export async function updateList(userId: number, listId: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.update(schema.lists).set({ name, updatedAt: new Date() })
    .where(and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)));
}

export async function updateListItem(userId: number, itemId: number, content: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.update(schema.listItems).set({ content, updatedAt: new Date() })
    .where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.userId, userId)));
}

export async function setListItemReminder(userId: number, itemId: number, reminderAt: Date | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.update(schema.listItems).set({ reminderAt, updatedAt: new Date() })
    .where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.userId, userId)));
}

export async function setListItemLocationTrigger(userId: number, itemId: number, locationTrigger: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureTables(db);
  await db.update(schema.listItems).set({ locationTrigger, updatedAt: new Date() })
    .where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.userId, userId)));
}

type SubscriptionStatus = {
  userId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

function sqlString(value: string | null | undefined) {
  return value == null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

function sqlDate(value: Date | null | undefined) {
  return value ? sqlString(value.toISOString()) : "NULL";
}

export async function getSubscriptionStatus(userId: number): Promise<SubscriptionStatus> {
  const db = await getDb();
  if (!db) {
    return {
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      status: "free",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
  await ensureTables(db);
  const rows = await (db as any).execute(
    `SELECT * FROM fg_subscriptions WHERE "userId" = ${userId} LIMIT 1`,
  );
  const row = (rows.rows || rows)[0];
  if (!row) {
    return {
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      status: "free",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    userId,
    stripeCustomerId: row.stripeCustomerId ?? null,
    stripeSubscriptionId: row.stripeSubscriptionId ?? null,
    stripePriceId: row.stripePriceId ?? null,
    status: row.status ?? "free",
    currentPeriodEnd: row.currentPeriodEnd ? new Date(row.currentPeriodEnd) : null,
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
  };
}

export async function countUserMessagesSince(userId: number, since: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await ensureTables(db);
  const rows = await (db as any).execute(`
    SELECT COUNT(*)::int AS count
    FROM fg_messages
    WHERE "userId" = ${userId}
      AND role = 'user'
      AND "createdAt" >= ${sqlDate(since)}
  `);
  const row = (rows.rows || rows)[0];
  return Number(row?.count ?? 0);
}

export async function upsertSubscriptionStatus(input: {
  userId: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  status: string;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTables(db);
  await (db as any).execute(`
    INSERT INTO fg_subscriptions (
      "userId", "stripeCustomerId", "stripeSubscriptionId", "stripePriceId",
      status, "currentPeriodEnd", "cancelAtPeriodEnd", "updatedAt"
    )
    VALUES (
      ${input.userId},
      ${sqlString(input.stripeCustomerId)},
      ${sqlString(input.stripeSubscriptionId)},
      ${sqlString(input.stripePriceId)},
      ${sqlString(input.status)},
      ${sqlDate(input.currentPeriodEnd)},
      ${input.cancelAtPeriodEnd ? 1 : 0},
      NOW()
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "stripeCustomerId" = EXCLUDED."stripeCustomerId",
      "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
      "stripePriceId" = EXCLUDED."stripePriceId",
      status = EXCLUDED.status,
      "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
      "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
      "updatedAt" = NOW()
  `);
}

export async function recordStripeEvent(eventId: string, type: string | null): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTables(db);
  const rows = await (db as any).execute(`
    INSERT INTO fg_stripe_events ("eventId", type)
    VALUES (${sqlString(eventId)}, ${sqlString(type)})
    ON CONFLICT ("eventId") DO NOTHING
    RETURNING id
  `);
  return Boolean((rows.rows || rows)[0]);
}
