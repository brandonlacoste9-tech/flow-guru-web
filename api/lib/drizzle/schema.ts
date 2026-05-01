import { pgTable, serial, text, varchar, timestamp, pgEnum, integer, index, bigint, customType } from "drizzle-orm/pg-core";

export const vector = customType<{ data: number[] }>({
  dataType(config) {
    return `vector(${config?.dimensions || 1536})`;
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: string) {
    return JSON.parse(value) as number[];
  }
});

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
  passwordHash: text("passwordHash"),
  promoCode: varchar("promoCode", { length: 64 }),
  resetToken: varchar("resetToken", { length: 128 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  // Referral & credits
  referralCode: varchar("referralCode", { length: 32 }),
  referredBy: varchar("referredBy", { length: 32 }),
  credits: integer("credits").default(0).notNull(),
  // Assistant persona
  personaName: varchar("personaName", { length: 64 }),
  personaStyle: varchar("personaStyle", { length: 64 }),
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
  alarmDays: varchar("alarmDays", { length: 32 }).default("0,1,2,3,4,5,6"),
  voiceId: varchar("voiceId", { length: 64 }),
  buddyPersonality: text("buddyPersonality"),
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
    shareToken: varchar("shareToken", { length: 64 }),
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

export const pushSubscriptions = pgTable("fg_push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const subscriptions = pgTable("fg_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId").unique(),
  stripePriceId: text("stripePriceId"),
  status: text("status").default("free").notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: integer("cancelAtPeriodEnd").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const stripeEvents = pgTable("fg_stripe_events", {
  id: serial("id").primaryKey(),
  eventId: text("eventId").notNull().unique(),
  type: text("type"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const lists = pgTable("fg_lists", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const listItems = pgTable("fg_list_items", {
  id: serial("id").primaryKey(),
  listId: integer("listId").notNull(),
  userId: integer("userId").notNull(),
  content: text("content").notNull(),
  completed: integer("completed").default(0).notNull(),
  reminderAt: timestamp("reminderAt"),
  locationTrigger: text("locationTrigger"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type UserMemoryProfile = typeof userMemoryProfiles.$inferSelect;
export type UserMemoryFact = typeof userMemoryFacts.$inferSelect;
export type ConversationThread = typeof conversationThreads.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type ProviderConnection = typeof providerConnections.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type StripeEvent = typeof stripeEvents.$inferSelect;
export type List = typeof lists.$inferSelect;
export type ListItem = typeof listItems.$inferSelect;

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
    color: varchar("color", { length: 32 }).default("blue"),
    reminderMinutes: text("reminderMinutes").default("30,15,5"),
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

export const waitlist = pgTable("fg_waitlist", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  source: varchar("source", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const subscriptions = pgTable("fg_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).unique(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }).unique(),
  status: varchar("status", { length: 64 }).notNull().default("inactive"),
  plan: varchar("plan", { length: 64 }).notNull().default("free"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const embeddings = pgTable("fg_embeddings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON string
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("fg_embeddings_user_idx").on(table.userId),
}));

export const stripeEvents = pgTable("fg_stripe_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
});

export type Waitlist = typeof waitlist.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type StripeEvent = typeof stripeEvents.$inferSelect;
