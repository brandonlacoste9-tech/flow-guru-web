# Flow Guru Troubleshooting Guide

## 1. The "A server error has occurred" / "Unexpected token 'A'" Error

### Symptom
When interacting with the tRPC endpoints (often noticed during voice synthesis or when sending a message), the frontend throws a JSON parsing error:
`Unexpected token 'A', "A server e"... is not valid JSON`

Simultaneously, features like Voice (`speakText`) or Dashboard widgets (weather, Spotify status) will appear completely broken or missing.

### Root Cause
This error occurs because the **Vercel Serverless/Edge Function crashed completely** before it could return a valid JSON response. Vercel automatically intercepts the crash and returns the plain text string `"A server error has occurred"` with an HTTP 500 status. The frontend tRPC client then attempts to `JSON.parse` this text, resulting in the "Unexpected token 'A'" error.

### Common Triggers
1. **JavaScript Syntax Errors**: Because `@vercel/node` may compile `api/*.ts` files on-the-fly and deploy even if strict type-checking is bypassed, a missing brace `}` or syntax error in a backend file (like `routers.ts` or `assistantActions.ts`) will cause the module initialization to crash instantly upon the first request.
2. **PostgreSQL Enum Mismatches**: If you add a new enum value to the Drizzle TypeScript schema (e.g., `fg_provider_type`) but fail to properly append it to the live PostgreSQL database via a DDL script (using `ALTER TYPE ... ADD VALUE`), Drizzle queries will trigger fatal database syntax errors. This forces the server endpoints to fail gracefully (or completely crash) when querying integration connections.
3. **ESM Import Failures**: Broken relative paths in dynamic imports (e.g., `await import("./db.js")`) can throw unhandled exceptions during runtime orchestration.

### How to Fix
1. **Run TypeScript Compiler Locally**: Always run `pnpm exec tsc --noEmit` before pushing backend changes to verify that no syntax or scoping errors exist.
2. **Check Database Migrations**: Ensure that all new Drizzle schema enums are explicitly added to the `api/lib/db.ts` initialization block:
   ```sql
   ALTER TYPE fg_provider_type ADD VALUE IF NOT EXISTS 'new-value';
   ```
3. **Check Vercel Logs**: In the Vercel dashboard, check the Runtime Logs for the exact stack trace of the unhandled exception that triggered the process exit.
