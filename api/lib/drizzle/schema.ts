import { pgTable, serial, text, varchar, timestamp, pgEnum, integer, index, bigint } from "drizzle-orm/pg-core";

// Enums with unique names to avoid collisions in shared DB
export const roleEnum = pgEnum("fg_role", ["user", "admin"]);
export const memoryCategoryEnum = pgEnum("fg_memory_category", ["wake_up_time", "daily_routine", "preference", "recurring_event", "general"]);
export const roleMessageEnum = pgEnum("fg_message_role", ["system", "user", "assistant"]);
export const providerTypeEnum = pgEnum("fg_provider_type", ["google-calendar", "spotify"]);
export const connectionStatusEnum = pgEnum("fg_connection_status", ["not_connected", "pending", "connected", "error"]);

export const users = pgTable("fg_users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userMemoryProfiles = pgTable("fg_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  wakeUpTime: varchar("wakeUpTime", { length: 64 }),
  dailyRoutine: text("dailyRoutine"),
  preferencesSummary: text("preferencesSummary"),
  recurringEventsSummary: text("recurringEventsSummary"),
  alarmSound: varchar("alarmSound", { length: 64 }).default("chime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const userMemoryFacts = pgTable(
  "fg_facts",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    category: memoryCategoryEnum("category").notNull().default("general"),
    factKey: varchar("factKey", { length: 128 }),
    factValue: text("factValue").notNull(),
    confidence: integer("confidence").default(100).notNull(),
    sourceMessageId: integer("sourceMessageId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("fg_facts_user_idx").on(table.userId),
  })
);

export const conversationThreads = pgTable(
  "fg_threads",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    title: varchar("title", { length: 255 }).default("Flow Guru Chat").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  }
);

export const conversationMessages = pgTable(
  "fg_messages",
  {
    id: serial("id").primaryKey(),
    threadId: integer("threadId").notNull(),
    userId: integer("userId").notNull(),
    role: roleMessageEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export const providerConnections = pgTable(
  "fg_connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    provider: providerTypeEnum("provider").notNull(),
    status: connectionStatusEnum("status").default("pending").notNull(),
    externalAccountId: varchar("externalAccountId", { length: 255 }),
    externalAccountLabel: varchar("externalAccountLabel", { length: 255 }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    scope: text("scope"),
    tokenType: varchar("tokenType", { length: 64 }),
    expiresAtUnixMs: bigint("expiresAtUnixMs", { mode: "number" }),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  }
);

export type User = typeof users.$inferSelect;
export type UserMemoryProfile = typeof userMemoryProfiles.$inferSelect;
export type UserMemoryFact = typeof userMemoryFacts.$inferSelect;
export type ConversationThread = typeof conversationThreads.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type ProviderConnection = typeof providerConnections.$inferSelect;

export const localEvents = pgTable(
  "fg_local_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    startAt: timestamp("startAt").notNull(),
    endAt: timestamp("endAt").notNull(),
    location: text("location"),
    allDay: integer("allDay").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("fg_local_events_user_idx").on(table.userId),
    startIdx: index("fg_local_events_start_idx").on(table.startAt),
  })
);

export type LocalEvent = typeof localEvents.$inferSelect;
export type InsertLocalEvent = typeof localEvents.$inferInsert;
