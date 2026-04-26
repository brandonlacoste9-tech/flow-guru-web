# Flow Guru Web: Architectural Overview

## 1. Introduction

Flow Guru Web is a full-stack web application designed to act as an intelligent personal assistant. It integrates calendar, lists, weather, news, and music playback, all orchestrated through an AI assistant. The stack emphasizes performance, type safety, and scalability.

## 2. Overall Architecture

Client-server monorepo. Client/server communicate primarily via tRPC, with Express REST endpoints for select third-party integrations. Deployed on Vercel.

- Frontend: React + Vite + TypeScript, Tailwind CSS, Radix UI, Framer Motion, Wouter routing
- Backend: Node.js Express + tRPC
- Database: **MySQL** via Drizzle ORM (`drizzle-orm/mysql-core`)
- AI core: LLM-based intent classification and tool orchestration
- `shared/` for cross-stack types and constants

## 3. Frontend (Client)

Lives in `client/`. SPA built on React 19.2.1, Vite 7.1.7, TypeScript 5.9.3, Tailwind 4.1.14, Radix UI, Framer Motion 12.23.22, Wouter 3.7.1. State and data via TanStack Query 5.90.2 + tRPC client 11.6.0.

### Key Frontend Files

| File | Description |
| :-- | :-- |
| `client/src/main.tsx` | Entry. Initializes TanStack Query and tRPC clients, wraps `App` with providers. |
| `client/src/App.tsx` | App structure + Wouter routing, lazy-loaded pages, theming/language contexts. |
| `client/src/pages/Home.tsx` | Dashboard / chat interface. Assistant, weather, calendar, onboarding. |
| `client/src/pages/Calendar.tsx` | Event CRUD via tRPC. |
| `client/src/pages/Lists.tsx` | Lists CRUD via tRPC. |
| `client/src/pages/Blog.tsx` / `BlogPost.tsx` | Blog index + post template (commit 31ae876). |
| `client/src/_core/hooks/useAuth.ts` | Auth hook via `trpc.auth.me` + `localStorage`. |

## 4. Backend (Server)

Lives in `server/`. Node + Express 4.21.2 + tRPC 11.6.0. Drizzle ORM 0.45.2 against MySQL.

### Key Backend Files

| File | Description |
| :-- | :-- |
| `server/_core/index.ts` | Express app init, tRPC middleware, body parsers, health endpoints, integration routes. Dev=Vite middleware, Prod=static + Vercel serverless export. |
| `server/routers.ts` | Root tRPC router (`appRouter`): auth, assistant, calendar, lists, settings. Defines `ASSISTANT_TOOLS` + memory/name helpers. |
| `server/assistantActions.ts` | AI action taxonomy, Zod schemas, `planAssistantAction`, `executeAssistantAction`. Weather/news/geocoding/calendar helpers. |
| `server/_core/providerConnections.ts` | Google Calendar + Spotify OAuth status/start/callback routes. Uses `sdk.authenticateRequest`. |
| `server/_core/llm.ts` | LLM invocation for intent classification + memory extraction. |
| `server/_core/sdk.ts` | Auth SDK (`authenticateRequest`). |
| `server/_core/trpc.ts` | tRPC server setup. |
| `server/_core/vite.ts` | Dev-mode Vite middleware. |
| `server/db.ts` | Re-exports DB layer from `api/lib/db.js`. |

### Additional backend modules

- `_core/elevenLabs.ts` — ElevenLabs voice synthesis
- `_core/voiceTranscription.ts` — speech-to-text
- `_core/imageGeneration.ts` — AI image generation
- `_core/briefing.ts` — daily briefing composer
- `_core/reminders.ts` — reminder scheduling
- `_core/push.ts`, `_core/notification.ts` — push/notifications
- `_core/map.ts` — map/geocoding
- `_core/crypto.ts` — crypto utilities
- `_core/cookies.ts` — cookie helpers
- `_core/oauth.ts` — generic OAuth primitives
- `_core/spotify.ts` — Spotify token refresh/retry
- `_core/googleCalendar.ts` — Google Calendar API client
- `_core/storageProxy.ts`, `server/storage.ts` — storage (S3 via `@aws-sdk/client-s3`)
- `_core/systemRouter.ts` — system-level Express router
- `_core/env.ts` — environment loading/validation
- `_core/dataApi.ts` — data API helpers

## 5. Shared

`shared/const.ts` defines shared constants (e.g., `COOKIE_NAME`). `shared/types.ts` contains cross-stack TypeScript types.

## 6. Database Schema

Defined in `drizzle/schema.ts` using `drizzle-orm/mysql-core` (MySQL). Migrations in `drizzle/migrations/` and SQL files (`0000_*.sql` … `0003_*.sql`).

| Table | Description |
| :-- | :-- |
| `users` | Core user (openId, name, email, loginMethod, role, timestamps, lastSignedIn). |
| `userMemoryProfiles` | Summarized prefs/routines (wakeUpTime, dailyRoutine, preferencesSummary). |
| `userMemoryFacts` | Granular durable facts, categorized. |
| `conversationThreads` | Threads linking messages to users. |
| `conversationMessages` | Messages with role + content. |
| `providerConnections` | Google Calendar / Spotify tokens + status. |
| `localEvents` | User-created local events. |

## 7. Top-Level Directories

- `api/` — Vercel serverless endpoints, DB layer (`api/lib/db.js`)
- `mobile/` — mobile app (own `package-lock.json`)
- `client/`, `server/`, `shared/`, `drizzle/`, `db/`
- `supabase/` — Supabase config (reconcile with MySQL Drizzle usage)
- `openclaw/`, `patches/`, `scripts/`

## 8. Development Workflow

- `dev`: `tsx watch server/_core/index.ts`
- `build`: sitemap gen + `vite build` + esbuild server
- `start`: `NODE_ENV=production node dist/index.js`
- `check`: `tsc --noEmit`
- `format`: `prettier --write .`
- `test`: `vitest run`
- `db:push`: `drizzle-kit generate && drizzle-kit migrate`

Node `>=20`. pnpm 10.4.1. License MIT. Tests cover assistant router, assistant actions, auth logout, Google OAuth credentials, Google Calendar core.

## 9. Conclusion

TypeScript across the stack, tRPC for type-safe APIs, Drizzle ORM (MySQL) for the data layer, and a dedicated AI assistant orchestration layer combine to form a responsive personal-assistant platform. OAuth-based third-party integrations (Google Calendar, Spotify) extend its reach.
