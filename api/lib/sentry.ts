import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN;

let initialized = false;

export function initServerSentry() {
  if (initialized || !dsn) return;

  const init = Sentry.init as (options: {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: number;
  }) => void;

  init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  });

  initialized = true;
}

export function captureServerException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
) {
  if (!dsn) return;
  initServerSentry();

  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
  } as any);
}
