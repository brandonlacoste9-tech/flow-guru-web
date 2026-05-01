# Flow Guru: The Sovereign Personal Manual 🏛️

> **AI Personal Assistant for Daily Planning**
> *Your private, autonomous lifestyle companion.*

Flow Guru is a premium, high-performance AI assistant designed to manage your daily schedule, weather, and personal knowledge with an emphasis on privacy and "buddy-like" interaction.

## 🚀 Quick Start

### Prerequisites
- Node.js (>= 20)
- pnpm

### Installation
```bash
pnpm install
```

### Development
```bash
pnpm dev
```

### Production Build
```bash
pnpm build
pnpm start
```

## 🏗️ Architecture

Flow Guru follows a modern, full-stack architecture with a clear separation of concerns, unified within a single repository structure:

- **`/client`**: Vite + React 19 + Tailwind CSS + Framer Motion. A high-performance, responsive frontend with "Tan Leather" premium aesthetics.
- **`/server` & `/api`**: Node.js + Express + tRPC. 
    - `/api` serves as the Vercel serverless entry point.
    - `/server` contains core logic and standalone server entry.
- **`/shared`**: Shared TypeScript types and constants.
- **`/mobile`**: Expo-based mobile integration.
- **`/db`**: Drizzle ORM for database management with a relational schema (Postgres).

## 🛡️ Security Model

- **Authentication**: Powered by [Clerk](https://clerk.com/) with Google OAuth integration and Guest mode support.
- **API Safety**:
    - **Rate Limiting**: Custom tRPC middleware prevents abuse on critical assistant endpoints.
    - **Headers**: Strict CSP, HSTS, and XSS protection configured via `vercel.json`.
- **Data Privacy**: Personal facts and memory are stored securely and processed with local-first awareness.

## 💎 Features

- **Conversational AI**: Context-aware assistant ("FLO GURU") with a custom "Buddy" personality and vector-based semantic memory.
- **Tool Integration**:
    - **Google Calendar**: Real-time event syncing and scheduling.
    - **Weather**: Proactive weather updates based on user location.
    - **Music**: Integrated station playback (Spotify integration supported).
    - **Lists**: Smart collection management (Grocery, Todo, etc.).
- **Speech**: ElevenLabs integration for high-quality voice synthesis.
- **Push Notifications**: WebPush support for reminders and proactive briefings.

## 📊 Performance & Analytics

- **Vite**: Fast HMR and optimized production bundles.
- **tRPC**: Type-safe, efficient data fetching with minimal overhead.
- **Monitoring**: Integrated with Vercel Analytics and Speed Insights for usage tracking.

## 🛠️ Governance

- **Linting**: ESLint with TypeScript and React Hooks plugins.
- **Formatting**: Prettier for consistent code style.
- **Testing**: Vitest for unit and integration testing.

---

*Flow Guru is built for those who value sovereign digital infrastructure.*
