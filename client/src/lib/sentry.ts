import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function initClientSentry() {
  if (initialized || !dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
  });

  initialized = true;
}

export function captureClientException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
) {
  if (!dsn) return;
  initClientSentry();

  Sentry.withScope(scope => {
    if (context?.tags) scope.setTags(context.tags);
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}
