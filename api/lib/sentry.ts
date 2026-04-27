import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN;

let initialized = false;

export function initServerSentry() {
  if (initialized || !dsn) return;

  Sentry.init({
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

  Sentry.withScope(scope => {
    if (context?.tags) scope.setTags(context.tags);
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}
