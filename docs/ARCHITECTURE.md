# Flow Guru Web: Architectural Overview

## 1. Introduction

Flow Guru Web is a full-stack web application designed to act as an intelligent personal assistant. It integrates calendar, lists, weather, news, and music playback, all orchestrated through an AI assistant. The stack emphasizes performance, type safety, and scalability.

## 2. Overall Architecture

Client-server monorepo. Client/server communicate primarily via tRPC, with Express REST endpoints for select third-party integrations. Deployed on Vercel.

- Frontend: React + Vite + TypeScript, Tailwind CSS, Radix UI, Framer Motion, Wouter routing
- Backend: Node.js Express + tRPC
- Database: **Postgres** (e.g. Neon) via `postgres` + Drizzle (`drizzle-orm/pg-core`); runtime entrypoint `api/lib/db.ts`
- AI core: LLM-based intent classification and tool orchestration
- `shared/` for cross-stack types and constants

## 3. Frontend (Client)

Lives in `client/`. SPA built on React ^19.2.1, Vite ^7.1.7, TypeScript 5.9.3, Tailwind CSS ^4.2.4, Radix UI, Framer Motion ^12.23.22, Wouter 3.7.1. State and data via TanStack Query ^5.100.5 + tRPC client ^11.6.0 (see root `package.json` for resolved versions).

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

Lives in `server/`. Node + Express 5.x + tRPC 11.6.0. Persistence goes through `api/lib/db.ts` (Postgres / Drizzle).

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

## 6. Database Schema (production)

**Source of truth:** `api/lib/drizzle/schema.ts` — Postgres tables prefixed `fg_*`, consumed by `api/lib/db.ts`.

| Physical table | Logical entity |
| :-- | :-- |
| `fg_users` | Core user (openId, auth fields, persona, referrals). |
| `fg_profiles` | Memory profile / prefs (wake time, voice, alarms). |
| `fg_facts` | Durable memory facts. |
| `fg_threads` / `fg_messages` | Conversation threads and messages. |
| `fg_connections` | OAuth provider tokens (e.g. Google Calendar). |
| `fg_local_events` | In-app calendar events. |
| `fg_lists` / `fg_list_items` | Lists feature. |
| `fg_push_subscriptions` | Web push endpoints. |
| `fg_subscriptions` / `fg_stripe_events` | Stripe billing sync and idempotency. |

Legacy `drizzle/schema.ts` at repo root (MySQL-shaped) is **not** used by `api/lib/db.ts`. See §10.

## 7. Top-Level Directories

- `api/` — Vercel serverless endpoints, DB layer (`api/lib/db.js`)
- `mobile/` — mobile app (own `package-lock.json`)
- `client/`, `server/`, `shared/`, `db/`
- `drizzle/` at repo root — legacy duplicate migration SQL + old schema stub; **`drizzle.config.ts` writes to `api/lib/drizzle/`** (see §10)
- `supabase/` — Supabase SQL snapshots (not wired to `api/lib/db.ts`; see §10)
- `openclaw/`, `patches/`, `scripts/`

## 8. Development Workflow

- `dev`: `tsx watch server/_core/index.ts`
- `build`: sitemap gen + `vite build` + esbuild server
- `start`: `NODE_ENV=production node dist/index.js`
- `check`: `tsc --noEmit`
- `format`: `prettier --write .`
- `test`: `vitest run`
- `test:e2e`: Playwright smoke (`PLAYWRIGHT_BASE_URL` optional; see `playwright.config.ts`)
- `db:generate` / `db:migrate`: Drizzle Kit against `drizzle.config.ts` (requires `DATABASE_URL`)
- `db:push`: runs `db:generate` then `db:migrate` (full migration pipeline)

**Drizzle migrations:** Production schema migrations live under **`api/lib/drizzle/`** as Postgres SQL (see `0000_baseline_pg.sql`). Run migrations against **empty** databases or new branches. If your Neon DB **already** has `fg_*` tables (e.g. created by runtime DDL in `api/lib/db.ts`), treat this baseline as already applied: record it in Drizzle’s migration history **without** re-executing conflicting `CREATE` statements, or rely on idempotent app DDL only — otherwise `migrate` may fail with “already exists.”

Node `>=20`. pnpm 10.4.1. License MIT. Tests cover assistant router, assistant actions, auth logout, Google OAuth credentials, Google Calendar core.

## 9. Conclusion

TypeScript across the stack, tRPC for type-safe APIs, Drizzle ORM on **Postgres** for the data layer, and a dedicated AI assistant orchestration layer combine to form a responsive personal-assistant platform. OAuth-based third-party integrations (e.g. Google Calendar) extend its reach.

## 10. Legacy / alternate schema files

The repo still contains **older or parallel** schema artifacts. Production traffic uses **`api/lib/drizzle/schema.ts` + `api/lib/db.ts`** only.

| Path | Notes |
| :-- | :-- |
| `drizzle/schema.ts` | MySQL-shaped Drizzle artifact — **not** imported by `api/lib/db.ts`. |
| `drizzle/*.sql` + `drizzle/meta/` (repo root) | **Obsolete** MySQL-era migrations and snapshots — **do not use**. Canonical migrations are **`api/lib/drizzle/`** (Postgres `0000_baseline_pg.sql` + `meta/`). |
| `supabase/schema.sql` | Standalone Supabase-oriented SQL — **not** consumed by `api/lib/db.ts`. |

The DB layer uses `drizzle-orm/postgres-js` against Postgres (typically Neon) and may apply idempotent `CREATE TABLE IF NOT EXISTS …` DDL when tables are missing.

### Recommended cleanup (backlog)

1. Remove or relocate root `drizzle/schema.ts` and root **`drizzle/*.sql` / `meta/`** once CI/scripts no longer reference them.
2. Document or delete `supabase/` based on whether any workflow still references it.
