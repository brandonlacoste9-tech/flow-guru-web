import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userMemoryProfiles = mysqlTable("userMemoryProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  wakeUpTime: varchar("wakeUpTime", { length: 64 }),
  dailyRoutine: text("dailyRoutine"),
  preferencesSummary: text("preferencesSummary"),
  recurringEventsSummary: text("recurringEventsSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userMemoryFacts = mysqlTable(
  "userMemoryFacts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    category: mysqlEnum("category", ["wake_up_time", "daily_routine", "preference", "recurring_event", "general"]).notNull().default("general"),
    factKey: varchar("factKey", { length: 128 }),
    factValue: text("factValue").notNull(),
    confidence: int("confidence").default(100).notNull(),
    sourceMessageId: int("sourceMessageId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdx: index("userMemoryFacts_user_idx").on(table.userId),
    categoryIdx: index("userMemoryFacts_category_idx").on(table.category),
  }),
);

export const conversationThreads = mysqlTable(
  "conversationThreads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 255 }).default("Flow Guru Chat").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("conversationThreads_user_idx").on(table.userId),
    updatedIdx: index("conversationThreads_updated_idx").on(table.updatedAt),
  }),
);

export const conversationMessages = mysqlTable(
  "conversationMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    threadId: int("threadId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["system", "user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    threadIdx: index("conversationMessages_thread_idx").on(table.threadId),
    userIdx: index("conversationMessages_user_idx").on(table.userId),
    createdIdx: index("conversationMessages_created_idx").on(table.createdAt),
  }),
);

export const providerConnections = mysqlTable(
  "providerConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    provider: mysqlEnum("provider", ["google-calendar", "spotify"]).notNull(),
    status: mysqlEnum("status", ["not_connected", "pending", "connected", "error"]).default("pending").notNull(),
    externalAccountId: varchar("externalAccountId", { length: 255 }),
    externalAccountLabel: varchar("externalAccountLabel", { length: 255 }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    scope: text("scope"),
    tokenType: varchar("tokenType", { length: 64 }),
    expiresAtUnixMs: bigint("expiresAtUnixMs", { mode: "number" }),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userProviderUniqueIdx: uniqueIndex("providerConnections_user_provider_unique_idx").on(table.userId, table.provider),
    userProviderIdx: index("providerConnections_user_provider_idx").on(table.userId, table.provider),
    statusIdx: index("providerConnections_status_idx").on(table.status),
  }),
);

export type UserMemoryProfile = typeof userMemoryProfiles.$inferSelect;
export type InsertUserMemoryProfile = typeof userMemoryProfiles.$inferInsert;

export type UserMemoryFact = typeof userMemoryFacts.$inferSelect;
export type InsertUserMemoryFact = typeof userMemoryFacts.$inferInsert;

export type ConversationThread = typeof conversationThreads.$inferSelect;
export type InsertConversationThread = typeof conversationThreads.$inferInsert;

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type InsertConversationMessage = typeof conversationMessages.$inferInsert;

export type ProviderConnection = typeof providerConnections.$inferSelect;
export type InsertProviderConnection = typeof providerConnections.$inferInsert;
