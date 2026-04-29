import type { VercelRequest } from "@vercel/node";
import { ENV } from "./env.js";

/**
 * OAuth redirect_uri sent to Google (must match Google Cloud Console exactly).
 * Prefer PUBLIC_APP_URL / INTEGRATION_BROWSER_BASE in production so the URI is stable
 * regardless of www vs apex or preview host headers.
 */
export function getGoogleAuthCallbackUrl(req: VercelRequest): string {
  const configured = ENV.publicAppUrl?.replace(/\/$/, "");
  if (configured) {
    return `${configured}/api/auth/google/callback`;
  }
  const proto =
    (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || "https";
  const host =
    (req.headers["x-forwarded-host"] as string) || req.headers.host || "floguru.com";
  return `${proto}://${host}/api/auth/google/callback`;
}
