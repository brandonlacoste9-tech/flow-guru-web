CREATE TYPE "public"."fg_connection_status" AS ENUM('not_connected', 'pending', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."fg_memory_category" AS ENUM('wake_up_time', 'daily_routine', 'preference', 'recurring_event', 'general');--> statement-breakpoint
CREATE TYPE "public"."fg_provider_type" AS ENUM('google-calendar');--> statement-breakpoint
CREATE TYPE "public"."fg_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."fg_message_role" AS ENUM('system', 'user', 'assistant');--> statement-breakpoint
CREATE TABLE "fg_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"threadId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "fg_message_role" NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) DEFAULT 'Flow Guru Chat' NOT NULL,
	"shareToken" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastMessageAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"listId" integer NOT NULL,
	"userId" integer NOT NULL,
	"content" text NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"reminderAt" timestamp,
	"locationTrigger" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"icon" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_local_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp NOT NULL,
	"location" text,
	"allDay" integer DEFAULT 0 NOT NULL,
	"color" varchar(32) DEFAULT 'blue',
	"reminderMinutes" text DEFAULT '30,15,5',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"provider" "fg_provider_type" NOT NULL,
	"status" "fg_connection_status" DEFAULT 'pending' NOT NULL,
	"externalAccountId" varchar(255),
	"externalAccountLabel" varchar(255),
	"accessToken" text,
	"refreshToken" text,
	"scope" text,
	"tokenType" varchar(64),
	"expiresAtUnixMs" bigint,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fg_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "fg_stripe_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" text NOT NULL,
	"type" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fg_stripe_events_eventId_unique" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE TABLE "fg_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"stripePriceId" text,
	"status" text DEFAULT 'free' NOT NULL,
	"currentPeriodEnd" timestamp,
	"cancelAtPeriodEnd" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fg_subscriptions_userId_unique" UNIQUE("userId"),
	CONSTRAINT "fg_subscriptions_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId")
);
--> statement-breakpoint
CREATE TABLE "fg_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"category" "fg_memory_category" DEFAULT 'general' NOT NULL,
	"factKey" varchar(128),
	"factValue" text NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"sourceMessageId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fg_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"wakeUpTime" varchar(64),
	"dailyRoutine" text,
	"preferencesSummary" text,
	"recurringEventsSummary" text,
	"alarmSound" varchar(64) DEFAULT 'chime',
	"alarmDays" varchar(32) DEFAULT '0,1,2,3,4,5,6',
	"voiceId" varchar(64),
	"buddyPersonality" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fg_profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "fg_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"passwordHash" text,
	"promoCode" varchar(64),
	"resetToken" varchar(128),
	"resetTokenExpiresAt" timestamp,
	"referralCode" varchar(32),
	"referredBy" varchar(32),
	"credits" integer DEFAULT 0 NOT NULL,
	"personaName" varchar(64),
	"personaStyle" varchar(64),
	"role" "fg_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fg_users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "fg_local_events_user_idx" ON "fg_local_events" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "fg_local_events_start_idx" ON "fg_local_events" USING btree ("startAt");--> statement-breakpoint
CREATE INDEX "fg_facts_user_idx" ON "fg_facts" USING btree ("userId");